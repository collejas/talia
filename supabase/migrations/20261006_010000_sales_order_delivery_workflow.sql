BEGIN;

ALTER TABLE public.pedido_venta_entregas
    ADD COLUMN estado text NOT NULL DEFAULT 'entregada',
    ADD COLUMN salida_en timestamptz,
    ADD COLUMN en_ruta_en timestamptz,
    ADD COLUMN entregada_en timestamptz,
    ADD COLUMN no_entregada_en timestamptz,
    ADD COLUMN motivo_no_entrega text,
    ADD COLUMN actualizado_por_usuario_id uuid,
    ADD CONSTRAINT pedido_venta_entregas_estado_check
        CHECK (estado IN ('preparada', 'en_ruta', 'entregada', 'no_entregada')),
    ADD CONSTRAINT pedido_venta_entregas_motivo_no_entrega_check
        CHECK (estado <> 'no_entregada' OR NULLIF(btrim(motivo_no_entrega), '') IS NOT NULL),
    ADD CONSTRAINT pedido_venta_entregas_actualizado_usuario_fkey
        FOREIGN KEY (actualizado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

UPDATE public.pedido_venta_entregas
   SET entregada_en = COALESCE(entregada_en, creado_en)
 WHERE estado = 'entregada';

CREATE INDEX pedido_venta_entregas_org_estado_fecha_idx
    ON public.pedido_venta_entregas (organizacion_id, estado, creado_en DESC);

CREATE OR REPLACE FUNCTION public.crm_preparar_entrega_pedido_venta(
    p_organizacion_id uuid,
    p_pedido_venta_id uuid,
    p_items jsonb,
    p_fecha_entrega date DEFAULT CURRENT_DATE,
    p_referencia text DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (entrega_id uuid, entrega_estado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
    v_input record;
    v_reserva record;
    v_entrega_id uuid;
    v_item_id uuid;
    v_restante numeric(14,3);
    v_disponible numeric(14,3);
    v_en_ruta numeric(14,3);
    v_cantidad numeric(14,3);
    v_tiene_control boolean;
BEGIN
    IF p_organizacion_id IS NULL OR p_pedido_venta_id IS NULL
       OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'delivery_items_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_pedido FROM public.pedidos_venta
     WHERE organizacion_id = p_organizacion_id AND id = p_pedido_venta_id FOR UPDATE;
    IF NOT FOUND OR v_pedido.estatus <> 'confirmado' THEN
        RAISE EXCEPTION 'confirmed_order_required' USING ERRCODE = 'P0001';
    END IF;

    FOR v_input IN SELECT x.item_id, x.cantidad FROM jsonb_to_recordset(p_items) AS x(item_id uuid, cantidad numeric)
    LOOP
        IF v_input.item_id IS NULL OR v_input.cantidad IS NULL OR v_input.cantidad <= 0 THEN
            RAISE EXCEPTION 'invalid_delivery_item' USING ERRCODE = 'P0001';
        END IF;
        IF (SELECT count(*) FROM jsonb_to_recordset(p_items) AS x(item_id uuid, cantidad numeric) WHERE x.item_id = v_input.item_id) > 1 THEN
            RAISE EXCEPTION 'duplicate_delivery_item' USING ERRCODE = 'P0001';
        END IF;
        SELECT pvi.id INTO v_item_id FROM public.pedido_venta_items pvi
         WHERE pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = p_pedido_venta_id AND pvi.id = v_input.item_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'order_item_not_found' USING ERRCODE = 'P0001'; END IF;
        SELECT EXISTS (
            SELECT 1 FROM public.catalog_items ci
             JOIN public.pedido_venta_items pvi ON pvi.organizacion_id = ci.organizacion_id AND pvi.catalog_item_id = ci.id
            WHERE pvi.organizacion_id = p_organizacion_id AND pvi.id = v_input.item_id AND ci.maneja_inventario
        ) INTO v_tiene_control;
        IF NOT v_tiene_control THEN RAISE EXCEPTION 'inventory_item_required' USING ERRCODE = 'P0001'; END IF;
        SELECT COALESCE(sum(ir.cantidad - ir.cantidad_surtida), 0) INTO v_disponible
          FROM public.inventario_reservas ir
         WHERE ir.organizacion_id = p_organizacion_id AND ir.pedido_venta_item_id = v_input.item_id AND ir.estado = 'activa';
        SELECT COALESCE(sum(ei.cantidad), 0) INTO v_en_ruta
          FROM public.pedido_venta_entrega_items ei
          JOIN public.pedido_venta_entregas e ON e.organizacion_id = ei.organizacion_id AND e.id = ei.entrega_id
         WHERE ei.organizacion_id = p_organizacion_id AND ei.pedido_venta_item_id = v_input.item_id AND e.estado IN ('preparada', 'en_ruta');
        IF v_input.cantidad > v_disponible - v_en_ruta THEN
            RAISE EXCEPTION 'delivery_exceeds_reserved_or_ordered_quantity' USING ERRCODE = 'P0001';
        END IF;
    END LOOP;

    INSERT INTO public.pedido_venta_entregas (organizacion_id, pedido_venta_id, fecha_entrega, referencia, observaciones, creado_por_usuario_id, estado, salida_en)
    VALUES (p_organizacion_id, p_pedido_venta_id, COALESCE(p_fecha_entrega, CURRENT_DATE), NULLIF(btrim(p_referencia), ''), NULLIF(btrim(p_observaciones), ''), p_usuario_id, 'preparada', now())
    RETURNING id INTO v_entrega_id;

    FOR v_input IN SELECT x.item_id, x.cantidad FROM jsonb_to_recordset(p_items) AS x(item_id uuid, cantidad numeric)
    LOOP
        v_restante := v_input.cantidad;
        FOR v_reserva IN
            SELECT ir.* FROM public.inventario_reservas ir
             WHERE ir.organizacion_id = p_organizacion_id AND ir.pedido_venta_item_id = v_input.item_id AND ir.estado = 'activa'
             ORDER BY ir.creado_en, ir.id FOR UPDATE
        LOOP
            EXIT WHEN v_restante <= 0;
            SELECT COALESCE(sum(ei.cantidad), 0) INTO v_en_ruta
              FROM public.pedido_venta_entrega_items ei
              JOIN public.pedido_venta_entregas e ON e.organizacion_id = ei.organizacion_id AND e.id = ei.entrega_id
             WHERE ei.organizacion_id = p_organizacion_id AND ei.reserva_id = v_reserva.id AND e.estado IN ('preparada', 'en_ruta');
            v_cantidad := LEAST(v_restante, v_reserva.cantidad - v_reserva.cantidad_surtida - v_en_ruta);
            CONTINUE WHEN v_cantidad <= 0;
            INSERT INTO public.pedido_venta_entrega_items (organizacion_id, entrega_id, pedido_venta_id, pedido_venta_item_id, reserva_id, catalog_item_id, almacen_id, cantidad)
            VALUES (p_organizacion_id, v_entrega_id, p_pedido_venta_id, v_input.item_id, v_reserva.id, v_reserva.catalog_item_id, v_reserva.almacen_id, v_cantidad);
            v_restante := v_restante - v_cantidad;
        END LOOP;
        IF v_restante > 0 THEN RAISE EXCEPTION 'delivery_reservation_shortfall' USING ERRCODE = 'P0001'; END IF;
    END LOOP;
    RETURN QUERY SELECT v_entrega_id, 'preparada'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_marcar_entrega_en_ruta(
    p_organizacion_id uuid,
    p_entrega_id uuid,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (entrega_id uuid, entrega_estado text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
BEGIN
    UPDATE public.pedido_venta_entregas
       SET estado = 'en_ruta', en_ruta_en = COALESCE(en_ruta_en, now()), actualizado_por_usuario_id = p_usuario_id
     WHERE organizacion_id = p_organizacion_id AND id = p_entrega_id AND estado = 'preparada';
    IF NOT FOUND THEN RAISE EXCEPTION 'delivery_not_prepared' USING ERRCODE = 'P0001'; END IF;
    RETURN QUERY SELECT p_entrega_id, 'en_ruta'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_confirmar_entrega_pedido_venta(
    p_organizacion_id uuid,
    p_entrega_id uuid,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (entrega_id uuid, entrega_estado text, pedido_estatus_logistico text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
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
    SELECT * INTO v_entrega FROM public.pedido_venta_entregas WHERE organizacion_id = p_organizacion_id AND id = p_entrega_id FOR UPDATE;
    IF NOT FOUND OR v_entrega.estado NOT IN ('preparada', 'en_ruta') THEN RAISE EXCEPTION 'delivery_not_open' USING ERRCODE = 'P0001'; END IF;
    FOR v_item IN SELECT * FROM public.pedido_venta_entrega_items WHERE organizacion_id = p_organizacion_id AND entrega_id = p_entrega_id FOR UPDATE LOOP
        SELECT * INTO v_reserva FROM public.inventario_reservas WHERE organizacion_id = p_organizacion_id AND id = v_item.reserva_id FOR UPDATE;
        SELECT * INTO v_existencia FROM public.inventario_existencias WHERE organizacion_id = p_organizacion_id AND catalog_item_id = v_item.catalog_item_id AND almacen_id = v_item.almacen_id FOR UPDATE;
        IF NOT FOUND OR v_existencia.stock_actual < v_item.cantidad OR v_existencia.stock_reservado < v_item.cantidad OR v_reserva.cantidad - v_reserva.cantidad_surtida < v_item.cantidad THEN
            RAISE EXCEPTION 'inventory_balance_inconsistent' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.inventario_existencias SET stock_actual = stock_actual - v_item.cantidad, stock_reservado = stock_reservado - v_item.cantidad, actualizado_en = now() WHERE id = v_existencia.id;
        UPDATE public.inventario_reservas SET cantidad_surtida = cantidad_surtida + v_item.cantidad, estado = CASE WHEN cantidad_surtida + v_item.cantidad = cantidad THEN 'consumida' ELSE 'activa' END WHERE id = v_reserva.id;
        INSERT INTO public.inventario_movimientos (organizacion_id, catalog_item_id, almacen_id, tipo, cantidad_salida, costo_unitario, costo_total, referencia_tipo, referencia_id, motivo, creado_por, pedido_venta_entrega_item_id)
        VALUES (p_organizacion_id, v_item.catalog_item_id, v_item.almacen_id, 'salida_venta', v_item.cantidad, COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, 0), round(v_item.cantidad * COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, 0), 4), 'pedido_venta_entrega', p_entrega_id, 'Salida por entrega confirmada de pedido', p_usuario_id, v_item.id);
    END LOOP;
    UPDATE public.pedido_venta_entregas SET estado = 'entregada', entregada_en = now(), actualizado_por_usuario_id = p_usuario_id WHERE organizacion_id = p_organizacion_id AND id = p_entrega_id;
    SELECT EXISTS (SELECT 1 FROM public.pedido_venta_items pvi JOIN public.catalog_items ci ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id AND ci.maneja_inventario WHERE pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = v_entrega.pedido_venta_id) INTO v_tiene_control;
    SELECT EXISTS (SELECT 1 FROM public.pedido_venta_items pvi JOIN public.catalog_items ci ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id AND ci.maneja_inventario LEFT JOIN (SELECT ei.pedido_venta_item_id, sum(ei.cantidad) cantidad FROM public.pedido_venta_entrega_items ei JOIN public.pedido_venta_entregas e ON e.organizacion_id = ei.organizacion_id AND e.id = ei.entrega_id AND e.estado = 'entregada' WHERE ei.organizacion_id = p_organizacion_id GROUP BY ei.pedido_venta_item_id) d ON d.pedido_venta_item_id = pvi.id WHERE pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = v_entrega.pedido_venta_id AND COALESCE(d.cantidad, 0) < pvi.cantidad) INTO v_pendiente;
    v_pedido_estado := CASE WHEN NOT v_tiene_control THEN 'no_aplica' WHEN v_pendiente THEN 'parcial' ELSE 'entregado' END;
    UPDATE public.pedidos_venta SET estatus_logistico = v_pedido_estado, actualizado_en = now() WHERE organizacion_id = p_organizacion_id AND id = v_entrega.pedido_venta_id;
    RETURN QUERY SELECT p_entrega_id, 'entregada'::text, v_pedido_estado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_marcar_entrega_no_realizada(
    p_organizacion_id uuid,
    p_entrega_id uuid,
    p_motivo text,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (entrega_id uuid, entrega_estado text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
BEGIN
    IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'delivery_failure_reason_required' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.pedido_venta_entregas
       SET estado = 'no_entregada', motivo_no_entrega = btrim(p_motivo), no_entregada_en = now(), actualizado_por_usuario_id = p_usuario_id
     WHERE organizacion_id = p_organizacion_id AND id = p_entrega_id AND estado IN ('preparada', 'en_ruta');
    IF NOT FOUND THEN RAISE EXCEPTION 'delivery_not_open' USING ERRCODE = 'P0001'; END IF;
    RETURN QUERY SELECT p_entrega_id, 'no_entregada'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_preparar_entrega_pedido_venta(uuid, uuid, jsonb, date, text, text, uuid), public.crm_marcar_entrega_en_ruta(uuid, uuid, uuid), public.crm_confirmar_entrega_pedido_venta(uuid, uuid, uuid), public.crm_marcar_entrega_no_realizada(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_preparar_entrega_pedido_venta(uuid, uuid, jsonb, date, text, text, uuid), public.crm_marcar_entrega_en_ruta(uuid, uuid, uuid), public.crm_confirmar_entrega_pedido_venta(uuid, uuid, uuid), public.crm_marcar_entrega_no_realizada(uuid, uuid, text, uuid) TO service_role;

COMMIT;
