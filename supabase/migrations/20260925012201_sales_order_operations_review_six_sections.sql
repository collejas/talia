BEGIN;

ALTER TABLE public.pedidos_venta
    ADD COLUMN revision_inventario_validada boolean NOT NULL DEFAULT false,
    ADD COLUMN revision_condiciones_validada boolean NOT NULL DEFAULT false,
    ADD COLUMN revision_riesgos_validada boolean NOT NULL DEFAULT false,
    ADD COLUMN motivo_devolucion_codigo text,
    ADD CONSTRAINT pedidos_venta_motivo_devolucion_codigo_check CHECK (
        motivo_devolucion_codigo IS NULL OR motivo_devolucion_codigo IN (
            'falta_evidencia', 'oc_no_coincide', 'precio_incorrecto',
            'descuento_no_autorizado', 'datos_cliente_incompletos',
            'partidas_incorrectas', 'condiciones_incompletas',
            'problema_inventario', 'otro'
        )
    );

COMMENT ON COLUMN public.pedidos_venta.revision_inventario_validada IS
    'Operaciones reviso disponibilidad, reservas y faltantes visibles del pedido.';
COMMENT ON COLUMN public.pedidos_venta.revision_condiciones_validada IS
    'Operaciones reviso las condiciones comerciales disponibles del pedido.';
COMMENT ON COLUMN public.pedidos_venta.revision_riesgos_validada IS
    'Operaciones reviso alertas y riesgos operativos del pedido.';
COMMENT ON COLUMN public.pedidos_venta.motivo_devolucion_codigo IS
    'Causa estructurada de devolucion del pedido a Comercial.';

CREATE OR REPLACE FUNCTION public.crm_aprobar_pedido_venta(
    p_organizacion_id uuid,
    p_pedido_venta_id uuid,
    p_usuario_id uuid,
    p_revision_cliente_validada boolean,
    p_revision_evidencia_validada boolean,
    p_revision_partidas_validada boolean,
    p_revision_inventario_validada boolean,
    p_revision_condiciones_validada boolean,
    p_revision_riesgos_validada boolean,
    p_fecha_vencimiento date DEFAULT NULL
)
RETURNS TABLE (
    venta_id uuid,
    cliente_id uuid,
    cuenta_por_cobrar_id uuid,
    venta_estatus text,
    total numeric,
    pago_acumulado numeric,
    saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
    v_result record;
    v_almacen_id uuid;
    v_items jsonb;
    v_tiene_faltante boolean;
BEGIN
    IF p_organizacion_id IS NULL OR p_pedido_venta_id IS NULL OR p_usuario_id IS NULL THEN
        RAISE EXCEPTION 'organization_order_and_user_required' USING ERRCODE='P0001';
    END IF;
    IF NOT (COALESCE(p_revision_cliente_validada,false)
        AND COALESCE(p_revision_evidencia_validada,false)
        AND COALESCE(p_revision_partidas_validada,false)
        AND COALESCE(p_revision_inventario_validada,false)
        AND COALESCE(p_revision_condiciones_validada,false)
        AND COALESCE(p_revision_riesgos_validada,false)) THEN
        RAISE EXCEPTION 'operational_review_checklist_incomplete' USING ERRCODE='P0001';
    END IF;
    SELECT * INTO v_pedido
      FROM public.pedidos_venta
     WHERE organizacion_id=p_organizacion_id AND id=p_pedido_venta_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE='P0001'; END IF;
    IF v_pedido.estatus<>'pendiente_confirmacion' OR v_pedido.estado_formalizacion<>'pendiente' THEN
        RAISE EXCEPTION 'sales_order_not_submitted_for_review' USING ERRCODE='P0001';
    END IF;

    SELECT a.id INTO v_almacen_id
      FROM public.almacenes a
     WHERE a.organizacion_id=p_organizacion_id AND a.activo IS TRUE
     ORDER BY a.es_principal DESC,a.id
     LIMIT 1;
    IF EXISTS (
        SELECT 1 FROM public.pedido_venta_items pvi
        JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id
                                    AND ci.id=pvi.catalog_item_id AND ci.maneja_inventario
        WHERE pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=p_pedido_venta_id
    ) AND v_almacen_id IS NULL THEN
        RAISE EXCEPTION 'inventory_warehouse_required' USING ERRCODE='P0001';
    END IF;

    IF v_almacen_id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'quote_item_id',pvi.cotizacion_item_id,
                   'catalog_item_id',pvi.catalog_item_id,
                   'cantidad',pvi.cantidad-COALESCE(r.reservada,0)
               ) ORDER BY pvi.orden),'[]'::jsonb)
          INTO v_items
          FROM public.pedido_venta_items pvi
          JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id
                                      AND ci.id=pvi.catalog_item_id AND ci.maneja_inventario
          LEFT JOIN LATERAL (
              SELECT sum(ir.cantidad) AS reservada
                FROM public.inventario_reservas ir
               WHERE ir.organizacion_id=p_organizacion_id
                 AND ir.quote_id=v_pedido.cotizacion_id
                 AND ir.quote_item_id=pvi.cotizacion_item_id AND ir.estado='activa'
          ) r ON true
         WHERE pvi.organizacion_id=p_organizacion_id
           AND pvi.pedido_venta_id=p_pedido_venta_id
           AND pvi.cantidad>COALESCE(r.reservada,0);
        IF jsonb_array_length(v_items)>0 THEN
            PERFORM public.crm_reservar_inventario_cotizacion(
                p_organizacion_id,v_pedido.cotizacion_id,v_almacen_id,v_items,p_usuario_id
            );
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.pedido_venta_items pvi
          JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id
                                      AND ci.id=pvi.catalog_item_id AND ci.maneja_inventario
          LEFT JOIN LATERAL (
              SELECT sum(ir.cantidad) AS reservada
                FROM public.inventario_reservas ir
               WHERE ir.organizacion_id=p_organizacion_id
                 AND ir.quote_id=v_pedido.cotizacion_id
                 AND ir.quote_item_id=pvi.cotizacion_item_id AND ir.estado IN ('activa','consumida')
          ) r ON true
         WHERE pvi.organizacion_id=p_organizacion_id
           AND pvi.pedido_venta_id=p_pedido_venta_id
           AND COALESCE(r.reservada,0)<pvi.cantidad
    ) INTO v_tiene_faltante;
    IF v_tiene_faltante AND NOT v_pedido.permite_entrega_parcial THEN
        RAISE EXCEPTION 'inventory_shortfall_partial_delivery_not_allowed' USING ERRCODE='P0001';
    END IF;

    UPDATE public.pedidos_venta
       SET revision_cliente_validada=true,
           revision_evidencia_validada=true,
           revision_partidas_validada=true,
           revision_inventario_validada=true,
           revision_condiciones_validada=true,
           revision_riesgos_validada=true,
           revision_operativa_por_usuario_id=p_usuario_id,
           revision_operativa_en=now(), actualizado_en=now()
     WHERE organizacion_id=p_organizacion_id AND id=p_pedido_venta_id;

    SELECT * INTO v_result FROM public.crm_confirmar_pedido_venta_con_evidencia(
        p_organizacion_id,v_pedido.cotizacion_id,p_usuario_id,p_fecha_vencimiento,
        v_pedido.referencia_pedido_cliente,v_pedido.fecha_orden_cliente,
        v_pedido.forma_confirmacion,v_pedido.fecha_confirmacion_cliente,
        v_pedido.observaciones_confirmacion
    );
    INSERT INTO public.pedido_venta_eventos(organizacion_id,pedido_venta_id,evento,actor_usuario_id,detalle)
    VALUES (
        p_organizacion_id,p_pedido_venta_id,'pedido_liberado_surtido',p_usuario_id,
        CASE WHEN v_tiene_faltante
             THEN 'Pedido revisado en seis bloques y liberado con reserva parcial; el faltante queda pendiente de inventario.'
             ELSE 'Pedido revisado en seis bloques; venta formalizada, cuenta por cobrar creada y liberado a surtido.' END
    );
    RETURN QUERY SELECT v_result.venta_id,v_result.cliente_id,v_result.cuenta_por_cobrar_id,
                        v_result.venta_estatus,v_result.total,v_result.pago_acumulado,v_result.saldo;
END;
$function$;

DROP FUNCTION public.crm_aprobar_pedido_venta(uuid,uuid,uuid,boolean,boolean,boolean,date);
REVOKE ALL ON FUNCTION public.crm_aprobar_pedido_venta(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_aprobar_pedido_venta(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,date)
    TO service_role;

CREATE OR REPLACE FUNCTION public.crm_devolver_pedido_a_comercial(
    p_organizacion_id uuid,
    p_pedido_venta_id uuid,
    p_usuario_id uuid,
    p_codigo_motivo text,
    p_motivo text
)
RETURNS TABLE(pedido_venta_id uuid, cotizacion_id uuid, estado_formalizacion text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
BEGIN
    IF p_organizacion_id IS NULL OR p_pedido_venta_id IS NULL OR p_usuario_id IS NULL
       OR p_codigo_motivo IS NULL OR NULLIF(btrim(p_motivo), '') IS NULL THEN
        RAISE EXCEPTION 'organization_order_user_and_return_reason_required' USING ERRCODE = 'P0001';
    END IF;
    IF p_codigo_motivo NOT IN ('falta_evidencia','oc_no_coincide','precio_incorrecto',
       'descuento_no_autorizado','datos_cliente_incompletos','partidas_incorrectas',
       'condiciones_incompletas','problema_inventario','otro') THEN
        RAISE EXCEPTION 'invalid_order_return_reason_code' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(btrim(p_motivo)) > 2000 THEN
        RAISE EXCEPTION 'order_return_reason_too_long' USING ERRCODE = 'P0001';
    END IF;
    SELECT pv.* INTO v_pedido FROM public.pedidos_venta pv
     WHERE pv.organizacion_id=p_organizacion_id AND pv.id=p_pedido_venta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE = 'P0001'; END IF;
    IF v_pedido.estatus <> 'pendiente_confirmacion' OR v_pedido.estado_formalizacion <> 'pendiente' THEN
        RAISE EXCEPTION 'sales_order_not_returnable' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.pedidos_venta
       SET estado_formalizacion='devuelto', devuelto_comercial_en=now(),
           devuelto_comercial_por_usuario_id=p_usuario_id,
           motivo_devolucion_codigo=p_codigo_motivo,
           motivo_devolucion_comercial=btrim(p_motivo), actualizado_en=now()
     WHERE organizacion_id=p_organizacion_id AND id=p_pedido_venta_id;
    RETURN QUERY SELECT v_pedido.id,v_pedido.cotizacion_id,'devuelto'::text;
END;
$function$;

DROP FUNCTION public.crm_devolver_pedido_a_comercial(uuid,uuid,uuid,text);
REVOKE ALL ON FUNCTION public.crm_devolver_pedido_a_comercial(uuid,uuid,uuid,text,text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_devolver_pedido_a_comercial(uuid,uuid,uuid,text,text)
    TO service_role;

COMMIT;
