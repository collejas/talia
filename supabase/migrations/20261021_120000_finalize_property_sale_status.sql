-- Finaliza el estado comercial de una unidad cuando se confirma su pedido de venta.
-- La operación mantiene la cotización/pedido/venta como fuente comercial y
-- registra el cambio inmobiliario en el historial de movimientos.

CREATE OR REPLACE FUNCTION public.crm_confirmar_pedido_venta(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid DEFAULT NULL,
    p_fecha_vencimiento date DEFAULT NULL,
    p_referencia_pedido_cliente text DEFAULT NULL,
    p_fecha_orden_cliente date DEFAULT NULL
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
    v_pedido_id uuid;
    v_pedido_status text;
    v_sale record;
    v_sale_id uuid;
    v_warehouse_id uuid;
    v_items jsonb;
    v_stock_item_count integer;
    v_unit record;
    v_unit_status public.propiedad_status;
    v_other_confirmed_order uuid;
    v_unit_price numeric;
BEGIN
    PERFORM public.crm_crear_pedido_venta(p_organizacion_id, p_cotizacion_id, p_usuario_id);
    SELECT pv.id, pv.estatus INTO v_pedido_id, v_pedido_status
      FROM public.pedidos_venta AS pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
     FOR UPDATE;
    IF v_pedido_status = 'cancelado' THEN
        RAISE EXCEPTION 'sales_order_cancelled' USING ERRCODE = 'P0001';
    END IF;

    IF v_pedido_status = 'confirmado' THEN
        RETURN QUERY
        SELECT v.id, v.cliente_id, c.id, v.estatus, v.total,
               COALESCE((SELECT sum(p.monto) FROM public.pagos AS p
                          WHERE p.organizacion_id = p_organizacion_id AND p.venta_id = v.id
                            AND p.estatus = 'confirmado'), 0), c.saldo
          FROM public.ventas AS v
          JOIN public.cuentas_por_cobrar AS c
            ON c.organizacion_id = v.organizacion_id AND c.venta_id = v.id
         WHERE v.organizacion_id = p_organizacion_id AND v.pedido_venta_id = v_pedido_id;
        RETURN;
    END IF;
    IF v_pedido_status NOT IN ('borrador', 'pendiente_confirmacion') THEN
        RAISE EXCEPTION 'sales_order_not_confirmable' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*)::integer INTO v_stock_item_count
      FROM public.pedido_venta_items AS pvi
      JOIN public.catalog_items AS ci
        ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id
     WHERE pvi.organizacion_id = p_organizacion_id
       AND pvi.pedido_venta_id = v_pedido_id
       AND ci.maneja_inventario IS TRUE;

    IF v_stock_item_count > 0 THEN
        SELECT a.id INTO v_warehouse_id
          FROM public.almacenes AS a
         WHERE a.organizacion_id = p_organizacion_id AND a.activo IS TRUE
         ORDER BY a.es_principal DESC, a.id
         LIMIT 1;
        IF v_warehouse_id IS NULL THEN
            RAISE EXCEPTION 'inventory_warehouse_required' USING ERRCODE = 'P0001';
        END IF;
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'quote_item_id', pvi.cotizacion_item_id,
                   'catalog_item_id', pvi.catalog_item_id,
                   'cantidad', pvi.cantidad
               ) ORDER BY pvi.orden), '[]'::jsonb)
          INTO v_items
          FROM public.pedido_venta_items AS pvi
          JOIN public.catalog_items AS ci
            ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_pedido_id
           AND ci.maneja_inventario IS TRUE
           AND NOT EXISTS (
               SELECT 1 FROM public.inventario_reservas AS ir
                WHERE ir.organizacion_id = p_organizacion_id
                  AND ir.quote_id = p_cotizacion_id
                  AND ir.quote_item_id = pvi.cotizacion_item_id
                  AND ir.estado = 'activa'
           );
        IF jsonb_array_length(v_items) > 0 THEN
            PERFORM public.crm_reservar_inventario_cotizacion(
                p_organizacion_id, p_cotizacion_id, v_warehouse_id, v_items, p_usuario_id
            );
        END IF;
    END IF;

    SELECT * INTO v_sale
      FROM public.crm_formalizar_venta(
          p_organizacion_id, p_cotizacion_id, p_usuario_id, p_fecha_vencimiento
      );
    v_sale_id := v_sale.venta_id;
    UPDATE public.ventas
       SET pedido_venta_id = v_pedido_id, actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_sale_id
       AND (pedido_venta_id IS NULL OR pedido_venta_id = v_pedido_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sale_linked_to_different_order' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.venta_items AS vi
       SET catalog_item_id = pvi.catalog_item_id,
           pedido_venta_item_id = pvi.id,
           actualizado_en = now()
      FROM public.pedido_venta_items AS pvi
     WHERE vi.organizacion_id = p_organizacion_id
       AND vi.venta_id = v_sale_id
       AND pvi.organizacion_id = p_organizacion_id
       AND pvi.pedido_venta_id = v_pedido_id
       AND pvi.orden = vi.orden;

    UPDATE public.inventario_reservas AS ir
       SET pedido_venta_id = v_pedido_id,
           pedido_venta_item_id = pvi.id,
           motivo = 'Reserva por pedido del cliente confirmado'
      FROM public.pedido_venta_items AS pvi
     WHERE ir.organizacion_id = p_organizacion_id
       AND ir.quote_id = p_cotizacion_id
       AND ir.quote_item_id = pvi.cotizacion_item_id
       AND pvi.organizacion_id = p_organizacion_id
       AND pvi.pedido_venta_id = v_pedido_id
       AND ir.estado = 'activa';

    FOR v_unit IN
        SELECT pvi.id AS pedido_item_id, pvi.unidad_id, pvi.catalog_item_id,
               pvi.precio_unitario_final AS precio_aplicado, pvi.moneda
          FROM public.pedido_venta_items AS pvi
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_pedido_id AND pvi.unidad_id IS NOT NULL
    LOOP
        SELECT u.status, u.precio INTO v_unit_status, v_unit_price
          FROM public.propiedad_unidades AS u
         WHERE u.id = v_unit.unidad_id
           AND u.catalog_item_id = v_unit.catalog_item_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
        END IF;
        IF v_unit_status NOT IN ('disponible'::public.propiedad_status,
                                 'apartado'::public.propiedad_status,
                                 'reservado'::public.propiedad_status) THEN
            RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
        END IF;
        SELECT pvi.pedido_venta_id INTO v_other_confirmed_order
          FROM public.pedido_venta_items AS pvi
          JOIN public.pedidos_venta AS pv
            ON pv.organizacion_id = pvi.organizacion_id AND pv.id = pvi.pedido_venta_id
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.unidad_id = v_unit.unidad_id
           AND pv.estatus = 'confirmado'
           AND pv.id <> v_pedido_id
         LIMIT 1;
        IF v_other_confirmed_order IS NOT NULL THEN
            RAISE EXCEPTION 'property_unit_already_reserved' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.propiedad_unidades AS u
           SET status = 'vendido'::public.propiedad_status,
               actualizado_en = now()
         WHERE u.id = v_unit.unidad_id
           AND u.catalog_item_id = v_unit.catalog_item_id
           AND u.status IN ('disponible'::public.propiedad_status,
                            'apartado'::public.propiedad_status,
                            'reservado'::public.propiedad_status);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
        END IF;
        INSERT INTO public.propiedad_unidad_movimientos (
            organizacion_id, unidad_id, oportunidad_id, persona_id, cuenta_id,
            estado_anterior, estado_nuevo, precio, moneda, motivo, creado_por
        )
        SELECT p_organizacion_id, v_unit.unidad_id, q.oportunidad_id,
               COALESCE(q.persona_id, q.contacto_id), q.cuenta_id,
               v_unit_status, 'vendido'::public.propiedad_status,
               COALESCE(v_unit.precio_aplicado, v_unit_price, q.total),
               COALESCE(v_unit.moneda, q.moneda, 'MXN'),
               'venta_inmobiliaria_confirmada', p_usuario_id
          FROM public.cotizaciones AS q
         WHERE q.organizacion_id = p_organizacion_id
           AND q.id = p_cotizacion_id;
    END LOOP;

    UPDATE public.pedidos_venta
       SET estatus = 'confirmado',
           referencia_pedido_cliente = COALESCE(NULLIF(btrim(p_referencia_pedido_cliente), ''), referencia_pedido_cliente),
           fecha_orden_cliente = COALESCE(p_fecha_orden_cliente, fecha_orden_cliente),
           confirmado_en = now(), confirmado_por_usuario_id = p_usuario_id,
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_pedido_id;

    RETURN QUERY SELECT v_sale.venta_id, v_sale.cliente_id, v_sale.cuenta_por_cobrar_id,
                        v_sale.venta_estatus, v_sale.total, v_sale.pago_acumulado, v_sale.saldo;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_confirmar_pedido_venta(uuid, uuid, uuid, date, text, date)
    FROM PUBLIC, anon, authenticated;
