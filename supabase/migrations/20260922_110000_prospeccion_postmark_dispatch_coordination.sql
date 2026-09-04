BEGIN;

-- Postmark tiene una cola propia: el envío real ocurre en postmark-worker,
-- después de que prospeccion_contact_sender encola el mensaje. La misma RPC
-- debe poder reservar ambos puntos sin confundirlos.
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
    v_postmark_dispatch boolean;
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

    v_postmark_dispatch := (
        v_envio.estado = 'enviado'
        AND v_envio.canal = 'correo'
        AND v_envio.mensaje_id IS NULL
        AND v_envio.mensaje_id_interno IS NOT NULL
    );

    IF v_envio.estado <> 'procesando' AND NOT v_postmark_dispatch THEN
        RETURN QUERY SELECT false, NULL::timestamptz, NULL::timestamptz, NULL::numeric, 'envio_no_reservable'::text;
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
        IF NOT v_postmark_dispatch THEN
            UPDATE public.prospeccion_contacto_envio
            SET estado = 'pendiente',
                programado_en = v_next,
                error = 'separacion_en_curso'
            WHERE id = v_envio.id;
        END IF;

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
