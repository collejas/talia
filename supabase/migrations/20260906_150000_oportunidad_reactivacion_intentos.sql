BEGIN;

-- Registro explícito de acciones manuales de recuperación. No envía mensajes.
CREATE TABLE IF NOT EXISTS public.oportunidad_reactivacion_intentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    oportunidad_id uuid NOT NULL,
    usuario_id uuid,
    canal text NOT NULL,
    resultado text NOT NULL DEFAULT 'registrado',
    intentado_en timestamptz NOT NULL DEFAULT now(),
    respondio_en timestamptz,
    motivo text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT oportunidad_reactivacion_intentos_org_opp_fkey
        FOREIGN KEY (organizacion_id, oportunidad_id)
        REFERENCES public.oportunidades (organizacion_id, id) ON DELETE CASCADE,
    CONSTRAINT oportunidad_reactivacion_intentos_canal_chk
        CHECK (canal IN ('whatsapp', 'correo', 'llamada', 'sms', 'webchat', 'otro')),
    CONSTRAINT oportunidad_reactivacion_intentos_resultado_chk
        CHECK (resultado IN ('registrado', 'sin_respuesta', 'respondio', 'reactivada', 'rechazado', 'no_contactar')),
    CONSTRAINT oportunidad_reactivacion_intentos_motivo_length_chk
        CHECK (motivo IS NULL OR char_length(motivo) <= 1000)
);

CREATE INDEX IF NOT EXISTS oportunidad_reactivacion_intentos_org_opp_fecha_idx
    ON public.oportunidad_reactivacion_intentos (organizacion_id, oportunidad_id, intentado_en DESC);
CREATE INDEX IF NOT EXISTS oportunidad_reactivacion_intentos_org_canal_fecha_idx
    ON public.oportunidad_reactivacion_intentos (organizacion_id, canal, intentado_en DESC);
CREATE INDEX IF NOT EXISTS oportunidad_reactivacion_intentos_org_resultado_fecha_idx
    ON public.oportunidad_reactivacion_intentos (organizacion_id, resultado, intentado_en DESC);

ALTER TABLE public.oportunidad_reactivacion_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.oportunidad_reactivacion_intentos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.oportunidad_reactivacion_intentos TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_intento_reactivacion(
    p_organizacion_id uuid,
    p_oportunidad_id uuid,
    p_usuario_id uuid,
    p_canal text,
    p_resultado text DEFAULT 'registrado',
    p_motivo text DEFAULT NULL,
    p_intentado_en timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_oportunidad public.oportunidades%ROWTYPE;
    v_config public.oportunidad_seguimiento_configuracion%ROWTYPE;
    v_intento public.oportunidad_reactivacion_intentos%ROWTYPE;
    v_reactivada boolean := p_resultado = 'reactivada';
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    SELECT * INTO v_oportunidad
    FROM public.oportunidades
    WHERE organizacion_id = p_organizacion_id AND id = p_oportunidad_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'opportunity_not_found';
    END IF;
    IF v_oportunidad.estado <> 'abierta' THEN
        RAISE EXCEPTION 'opportunity_not_open';
    END IF;

    SELECT * INTO v_config
    FROM public.oportunidad_seguimiento_configuracion
    WHERE organizacion_id = p_organizacion_id;

    INSERT INTO public.oportunidad_reactivacion_intentos
        (organizacion_id, oportunidad_id, usuario_id, canal, resultado, intentado_en, respondio_en, motivo)
    VALUES
        (p_organizacion_id, p_oportunidad_id, p_usuario_id, p_canal, p_resultado,
         COALESCE(p_intentado_en, now()),
         CASE WHEN p_resultado IN ('respondio', 'reactivada') THEN COALESCE(p_intentado_en, now()) END,
         NULLIF(btrim(p_motivo), ''))
    RETURNING * INTO v_intento;

    UPDATE public.oportunidades
    SET ultimo_intento_reactivacion_en = v_intento.intentado_en,
        intentos_reactivacion = COALESCE(intentos_reactivacion, 0) + 1,
        estrategia_seguimiento = CASE WHEN p_resultado = 'no_contactar' THEN 'no_contactar' ELSE 'reactivacion' END,
        estado_seguimiento = CASE WHEN v_reactivada THEN 'activo' ELSE estado_seguimiento END,
        reactivada_en = CASE WHEN v_reactivada THEN v_intento.intentado_en ELSE reactivada_en END,
        numero_reactivaciones = CASE WHEN v_reactivada THEN COALESCE(numero_reactivaciones, 0) + 1 ELSE numero_reactivaciones END,
        actualizado_en = now()
    WHERE organizacion_id = p_organizacion_id AND id = p_oportunidad_id;

    INSERT INTO public.oportunidad_eventos
        (organizacion_id, oportunidad_id, tipo_evento, estado_anterior, estado_nuevo,
         estrategia_anterior, estrategia_nueva, valor_oportunidad, usuario_id, canal,
         ventana_atribucion_dias, motivo)
    VALUES
        (p_organizacion_id, p_oportunidad_id, 'INTENTO_REACTIVACION',
         v_oportunidad.estado_seguimiento,
         CASE WHEN v_reactivada THEN 'activo' ELSE v_oportunidad.estado_seguimiento END,
         v_oportunidad.estrategia_seguimiento,
         CASE WHEN p_resultado = 'no_contactar' THEN 'no_contactar' ELSE 'reactivacion' END,
         v_oportunidad.monto_estimado, p_usuario_id, p_canal,
         COALESCE(v_config.ventana_reactivacion_dias, 30),
         NULLIF(btrim(p_motivo), ''));

    IF v_reactivada THEN
        INSERT INTO public.oportunidad_eventos
            (organizacion_id, oportunidad_id, tipo_evento, estado_anterior, estado_nuevo,
             estrategia_anterior, estrategia_nueva, valor_oportunidad, usuario_id, canal,
             ventana_atribucion_dias, motivo)
        VALUES
            (p_organizacion_id, p_oportunidad_id, 'OPORTUNIDAD_REACTIVADA',
             v_oportunidad.estado_seguimiento, 'activo',
             v_oportunidad.estrategia_seguimiento, 'reactivacion',
             v_oportunidad.monto_estimado, p_usuario_id, p_canal,
             COALESCE(v_config.ventana_reactivacion_dias, 30),
             NULLIF(btrim(p_motivo), ''));
    END IF;

    RETURN jsonb_build_object(
        'id', v_intento.id,
        'organizacion_id', v_intento.organizacion_id,
        'oportunidad_id', v_intento.oportunidad_id,
        'canal', v_intento.canal,
        'resultado', v_intento.resultado,
        'intentado_en', v_intento.intentado_en,
        'reactivada', v_reactivada
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_intentos_reactivacion_lote(
    p_organizacion_id uuid,
    p_oportunidad_ids uuid[],
    p_usuario_id uuid,
    p_canal text,
    p_resultado text DEFAULT 'registrado',
    p_motivo text DEFAULT NULL,
    p_intentado_en timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_oportunidad_id uuid;
    v_items jsonb := '[]'::jsonb;
    v_procesadas integer := 0;
    v_fallidas integer := 0;
    v_resultado jsonb;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF p_oportunidad_ids IS NULL OR cardinality(p_oportunidad_ids) = 0 THEN
        RAISE EXCEPTION 'empty_opportunity_batch';
    END IF;
    IF cardinality(p_oportunidad_ids) > 100 THEN
        RAISE EXCEPTION 'opportunity_batch_too_large';
    END IF;

    FOREACH v_oportunidad_id IN ARRAY p_oportunidad_ids LOOP
        BEGIN
            v_resultado := public.registrar_intento_reactivacion(
                p_organizacion_id, v_oportunidad_id, p_usuario_id, p_canal,
                p_resultado, p_motivo, p_intentado_en
            );
            v_items := v_items || jsonb_build_array(jsonb_build_object(
                'oportunidad_id', v_oportunidad_id,
                'ok', true,
                'intento', v_resultado
            ));
            v_procesadas := v_procesadas + 1;
        EXCEPTION WHEN OTHERS THEN
            v_items := v_items || jsonb_build_array(jsonb_build_object(
                'oportunidad_id', v_oportunidad_id,
                'ok', false,
                'error', CASE SQLERRM
                    WHEN 'opportunity_not_found' THEN 'La oportunidad no existe en este tenant.'
                    WHEN 'opportunity_not_open' THEN 'La oportunidad ya no está abierta.'
                    ELSE 'No se pudo registrar el intento.'
                END
            ));
            v_fallidas := v_fallidas + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'total', cardinality(p_oportunidad_ids),
        'procesadas', v_procesadas,
        'fallidas', v_fallidas,
        'items', v_items
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_intento_reactivacion(uuid, uuid, uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_reactivacion(uuid, uuid, uuid, text, text, text, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.registrar_intentos_reactivacion_lote(uuid, uuid[], uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intentos_reactivacion_lote(uuid, uuid[], uuid, text, text, text, timestamptz) TO service_role;

COMMIT;
