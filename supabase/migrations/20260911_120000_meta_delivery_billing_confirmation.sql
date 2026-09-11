BEGIN;

-- El cargo GEOACTIV sigue dependiendo de la aceptación. El costo Meta queda
-- separado y necesita evidencia de entrega más pricing.billable=true.
ALTER TABLE public.cobro_mensajes
    ADD COLUMN IF NOT EXISTS costo_meta_estado text NOT NULL DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS meta_entregado_en timestamptz NULL;

ALTER TABLE public.cobro_mensajes
    DROP CONSTRAINT IF EXISTS cobro_mensajes_costo_meta_estado_chk;

ALTER TABLE public.cobro_mensajes
    ADD CONSTRAINT cobro_mensajes_costo_meta_estado_chk
    CHECK (costo_meta_estado IN ('pendiente', 'confirmado', 'no_aplica', 'no_entregado'));

-- La función de registro no debe anticipar el cobro de Meta con billable NULL.
-- Se conserva el comportamiento idempotente y únicamente se reemplaza la
-- condición que calculaba el precio antes del callback de entrega.
DO $patch$
DECLARE
    v_oid oid := to_regprocedure(
        'public.registrar_cobro_mensaje(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,text,timestamptz,text)'
    );
    v_definition text;
    v_old text := $old$
    IF v_message.direccion = 'saliente'
       AND coalesce(p_billable_meta, true)
       AND (v_thread_initiator = 'empresa' OR v_category = 'marketing') THEN
$old$;
    v_new text := $new$
    IF false THEN
$new$;
BEGIN
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'registrar_cobro_mensaje signature not found';
    END IF;
    SELECT pg_get_functiondef(v_oid) INTO v_definition;
    IF position(v_old IN v_definition) > 0 THEN
        v_definition := replace(v_definition, v_old, v_new);
    ELSIF position(v_new IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Expected initial Meta pricing condition not found';
    END IF;
    EXECUTE v_definition;
END;
$patch$;

CREATE OR REPLACE FUNCTION public.actualizar_cobro_meta_mensaje(
    p_proveedor text,
    p_proveedor_mensaje_id text,
    p_estado_proveedor text DEFAULT NULL,
    p_categoria_meta text DEFAULT NULL,
    p_tipo_pricing_meta text DEFAULT NULL,
    p_billable_meta boolean DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    categoria_meta text,
    billable_meta boolean,
    costo_meta_importe numeric,
    costo_total_mensaje numeric,
    actualizado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
    v_ledger public.cobro_mensajes%ROWTYPE;
    v_provider_rate public.cobro_tarifas_proveedor%ROWTYPE;
    v_category text;
    v_billable boolean;
    v_new_meta numeric(12,4) := 0;
    v_old_meta numeric(12,4) := 0;
    v_applies boolean := false;
    v_delivery_confirmed boolean := false;
    v_failed_confirmed boolean := false;
    v_delivered_at timestamptz;
    v_meta_state text := 'pendiente';
BEGIN
    SELECT cm.* INTO v_ledger
    FROM public.cobro_mensajes cm
    WHERE cm.proveedor = p_proveedor
      AND cm.proveedor_mensaje_id = trim(p_proveedor_mensaje_id)
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_category := CASE
        WHEN p_categoria_meta IN ('marketing', 'utility', 'authentication', 'service', 'referral_conversion', 'unknown')
            THEN p_categoria_meta
        ELSE v_ledger.categoria_meta
    END;
    v_billable := coalesce(p_billable_meta, v_ledger.billable_meta);
    v_old_meta := v_ledger.costo_meta_importe;

    SELECT
        EXISTS (
            SELECT 1 FROM public.eventos_entrega e
            WHERE e.organizacion_id = v_ledger.organizacion_id
              AND e.proveedor = p_proveedor
              AND e.proveedor_mensaje_id = v_ledger.proveedor_mensaje_id
              AND lower(e.evento) IN ('entregado', 'delivered', 'leido', 'read')
        ),
        EXISTS (
            SELECT 1 FROM public.eventos_entrega e
            WHERE e.organizacion_id = v_ledger.organizacion_id
              AND e.proveedor = p_proveedor
              AND e.proveedor_mensaje_id = v_ledger.proveedor_mensaje_id
              AND lower(e.evento) IN ('fallido', 'failed', 'error')
        ),
        (
            SELECT max(coalesce(e.proveedor_ts, e.creado_en))
            FROM public.eventos_entrega e
            WHERE e.organizacion_id = v_ledger.organizacion_id
              AND e.proveedor = p_proveedor
              AND e.proveedor_mensaje_id = v_ledger.proveedor_mensaje_id
              AND lower(e.evento) IN ('entregado', 'delivered', 'leido', 'read')
        )
    INTO v_delivery_confirmed, v_failed_confirmed, v_delivered_at;

    IF p_proveedor = 'meta'
       AND v_ledger.direccion = 'saliente'
       AND v_delivery_confirmed
       AND v_billable IS TRUE
       AND (v_ledger.origen_mensaje = 'empresa' OR v_category IN ('marketing', 'utility', 'authentication')) THEN
        SELECT tp.* INTO v_provider_rate
        FROM public.cobro_tarifas_proveedor tp
        WHERE tp.activo
          AND tp.proveedor = p_proveedor
          AND tp.canal = v_ledger.canal
          AND tp.pais_codigo_iso2 = 'MX'
          AND tp.iniciador_hilo = 'empresa'
          AND (tp.categoria_meta = v_category OR tp.categoria_meta = 'unknown')
          AND tp.vigente_desde <= now()
          AND (tp.vigente_hasta IS NULL OR tp.vigente_hasta > now())
        ORDER BY CASE WHEN tp.categoria_meta = v_category THEN 0 ELSE 1 END,
                 tp.vigente_desde DESC
        LIMIT 1;
        IF FOUND THEN
            v_applies := true;
            v_new_meta := v_provider_rate.precio_unitario;
            v_meta_state := 'confirmado';
        END IF;
    ELSIF p_proveedor = 'meta'
       AND v_ledger.direccion = 'saliente'
       AND v_delivery_confirmed
       AND v_billable IS FALSE THEN
        v_meta_state := 'no_aplica';
    ELSIF p_proveedor = 'meta'
       AND v_ledger.direccion = 'saliente'
       AND (v_ledger.origen_mensaje = 'empresa' OR v_category IN ('marketing', 'utility', 'authentication')) THEN
        v_meta_state := CASE WHEN v_failed_confirmed AND NOT v_delivery_confirmed THEN 'no_entregado' ELSE 'pendiente' END;
    ELSE
        v_meta_state := 'no_aplica';
    END IF;

    UPDATE public.cobro_mensajes
    SET categoria_meta = v_category,
        tipo_pricing_meta = coalesce(p_tipo_pricing_meta, tipo_pricing_meta),
        billable_meta = coalesce(p_billable_meta, billable_meta),
        estado_proveedor = coalesce(p_estado_proveedor, estado_proveedor),
        tarifa_proveedor_id = CASE WHEN v_applies THEN v_provider_rate.id ELSE NULL END,
        costo_meta_aplica = v_applies,
        costo_meta_unitario = v_new_meta,
        costo_meta_importe = v_new_meta,
        costo_meta_estado = v_meta_state,
        meta_entregado_en = v_delivered_at,
        costo_total_mensaje = cargo_app_importe + v_new_meta
    WHERE id = v_ledger.id;

    UPDATE public.cobro_periodos
    SET costo_meta_periodo = costo_meta_periodo + (v_new_meta - v_old_meta),
        costo_mensaje_periodo = costo_mensaje_periodo + (v_new_meta - v_old_meta),
        total = total + (v_new_meta - v_old_meta)
    WHERE id = v_ledger.periodo_id;

    RETURN QUERY SELECT v_ledger.id, v_category, v_billable, v_new_meta,
        v_ledger.cargo_app_importe + v_new_meta, true;
END;
$function$;

-- Backfill seguro: no crea mensajes ni cargos GEOACTIV y usa solo callbacks
-- Meta ya almacenados como evidencia.
WITH evidence AS (
    SELECT
        cm.id,
        max(coalesce(e.proveedor_ts, e.creado_en)) FILTER (WHERE lower(e.evento) IN ('entregado', 'delivered', 'leido', 'read')) AS delivered_at,
        bool_or(lower(e.evento) IN ('entregado', 'delivered', 'leido', 'read')) AS delivered,
        bool_or(lower(e.evento) IN ('fallido', 'failed', 'error')) AS failed
    FROM public.cobro_mensajes cm
    LEFT JOIN public.eventos_entrega e
      ON e.organizacion_id = cm.organizacion_id
     AND e.proveedor = cm.proveedor
     AND e.proveedor_mensaje_id = cm.proveedor_mensaje_id
    GROUP BY cm.id
), classified AS (
    SELECT cm.id,
           CASE
               WHEN cm.proveedor = 'meta' AND cm.direccion = 'saliente'
                    AND ev.delivered AND cm.billable_meta IS TRUE
                    AND (cm.origen_mensaje = 'empresa' OR cm.categoria_meta IN ('marketing', 'utility', 'authentication'))
                   THEN 'confirmado'
               WHEN cm.proveedor = 'meta' AND cm.direccion = 'saliente'
                    AND ev.delivered AND cm.billable_meta IS FALSE
                   THEN 'no_aplica'
               WHEN cm.proveedor = 'meta' AND cm.direccion = 'saliente'
                    AND ev.failed AND NOT ev.delivered
                    AND (cm.origen_mensaje = 'empresa' OR cm.categoria_meta IN ('marketing', 'utility', 'authentication'))
                   THEN 'no_entregado'
               WHEN cm.proveedor = 'meta' AND cm.direccion = 'saliente'
                    AND (cm.origen_mensaje = 'empresa' OR cm.categoria_meta IN ('marketing', 'utility', 'authentication'))
                   THEN 'pendiente'
               ELSE 'no_aplica'
           END AS meta_state,
           ev.delivered_at
    FROM public.cobro_mensajes cm
    JOIN evidence ev ON ev.id = cm.id
)
UPDATE public.cobro_mensajes cm
SET costo_meta_estado = c.meta_state,
    meta_entregado_en = c.delivered_at,
    costo_meta_aplica = c.meta_state = 'confirmado',
    costo_meta_unitario = CASE WHEN c.meta_state = 'confirmado' THEN cm.costo_meta_unitario ELSE 0 END,
    costo_meta_importe = CASE WHEN c.meta_state = 'confirmado' THEN cm.costo_meta_importe ELSE 0 END,
    costo_total_mensaje = cm.cargo_app_importe + CASE WHEN c.meta_state = 'confirmado' THEN cm.costo_meta_importe ELSE 0 END,
    tarifa_proveedor_id = CASE WHEN c.meta_state = 'confirmado' THEN cm.tarifa_proveedor_id ELSE NULL END
FROM classified c
WHERE cm.id = c.id;

WITH totals AS (
    SELECT periodo_id,
           sum(cargo_app_importe) AS app_total,
           sum(costo_meta_importe) AS meta_total
    FROM public.cobro_mensajes
    GROUP BY periodo_id
)
UPDATE public.cobro_periodos cp
SET subtotal_mensajes = coalesce(t.app_total, 0),
    costo_meta_periodo = coalesce(t.meta_total, 0),
    costo_mensaje_periodo = coalesce(t.app_total, 0) + coalesce(t.meta_total, 0),
    total = coalesce(t.app_total, 0) + coalesce(t.meta_total, 0) + cp.ajustes_total
FROM totals t
WHERE cp.id = t.periodo_id;

GRANT EXECUTE ON FUNCTION public.actualizar_cobro_meta_mensaje(text,text,text,text,text,boolean)
TO authenticated, service_role;

COMMIT;
