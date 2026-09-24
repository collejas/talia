BEGIN;

CREATE OR REPLACE FUNCTION public.crm_reservar_inventario_cotizacion(
    p_organizacion_id uuid,
    p_quote_id uuid,
    p_almacen_id uuid,
    p_items jsonb,
    p_creado_por uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_item record;
    v_existencia public.inventario_existencias%ROWTYPE;
    v_catalog_item public.catalog_items%ROWTYPE;
    v_solicitado numeric(14,3);
    v_disponible numeric(14,3);
    v_reservar numeric(14,3);
    v_costo numeric(14,4);
BEGIN
    IF p_organizacion_id IS NULL OR p_quote_id IS NULL OR p_almacen_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion, la cotizacion y el almacen son obligatorios';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'Los items de reserva son obligatorios';
    END IF;

    FOR v_item IN
        SELECT * FROM jsonb_to_recordset(p_items) AS x(quote_item_id uuid, catalog_item_id uuid, cantidad numeric)
        ORDER BY catalog_item_id, quote_item_id
    LOOP
        IF v_item.catalog_item_id IS NULL THEN CONTINUE; END IF;
        v_solicitado := round(COALESCE(v_item.cantidad, 0), 3);
        IF v_solicitado <= 0 THEN CONTINUE; END IF;

        SELECT * INTO v_catalog_item
          FROM public.catalog_items
         WHERE organizacion_id = p_organizacion_id AND id = v_item.catalog_item_id
         FOR SHARE;
        IF NOT FOUND OR v_catalog_item.maneja_inventario IS NOT TRUE THEN CONTINUE; END IF;

        SELECT * INTO v_existencia
          FROM public.inventario_existencias
         WHERE organizacion_id = p_organizacion_id
           AND catalog_item_id = v_item.catalog_item_id
           AND almacen_id = p_almacen_id
         FOR UPDATE;
        IF NOT FOUND THEN
            INSERT INTO public.inventario_existencias (
                organizacion_id, catalog_item_id, almacen_id, stock_actual, stock_reservado,
                stock_minimo, stock_objetivo, costo_ultimo, costo_promedio
            ) VALUES (
                p_organizacion_id, v_item.catalog_item_id, p_almacen_id, 0, 0,
                v_catalog_item.stock_minimo, v_catalog_item.stock_objetivo,
                COALESCE(v_catalog_item.costo_ultimo, 0),
                COALESCE(v_catalog_item.costo_promedio, v_catalog_item.costo_ultimo, 0)
            ) RETURNING * INTO v_existencia;
        END IF;

        v_disponible := round(GREATEST(0,
            COALESCE(v_existencia.stock_actual, 0) - COALESCE(v_existencia.stock_reservado, 0)), 3);
        v_reservar := LEAST(v_solicitado, v_disponible);
        IF v_reservar <= 0 THEN CONTINUE; END IF;

        UPDATE public.inventario_existencias
           SET stock_reservado = stock_reservado + v_reservar, actualizado_en = now()
         WHERE id = v_existencia.id;

        INSERT INTO public.inventario_reservas (
            organizacion_id, quote_id, quote_item_id, catalog_item_id, almacen_id,
            cantidad, estado, motivo, creado_por, creado_en
        ) VALUES (
            p_organizacion_id, p_quote_id, v_item.quote_item_id, v_item.catalog_item_id,
            p_almacen_id, v_reservar, 'activa', 'Reserva parcial por pedido confirmado', p_creado_por, now()
        );

        v_costo := COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo,
                            v_catalog_item.costo_promedio, v_catalog_item.costo_ultimo, 0);
        INSERT INTO public.inventario_movimientos (
            organizacion_id, catalog_item_id, almacen_id, tipo, cantidad_entrada,
            cantidad_salida, costo_unitario, costo_total, referencia_tipo,
            referencia_id, motivo, creado_por, creado_en
        ) VALUES (
            p_organizacion_id, v_item.catalog_item_id, p_almacen_id, 'reserva', 0,
            v_reservar, v_costo, round(v_reservar * v_costo, 4), 'cotizacion', p_quote_id,
            'Reserva parcial de inventario para pedido de cliente', p_creado_por, now()
        );
    END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_reservar_inventario_cotizacion(uuid,uuid,uuid,jsonb,uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_reservar_inventario_cotizacion(uuid,uuid,uuid,jsonb,uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.crm_aprobar_pedido_venta(
    p_organizacion_id uuid,
    p_pedido_venta_id uuid,
    p_usuario_id uuid,
    p_revision_cliente_validada boolean,
    p_revision_evidencia_validada boolean,
    p_revision_partidas_validada boolean,
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
        AND COALESCE(p_revision_partidas_validada,false)) THEN
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
                 AND ir.quote_item_id=pvi.cotizacion_item_id
                 AND ir.estado='activa'
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
                 AND ir.quote_item_id=pvi.cotizacion_item_id
                 AND ir.estado IN ('activa','consumida')
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
           revision_operativa_por_usuario_id=p_usuario_id,
           revision_operativa_en=now(),
           actualizado_en=now()
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
             THEN 'Pedido revisado y liberado con reserva parcial; el faltante queda pendiente de inventario.'
             ELSE 'Pedido revisado; venta formalizada, cuenta por cobrar creada y liberado a surtido.' END
    );
    RETURN QUERY SELECT v_result.venta_id,v_result.cliente_id,v_result.cuenta_por_cobrar_id,
                        v_result.venta_estatus,v_result.total,v_result.pago_acumulado,v_result.saldo;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_aprobar_pedido_venta(uuid,uuid,uuid,boolean,boolean,boolean,date)
    FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_aprobar_pedido_venta(uuid,uuid,uuid,boolean,boolean,boolean,date)
    TO service_role;

ALTER TABLE public.pedido_venta_eventos DROP CONSTRAINT pedido_venta_eventos_evento_check;
ALTER TABLE public.pedido_venta_eventos ADD CONSTRAINT pedido_venta_eventos_evento_check CHECK (evento IN (
    'enviado_formalizacion', 'devuelto_comercial', 'reenviado_formalizacion',
    'pedido_confirmado', 'pedido_liberado_surtido', 'reserva_inventario_oc',
    'reserva_inventario_reabastecimiento', 'pedido_cancelado'
));

CREATE OR REPLACE FUNCTION public.crm_reservar_faltante_pedido_venta(
    p_organizacion_id uuid,
    p_pedido_venta_id uuid,
    p_usuario_id uuid
)
RETURNS TABLE (cantidad_reservada numeric, cantidad_pendiente_inventario numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
    v_almacen_id uuid;
    v_items jsonb;
    v_reservado numeric(14,3);
    v_reservado_antes numeric(14,3);
    v_pendiente numeric(14,3);
BEGIN
    IF p_organizacion_id IS NULL OR p_pedido_venta_id IS NULL OR p_usuario_id IS NULL THEN
        RAISE EXCEPTION 'organization_order_and_user_required' USING ERRCODE='P0001';
    END IF;
    SELECT * INTO v_pedido FROM public.pedidos_venta
     WHERE organizacion_id=p_organizacion_id AND id=p_pedido_venta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE='P0001'; END IF;
    IF v_pedido.estatus<>'confirmado' OR v_pedido.estatus_logistico NOT IN ('pendiente','parcial') THEN
        RAISE EXCEPTION 'sales_order_not_open_for_fulfillment' USING ERRCODE='P0001';
    END IF;

    SELECT ir.almacen_id INTO v_almacen_id
      FROM public.inventario_reservas ir
     WHERE ir.organizacion_id=p_organizacion_id AND ir.pedido_venta_id=p_pedido_venta_id
     ORDER BY ir.creado_en,ir.id LIMIT 1;
    IF v_almacen_id IS NULL THEN
        SELECT a.id INTO v_almacen_id FROM public.almacenes a
         WHERE a.organizacion_id=p_organizacion_id AND a.activo IS TRUE
         ORDER BY a.es_principal DESC,a.id LIMIT 1;
    END IF;
    IF v_almacen_id IS NULL THEN RAISE EXCEPTION 'inventory_warehouse_required' USING ERRCODE='P0001'; END IF;

    SELECT COALESCE(sum(ir.cantidad),0) INTO v_reservado_antes
      FROM public.inventario_reservas ir
     WHERE ir.organizacion_id=p_organizacion_id AND ir.pedido_venta_id=p_pedido_venta_id
       AND ir.estado IN ('activa','consumida');

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
          SELECT sum(ir.cantidad) AS reservada FROM public.inventario_reservas ir
           WHERE ir.organizacion_id=p_organizacion_id AND ir.pedido_venta_id=p_pedido_venta_id
             AND ir.pedido_venta_item_id=pvi.id AND ir.estado IN ('activa','consumida')
      ) r ON true
     WHERE pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=p_pedido_venta_id
       AND pvi.cantidad>COALESCE(r.reservada,0);

    IF jsonb_array_length(v_items)>0 THEN
        PERFORM public.crm_reservar_inventario_cotizacion(
            p_organizacion_id,v_pedido.cotizacion_id,v_almacen_id,v_items,p_usuario_id
        );
        UPDATE public.inventario_reservas ir
           SET pedido_venta_id=p_pedido_venta_id,pedido_venta_item_id=pvi.id,
               motivo='Reserva de faltante al reabastecer inventario'
          FROM public.pedido_venta_items pvi
         WHERE ir.organizacion_id=p_organizacion_id AND ir.quote_id=v_pedido.cotizacion_id
           AND ir.quote_item_id=pvi.cotizacion_item_id
           AND pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=p_pedido_venta_id
           AND ir.estado='activa' AND ir.pedido_venta_id IS NULL;
    END IF;

    SELECT COALESCE(sum(ir.cantidad),0)
      INTO v_reservado
      FROM public.inventario_reservas ir
     WHERE ir.organizacion_id=p_organizacion_id AND ir.pedido_venta_id=p_pedido_venta_id
       AND ir.estado IN ('activa','consumida');
    SELECT COALESCE(sum(pvi.cantidad),0)-v_reservado INTO v_pendiente
      FROM public.pedido_venta_items pvi
      JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id
                                  AND ci.id=pvi.catalog_item_id AND ci.maneja_inventario
     WHERE pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=p_pedido_venta_id;
    IF v_reservado>v_reservado_antes THEN
        INSERT INTO public.pedido_venta_eventos(organizacion_id,pedido_venta_id,evento,actor_usuario_id,detalle)
        VALUES (p_organizacion_id,p_pedido_venta_id,'reserva_inventario_reabastecimiento',p_usuario_id,
                'Se reservaron unidades disponibles después de recibir inventario.');
    END IF;
    RETURN QUERY SELECT v_reservado,GREATEST(0,v_pendiente);
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_reservar_faltante_pedido_venta(uuid,uuid,uuid)
    FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_reservar_faltante_pedido_venta(uuid,uuid,uuid)
    TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
