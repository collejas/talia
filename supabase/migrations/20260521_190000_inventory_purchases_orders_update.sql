BEGIN;

-- Fase 5: actualizacion transaccional de ordenes de compra.
-- Objetivo:
-- - editar cabecera y lineas de una orden en una sola operacion;
-- - recalcular importes;
-- - mantener consistencia con el historial y la recepcion posterior.

DROP FUNCTION IF EXISTS public.crm_actualizar_orden_compra(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    timestamptz,
    date,
    character varying,
    uuid,
    uuid,
    text,
    text,
    text,
    jsonb
);

CREATE OR REPLACE FUNCTION public.crm_actualizar_orden_compra(
    p_organizacion_id uuid,
    p_orden_id uuid,
    p_proveedor_id uuid DEFAULT NULL,
    p_almacen_destino_id uuid DEFAULT NULL,
    p_folio text DEFAULT NULL,
    p_fecha_emision timestamptz DEFAULT NULL,
    p_fecha_entrega_estimada date DEFAULT NULL,
    p_moneda character varying DEFAULT NULL,
    p_solicitado_por_usuario_id uuid DEFAULT NULL,
    p_aprobado_por_usuario_id uuid DEFAULT NULL,
    p_referencia_externa text DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_instrucciones_entrega text DEFAULT NULL,
    p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orden public.ordenes_compra%ROWTYPE;
    v_proveedor public.proveedores%ROWTYPE;
    v_almacen public.almacenes%ROWTYPE;
    v_item record;
    v_catalog_item public.catalog_items%ROWTYPE;
    v_total_subtotal numeric(14,4) := 0;
    v_total_descuento numeric(14,4) := 0;
    v_total_impuestos numeric(14,4) := 0;
    v_total_final numeric(14,4) := 0;
    v_cantidad numeric(14,3);
    v_costo numeric(14,4);
    v_descuento numeric(5,2);
    v_impuestos numeric(14,4);
    v_subtotal_bruto numeric(14,4);
    v_descuento_monto numeric(14,4);
    v_subtotal_neto numeric(14,4);
    v_total_linea numeric(14,4);
    v_unidad text;
BEGIN
    IF p_organizacion_id IS NULL OR p_orden_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion y la orden son obligatorias';
    END IF;

    SELECT *
    INTO v_orden
    FROM public.ordenes_compra
    WHERE id = p_orden_id
      AND organizacion_id = p_organizacion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden de compra no encontrada';
    END IF;

    IF v_orden.estado IN ('recibida', 'cerrada', 'cancelada') THEN
        RAISE EXCEPTION 'No se puede editar una orden en estado %', v_orden.estado;
    END IF;

    IF p_proveedor_id IS NOT NULL THEN
        SELECT *
        INTO v_proveedor
        FROM public.proveedores
        WHERE id = p_proveedor_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Proveedor no encontrado';
        END IF;
    END IF;

    IF p_almacen_destino_id IS NOT NULL THEN
        SELECT *
        INTO v_almacen
        FROM public.almacenes
        WHERE id = p_almacen_destino_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Almacen destino no encontrado';
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La orden de compra debe incluir al menos un item';
    END IF;

    UPDATE public.ordenes_compra
    SET proveedor_id = coalesce(p_proveedor_id, proveedor_id),
        almacen_destino_id = coalesce(p_almacen_destino_id, almacen_destino_id),
        folio = coalesce(nullif(trim(p_folio), ''), folio),
        fecha_emision = coalesce(p_fecha_emision, fecha_emision),
        fecha_entrega_estimada = coalesce(p_fecha_entrega_estimada, fecha_entrega_estimada),
        moneda = upper(coalesce(p_moneda, moneda)),
        solicitado_por_usuario_id = coalesce(p_solicitado_por_usuario_id, solicitado_por_usuario_id),
        aprobado_por_usuario_id = coalesce(p_aprobado_por_usuario_id, aprobado_por_usuario_id),
        referencia_externa = p_referencia_externa,
        observaciones = p_observaciones,
        instrucciones_entrega = p_instrucciones_entrega
    WHERE id = p_orden_id;

    DELETE FROM public.ordenes_compra_items
    WHERE orden_compra_id = p_orden_id;

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_items) AS x(
            catalog_item_id uuid,
            proveedor_item_id uuid,
            cantidad_solicitada numeric,
            unidad text,
            costo_unitario numeric,
            descuento_porcentaje numeric,
            impuestos numeric,
            observaciones text
        )
    LOOP
        SELECT *
        INTO v_catalog_item
        FROM public.catalog_items
        WHERE id = v_item.catalog_item_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_item.catalog_item_id;
        END IF;

        v_cantidad := round(coalesce(v_item.cantidad_solicitada, 0), 3);
        v_costo := round(coalesce(v_item.costo_unitario, 0), 4);
        v_descuento := round(coalesce(v_item.descuento_porcentaje, 0), 2);
        v_impuestos := round(coalesce(v_item.impuestos, 0), 4);
        v_unidad := coalesce(nullif(trim(v_item.unidad), ''), v_catalog_item.unidad, 'unidad');

        IF v_cantidad <= 0 THEN
            RAISE EXCEPTION 'La cantidad solicitada debe ser mayor a cero';
        END IF;

        IF v_costo < 0 THEN
            RAISE EXCEPTION 'El costo unitario no puede ser negativo';
        END IF;

        IF v_descuento < 0 OR v_descuento > 100 THEN
            RAISE EXCEPTION 'El descuento debe estar entre 0 y 100';
        END IF;

        v_subtotal_bruto := round(v_cantidad * v_costo, 4);
        v_descuento_monto := round(v_subtotal_bruto * v_descuento / 100.0, 4);
        v_subtotal_neto := round(v_subtotal_bruto - v_descuento_monto, 4);
        v_total_linea := round(v_subtotal_neto + v_impuestos, 4);

        INSERT INTO public.ordenes_compra_items (
            organizacion_id,
            orden_compra_id,
            catalog_item_id,
            proveedor_item_id,
            cantidad_solicitada,
            cantidad_recibida,
            unidad,
            costo_unitario,
            descuento_porcentaje,
            subtotal,
            impuestos,
            total,
            observaciones
        ) VALUES (
            p_organizacion_id,
            p_orden_id,
            v_item.catalog_item_id,
            v_item.proveedor_item_id,
            v_cantidad,
            0,
            v_unidad,
            v_costo,
            NULLIF(v_descuento, 0),
            v_subtotal_neto,
            v_impuestos,
            v_total_linea,
            v_item.observaciones
        );

        v_total_subtotal := round(v_total_subtotal + v_subtotal_neto, 4);
        v_total_descuento := round(v_total_descuento + v_descuento_monto, 4);
        v_total_impuestos := round(v_total_impuestos + v_impuestos, 4);
        v_total_final := round(v_total_final + v_total_linea, 4);
    END LOOP;

    UPDATE public.ordenes_compra
    SET subtotal = v_total_subtotal,
        descuento_total = v_total_descuento,
        impuestos_total = v_total_impuestos,
        total = v_total_final
    WHERE id = p_orden_id;

    RETURN p_orden_id;
END;
$$;

COMMIT;
