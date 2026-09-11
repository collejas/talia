BEGIN;

-- Mantiene coherente la RPC ya aplicada: una entrega explícitamente gratuita
-- no queda esperando conciliación indefinidamente.
CREATE OR REPLACE FUNCTION public.actualizar_cobro_meta_mensaje(
    p_proveedor text,
    p_proveedor_mensaje_id text,
    p_estado_proveedor text DEFAULT NULL,
    p_categoria_meta text DEFAULT NULL,
    p_tipo_pricing_meta text DEFAULT NULL,
    p_billable_meta boolean DEFAULT NULL
)
RETURNS TABLE(id uuid, categoria_meta text, billable_meta boolean, costo_meta_importe numeric, costo_total_mensaje numeric, actualizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
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
    SELECT cm.* INTO v_ledger FROM public.cobro_mensajes cm
    WHERE cm.proveedor = p_proveedor AND cm.proveedor_mensaje_id = trim(p_proveedor_mensaje_id) FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    v_category := CASE WHEN p_categoria_meta IN ('marketing','utility','authentication','service','referral_conversion','unknown')
        THEN p_categoria_meta ELSE v_ledger.categoria_meta END;
    v_billable := coalesce(p_billable_meta, v_ledger.billable_meta);
    v_old_meta := v_ledger.costo_meta_importe;

    SELECT
        EXISTS (SELECT 1 FROM public.eventos_entrega e WHERE e.organizacion_id=v_ledger.organizacion_id AND e.proveedor=p_proveedor AND e.proveedor_mensaje_id=v_ledger.proveedor_mensaje_id AND lower(e.evento) IN ('entregado','delivered','leido','read')),
        EXISTS (SELECT 1 FROM public.eventos_entrega e WHERE e.organizacion_id=v_ledger.organizacion_id AND e.proveedor=p_proveedor AND e.proveedor_mensaje_id=v_ledger.proveedor_mensaje_id AND lower(e.evento) IN ('fallido','failed','error')),
        (SELECT max(coalesce(e.proveedor_ts,e.creado_en)) FROM public.eventos_entrega e WHERE e.organizacion_id=v_ledger.organizacion_id AND e.proveedor=p_proveedor AND e.proveedor_mensaje_id=v_ledger.proveedor_mensaje_id AND lower(e.evento) IN ('entregado','delivered','leido','read'))
    INTO v_delivery_confirmed, v_failed_confirmed, v_delivered_at;

    IF p_proveedor='meta' AND v_ledger.direccion='saliente' AND v_delivery_confirmed AND v_billable IS TRUE
       AND (v_ledger.origen_mensaje='empresa' OR v_category IN ('marketing','utility','authentication')) THEN
        SELECT tp.* INTO v_provider_rate FROM public.cobro_tarifas_proveedor tp
        WHERE tp.activo AND tp.proveedor=p_proveedor AND tp.canal=v_ledger.canal AND tp.pais_codigo_iso2='MX'
          AND tp.iniciador_hilo='empresa' AND (tp.categoria_meta=v_category OR tp.categoria_meta='unknown')
          AND tp.vigente_desde <= now() AND (tp.vigente_hasta IS NULL OR tp.vigente_hasta > now())
        ORDER BY CASE WHEN tp.categoria_meta=v_category THEN 0 ELSE 1 END, tp.vigente_desde DESC LIMIT 1;
        IF FOUND THEN v_applies := true; v_new_meta := v_provider_rate.precio_unitario; v_meta_state := 'confirmado'; END IF;
    ELSIF p_proveedor='meta' AND v_ledger.direccion='saliente' AND v_delivery_confirmed AND v_billable IS FALSE THEN
        v_meta_state := 'no_aplica';
    ELSIF p_proveedor='meta' AND v_ledger.direccion='saliente'
       AND (v_ledger.origen_mensaje='empresa' OR v_category IN ('marketing','utility','authentication')) THEN
        v_meta_state := CASE WHEN v_failed_confirmed AND NOT v_delivery_confirmed THEN 'no_entregado' ELSE 'pendiente' END;
    ELSE
        v_meta_state := 'no_aplica';
    END IF;

    UPDATE public.cobro_mensajes SET categoria_meta=v_category,
        tipo_pricing_meta=coalesce(p_tipo_pricing_meta,tipo_pricing_meta),
        billable_meta=coalesce(p_billable_meta,billable_meta),
        estado_proveedor=coalesce(p_estado_proveedor,estado_proveedor),
        tarifa_proveedor_id=CASE WHEN v_applies THEN v_provider_rate.id ELSE NULL END,
        costo_meta_aplica=v_applies, costo_meta_unitario=v_new_meta, costo_meta_importe=v_new_meta,
        costo_meta_estado=v_meta_state, meta_entregado_en=v_delivered_at,
        costo_total_mensaje=cargo_app_importe+v_new_meta
    WHERE id=v_ledger.id;

    UPDATE public.cobro_periodos SET costo_meta_periodo=costo_meta_periodo+(v_new_meta-v_old_meta),
        costo_mensaje_periodo=costo_mensaje_periodo+(v_new_meta-v_old_meta), total=total+(v_new_meta-v_old_meta)
    WHERE id=v_ledger.periodo_id;

    RETURN QUERY SELECT v_ledger.id,v_category,v_billable,v_new_meta,v_ledger.cargo_app_importe+v_new_meta,true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.actualizar_cobro_meta_mensaje(text,text,text,text,text,boolean) TO authenticated, service_role;
COMMIT;
