-- Fixes the delivery confirmation RPC ambiguity between the output column
-- entrega_id and pedido_venta_entrega_items.entrega_id.
CREATE OR REPLACE FUNCTION public.crm_confirmar_entrega_pedido_venta(
    p_organizacion_id uuid,
    p_entrega_id uuid,
    p_usuario_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(entrega_id uuid, entrega_estado text, pedido_estatus_logistico text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_entrega public.pedido_venta_entregas%ROWTYPE;
    v_item record;
    v_existencia public.inventario_existencias%ROWTYPE;
    v_reserva public.inventario_reservas%ROWTYPE;
    v_pendiente boolean;
    v_tiene_control boolean;
    v_pedido_estado text;
BEGIN
    SELECT * INTO v_entrega
      FROM public.pedido_venta_entregas AS pe
     WHERE pe.organizacion_id = p_organizacion_id
       AND pe.id = p_entrega_id
     FOR UPDATE;

    IF NOT FOUND OR v_entrega.estado NOT IN ('preparada', 'en_ruta') THEN
        RAISE EXCEPTION 'delivery_not_open' USING ERRCODE = 'P0001';
    END IF;

    FOR v_item IN
        SELECT *
          FROM public.pedido_venta_entrega_items AS ei
         WHERE ei.organizacion_id = p_organizacion_id
           AND ei.entrega_id = p_entrega_id
         FOR UPDATE
    LOOP
        SELECT * INTO v_reserva
          FROM public.inventario_reservas AS ir
         WHERE ir.organizacion_id = p_organizacion_id
           AND ir.id = v_item.reserva_id
         FOR UPDATE;

        SELECT * INTO v_existencia
          FROM public.inventario_existencias AS ix
         WHERE ix.organizacion_id = p_organizacion_id
           AND ix.catalog_item_id = v_item.catalog_item_id
           AND ix.almacen_id = v_item.almacen_id
         FOR UPDATE;

        IF NOT FOUND
           OR v_existencia.stock_actual < v_item.cantidad
           OR v_existencia.stock_reservado < v_item.cantidad
           OR v_reserva.cantidad - v_reserva.cantidad_surtida < v_item.cantidad THEN
            RAISE EXCEPTION 'inventory_balance_inconsistent' USING ERRCODE = 'P0001';
        END IF;

        UPDATE public.inventario_existencias
           SET stock_actual = stock_actual - v_item.cantidad,
               stock_reservado = stock_reservado - v_item.cantidad,
               actualizado_en = now()
         WHERE id = v_existencia.id;

        UPDATE public.inventario_reservas
           SET cantidad_surtida = cantidad_surtida + v_item.cantidad,
               estado = CASE
                   WHEN cantidad_surtida + v_item.cantidad = cantidad THEN 'consumida'
                   ELSE 'activa'
               END
         WHERE id = v_reserva.id;

        INSERT INTO public.inventario_movimientos (
            organizacion_id, catalog_item_id, almacen_id, tipo,
            cantidad_salida, costo_unitario, costo_total, referencia_tipo,
            referencia_id, motivo, creado_por, pedido_venta_entrega_item_id
        )
        VALUES (
            p_organizacion_id, v_item.catalog_item_id, v_item.almacen_id,
            'salida_venta', v_item.cantidad,
            COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, 0),
            round(v_item.cantidad * COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, 0), 4),
            'pedido_venta_entrega', p_entrega_id,
            'Salida por entrega confirmada de pedido', p_usuario_id, v_item.id
        );
    END LOOP;

    UPDATE public.pedido_venta_entregas
       SET estado = 'entregada', entregada_en = now(), actualizado_por_usuario_id = p_usuario_id
     WHERE organizacion_id = p_organizacion_id
       AND id = p_entrega_id;

    SELECT EXISTS (
        SELECT 1
          FROM public.pedido_venta_items AS pvi
          JOIN public.catalog_items AS ci
            ON ci.organizacion_id = pvi.organizacion_id
           AND ci.id = pvi.catalog_item_id
           AND ci.maneja_inventario
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_entrega.pedido_venta_id
    ) INTO v_tiene_control;

    SELECT EXISTS (
        SELECT 1
          FROM public.pedido_venta_items AS pvi
          JOIN public.catalog_items AS ci
            ON ci.organizacion_id = pvi.organizacion_id
           AND ci.id = pvi.catalog_item_id
           AND ci.maneja_inventario
          LEFT JOIN (
              SELECT ei.pedido_venta_item_id, sum(ei.cantidad) AS cantidad
                FROM public.pedido_venta_entrega_items AS ei
                JOIN public.pedido_venta_entregas AS e
                  ON e.organizacion_id = ei.organizacion_id
                 AND e.id = ei.entrega_id
                 AND e.estado = 'entregada'
               WHERE ei.organizacion_id = p_organizacion_id
               GROUP BY ei.pedido_venta_item_id
          ) AS d ON d.pedido_venta_item_id = pvi.id
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_entrega.pedido_venta_id
           AND COALESCE(d.cantidad, 0) < pvi.cantidad
    ) INTO v_pendiente;

    v_pedido_estado := CASE
        WHEN NOT v_tiene_control THEN 'no_aplica'
        WHEN v_pendiente THEN 'parcial'
        ELSE 'entregado'
    END;

    UPDATE public.pedidos_venta
       SET estatus_logistico = v_pedido_estado, actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id
       AND id = v_entrega.pedido_venta_id;

    RETURN QUERY SELECT p_entrega_id, 'entregada'::text, v_pedido_estado;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_confirmar_entrega_pedido_venta(uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_confirmar_entrega_pedido_venta(uuid, uuid, uuid)
    TO service_role;
