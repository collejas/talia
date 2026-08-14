BEGIN;

-- Conserva la categoría configurada en la plantilla sin confundirla con la
-- categoría/pricing que Meta confirma posteriormente en su webhook.
ALTER TABLE public.cobro_mensajes
    ADD COLUMN IF NOT EXISTS categoria_meta_configurada text NULL;

ALTER TABLE public.cobro_mensajes
    DROP CONSTRAINT IF EXISTS cobro_mensajes_configured_category_chk;

ALTER TABLE public.cobro_mensajes
    ADD CONSTRAINT cobro_mensajes_configured_category_chk
    CHECK (
        categoria_meta_configurada IS NULL
        OR categoria_meta_configurada IN ('marketing', 'utility', 'authentication')
    );

CREATE INDEX IF NOT EXISTS cobro_mensajes_org_configured_category_idx
    ON public.cobro_mensajes (organizacion_id, categoria_meta_configurada, creado_en DESC);

DROP FUNCTION IF EXISTS public.registrar_cobro_mensaje(
    uuid, uuid, text, text, text, text, text, text, boolean, boolean, text, text, text, timestamptz
);

CREATE OR REPLACE FUNCTION public.registrar_cobro_mensaje(
    p_organizacion_id uuid,
    p_mensaje_id uuid,
    p_proveedor text,
    p_canal text,
    p_proveedor_mensaje_id text,
    p_estado_proveedor text DEFAULT 'accepted',
    p_categoria_meta text DEFAULT 'unknown',
    p_tipo_pricing_meta text DEFAULT NULL,
    p_billable_meta boolean DEFAULT NULL,
    p_es_plantilla boolean DEFAULT false,
    p_nombre_plantilla text DEFAULT NULL,
    p_idioma_plantilla text DEFAULT NULL,
    p_fuente_registro text DEFAULT 'backend_message_registration',
    p_fecha_evento timestamptz DEFAULT now(),
    p_categoria_meta_configurada text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    organizacion_id uuid,
    periodo_id uuid,
    mensaje_id uuid,
    conversacion_id uuid,
    cargo_app_importe numeric,
    costo_meta_importe numeric,
    costo_total_mensaje numeric,
    duplicado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
    v_message public.mensajes%ROWTYPE;
    v_conversation public.conversaciones%ROWTYPE;
    v_period_id uuid;
    v_app_rate public.cobro_tarifas_app%ROWTYPE;
    v_provider_rate public.cobro_tarifas_proveedor%ROWTYPE;
    v_ledger public.cobro_mensajes%ROWTYPE;
    v_inserted boolean := false;
    v_thread_initiator text;
    v_category text;
    v_configured_category text;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_meta_applies boolean := false;
    v_app_amount numeric(12,4) := 0;
    v_meta_amount numeric(12,4) := 0;
BEGIN
    IF p_organizacion_id IS NULL OR p_mensaje_id IS NULL THEN
        RAISE EXCEPTION 'billing_message_identity_required';
    END IF;
    IF nullif(trim(p_proveedor), '') IS NULL
        OR nullif(trim(p_canal), '') IS NULL
        OR nullif(trim(p_proveedor_mensaje_id), '') IS NULL THEN
        RAISE EXCEPTION 'billing_provider_identity_required';
    END IF;
    IF p_canal NOT IN ('whatsapp', 'messenger', 'webchat', 'sms', 'email', 'otro') THEN
        RAISE EXCEPTION 'billing_channel_invalid';
    END IF;

    SELECT * INTO v_message
    FROM public.mensajes m
    WHERE m.organizacion_id = p_organizacion_id AND m.id = p_mensaje_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing_message_not_found';
    END IF;

    SELECT * INTO v_conversation
    FROM public.conversaciones c
    WHERE c.organizacion_id = p_organizacion_id AND c.id = v_message.conversacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing_conversation_not_found';
    END IF;

    SELECT CASE WHEN first_message.direccion = 'saliente' THEN 'empresa' ELSE 'cliente' END
    INTO v_thread_initiator
    FROM (
        SELECT m.direccion
        FROM public.mensajes m
        WHERE m.organizacion_id = p_organizacion_id
          AND m.conversacion_id = v_message.conversacion_id
        ORDER BY m.creado_en, m.id
        LIMIT 1
    ) first_message;
    v_thread_initiator := coalesce(v_thread_initiator, 'desconocido');
    v_category := CASE
        WHEN p_categoria_meta IN ('marketing', 'utility', 'authentication', 'service', 'referral_conversion', 'unknown')
            THEN p_categoria_meta
        ELSE 'unknown'
    END;
    v_configured_category := CASE
        WHEN p_categoria_meta_configurada IN ('marketing', 'utility', 'authentication')
            THEN p_categoria_meta_configurada
        ELSE NULL
    END;

    v_period_start := date_trunc('month', coalesce(p_fecha_evento, now()) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_period_end := (v_period_start AT TIME ZONE 'UTC' + interval '1 month') AT TIME ZONE 'UTC';

    INSERT INTO public.cobro_periodos (organizacion_id, fecha_inicio, fecha_fin)
    VALUES (p_organizacion_id, v_period_start, v_period_end)
    ON CONFLICT (organizacion_id, fecha_inicio) DO NOTHING;

    SELECT cp.id INTO v_period_id
    FROM public.cobro_periodos cp
    WHERE cp.organizacion_id = p_organizacion_id
      AND cp.fecha_inicio = v_period_start;

    SELECT ta.* INTO v_app_rate
    FROM public.cobro_tarifas_app ta
    WHERE ta.activo
      AND (ta.alcance = 'global' OR (ta.alcance = 'tenant' AND ta.organizacion_id = p_organizacion_id))
      AND ta.vigente_desde <= coalesce(p_fecha_evento, now())
      AND (ta.vigente_hasta IS NULL OR ta.vigente_hasta > coalesce(p_fecha_evento, now()))
    ORDER BY CASE WHEN ta.alcance = 'tenant' THEN 0 ELSE 1 END, ta.vigente_desde DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing_app_rate_not_found';
    END IF;

    v_app_amount := v_app_rate.precio_mensaje;

    IF v_message.direccion = 'saliente' AND v_thread_initiator = 'empresa'
       AND coalesce(p_billable_meta, true) THEN
        SELECT tp.* INTO v_provider_rate
        FROM public.cobro_tarifas_proveedor tp
        WHERE tp.activo
          AND tp.proveedor = p_proveedor
          AND tp.canal = p_canal
          AND tp.pais_codigo_iso2 = 'MX'
          AND tp.iniciador_hilo = 'empresa'
          AND (tp.categoria_meta = v_category OR tp.categoria_meta = 'unknown')
          AND tp.vigente_desde <= coalesce(p_fecha_evento, now())
          AND (tp.vigente_hasta IS NULL OR tp.vigente_hasta > coalesce(p_fecha_evento, now()))
        ORDER BY CASE WHEN tp.categoria_meta = v_category THEN 0 ELSE 1 END,
                 tp.vigente_desde DESC
        LIMIT 1;
        IF FOUND THEN
            v_meta_applies := true;
            v_meta_amount := v_provider_rate.precio_unitario;
        END IF;
    END IF;

    INSERT INTO public.cobro_mensajes (
        organizacion_id, periodo_id, mensaje_id, conversacion_id,
        proveedor, canal, proveedor_mensaje_id, direccion, tipo_contenido,
        origen_mensaje, es_plantilla, nombre_plantilla, idioma_plantilla,
        categoria_meta, categoria_meta_configurada, tipo_pricing_meta, billable_meta, estado_proveedor,
        aceptado_proveedor_en, facturable, tarifa_app_id, origen_tarifa_app,
        cargo_app_unitario, cargo_app_importe, tarifa_proveedor_id,
        costo_meta_aplica, costo_meta_unitario, costo_meta_importe,
        costo_total_mensaje, fuente_registro
    ) VALUES (
        p_organizacion_id, v_period_id, v_message.id, v_message.conversacion_id,
        p_proveedor, p_canal, trim(p_proveedor_mensaje_id), v_message.direccion,
        coalesce(v_message.tipo_contenido, 'text'), v_thread_initiator,
        p_es_plantilla, p_nombre_plantilla, p_idioma_plantilla, v_category,
        v_configured_category, p_tipo_pricing_meta, p_billable_meta, coalesce(p_estado_proveedor, 'accepted'),
        coalesce(p_fecha_evento, now()), true, v_app_rate.id, v_app_rate.alcance,
        v_app_amount, v_app_amount, CASE WHEN v_meta_applies THEN v_provider_rate.id ELSE NULL END,
        v_meta_applies, v_meta_amount, v_meta_amount, v_app_amount + v_meta_amount,
        p_fuente_registro
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_ledger;

    IF FOUND THEN
        v_inserted := true;
        UPDATE public.cobro_periodos cp
        SET mensajes_cantidad = mensajes_cantidad + 1,
            mensajes_entrantes_cantidad = mensajes_entrantes_cantidad + CASE WHEN v_ledger.direccion = 'entrante' THEN 1 ELSE 0 END,
            mensajes_salientes_cantidad = mensajes_salientes_cantidad + CASE WHEN v_ledger.direccion = 'saliente' THEN 1 ELSE 0 END,
            subtotal_mensajes = subtotal_mensajes + v_ledger.cargo_app_importe,
            costo_meta_periodo = costo_meta_periodo + v_ledger.costo_meta_importe,
            costo_mensaje_periodo = costo_mensaje_periodo + v_ledger.cargo_app_importe,
            total = total + v_ledger.costo_total_mensaje
        WHERE cp.id = v_ledger.periodo_id;
    ELSE
        SELECT cm.* INTO v_ledger
        FROM public.cobro_mensajes cm
        WHERE cm.organizacion_id = p_organizacion_id
          AND cm.mensaje_id = p_mensaje_id
        ORDER BY cm.creado_en DESC
        LIMIT 1;
    END IF;

    RETURN QUERY SELECT
        v_ledger.id, v_ledger.organizacion_id, v_ledger.periodo_id, v_ledger.mensaje_id,
        v_ledger.conversacion_id, v_ledger.cargo_app_importe, v_ledger.costo_meta_importe,
        v_ledger.costo_total_mensaje, NOT v_inserted;
END;
$function$;

COMMIT;
