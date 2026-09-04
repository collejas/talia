BEGIN;

-- La separación es una regla operativa del envío, no una preferencia escondida
-- en metadata. Se conserva por envío para que los reintentos respeten la
-- configuración original del lote.
ALTER TABLE public.prospeccion_contacto_envio
    ADD COLUMN IF NOT EXISTS separacion_segundos integer NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS despacho_iniciado_en timestamptz,
    ADD COLUMN IF NOT EXISTS proveedor_aceptado_en timestamptz,
    ADD COLUMN IF NOT EXISTS entregado_en timestamptz,
    ADD COLUMN IF NOT EXISTS leido_en timestamptz;

UPDATE public.prospeccion_contacto_envio e
SET separacion_segundos = GREATEST(
    5,
    LEAST(
        3600,
        CASE
            WHEN (b.metadata ->> 'separacion_segundos') ~ '^[0-9]+$'
                THEN (b.metadata ->> 'separacion_segundos')::integer
            ELSE 5
        END
    )
)
FROM public.prospeccion_contacto_batch b
WHERE b.id = e.batch_id
  AND COALESCE(b.metadata ->> 'separacion_segundos', '5') <> '5';

ALTER TABLE public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_separacion_ck
    CHECK (separacion_segundos BETWEEN 5 AND 3600);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_dispatch_idx
    ON public.prospeccion_contacto_envio (organizacion_id, canal, despacho_iniciado_en);

-- Un único reloj por organización y canal. El bloqueo de la fila serializa
-- workers concurrentes y evita que dos procesos salgan al mismo tiempo.
CREATE TABLE IF NOT EXISTS public.prospeccion_envio_rate_limit (
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    canal text NOT NULL CHECK (canal IN ('correo', 'whatsapp', 'llamada')),
    siguiente_despacho_permitido_en timestamptz NOT NULL DEFAULT now(),
    ultimo_envio_id uuid REFERENCES public.prospeccion_contacto_envio(id) ON DELETE SET NULL,
    ultimo_despacho_iniciado_en timestamptz,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organizacion_id, canal)
);

ALTER TABLE public.prospeccion_envio_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_envio_rate_limit FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS prospeccion_envio_rate_limit_updated_idx
    ON public.prospeccion_envio_rate_limit (actualizado_en);

CREATE OR REPLACE FUNCTION public.reserve_prospeccion_envio_dispatch(
    p_envio_id uuid
)
RETURNS TABLE (
    permitido boolean,
    siguiente_despacho_permitido_en timestamptz,
    despacho_iniciado_en timestamptz,
    espera_segundos numeric,
    motivo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_envio public.prospeccion_contacto_envio%ROWTYPE;
    v_rate public.prospeccion_envio_rate_limit%ROWTYPE;
    v_now timestamptz := clock_timestamp();
    v_next timestamptz;
    v_separacion integer;
BEGIN
    SELECT *
    INTO v_envio
    FROM public.prospeccion_contacto_envio
    WHERE id = p_envio_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::timestamptz, NULL::timestamptz, NULL::numeric, 'envio_no_encontrado'::text;
        RETURN;
    END IF;

    IF v_envio.estado <> 'procesando' THEN
        RETURN QUERY SELECT false, NULL::timestamptz, NULL::timestamptz, NULL::numeric, 'envio_no_procesando'::text;
        RETURN;
    END IF;

    v_separacion := GREATEST(5, LEAST(3600, COALESCE(v_envio.separacion_segundos, 5)));

    INSERT INTO public.prospeccion_envio_rate_limit (organizacion_id, canal)
    VALUES (v_envio.organizacion_id, v_envio.canal)
    ON CONFLICT (organizacion_id, canal) DO NOTHING;

    SELECT *
    INTO v_rate
    FROM public.prospeccion_envio_rate_limit
    WHERE organizacion_id = v_envio.organizacion_id
      AND canal = v_envio.canal
    FOR UPDATE;

    IF v_rate.siguiente_despacho_permitido_en > v_now THEN
        v_next := v_rate.siguiente_despacho_permitido_en;
        UPDATE public.prospeccion_contacto_envio
        SET estado = 'pendiente',
            programado_en = v_next,
            error = 'separacion_en_curso'
        WHERE id = v_envio.id;

        RETURN QUERY SELECT
            false,
            v_next,
            NULL::timestamptz,
            EXTRACT(EPOCH FROM (v_next - v_now)),
            'separacion_en_curso'::text;
        RETURN;
    END IF;

    v_next := v_now + make_interval(secs => v_separacion);

    UPDATE public.prospeccion_envio_rate_limit
    SET siguiente_despacho_permitido_en = v_next,
        ultimo_envio_id = v_envio.id,
        ultimo_despacho_iniciado_en = v_now,
        actualizado_en = v_now
    WHERE organizacion_id = v_envio.organizacion_id
      AND canal = v_envio.canal;

    UPDATE public.prospeccion_contacto_envio
    SET despacho_iniciado_en = v_now
    WHERE id = v_envio.id;

    RETURN QUERY SELECT true, v_next, v_now, 0::numeric, 'ok'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_prospeccion_envio_dispatch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_prospeccion_envio_dispatch(uuid) TO service_role;

COMMIT;
