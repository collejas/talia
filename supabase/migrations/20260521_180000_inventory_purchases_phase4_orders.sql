BEGIN;

-- Fase 4: alta transaccional de ordenes de compra.
-- Objetivo:
-- - crear cabecera y lineas en una sola operacion;
-- - calcular subtotales y totales de forma consistente;
-- - validar proveedor, almacen y productos antes de guardar.

DROP FUNCTION IF EXISTS public.crm_crear_orden_compra(
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

CREATE OR REPLACE FUNCTION public.crm_crear_orden_compra(
    p_organizacion_id uuid,
    p_proveedor_id uuid,
    p_almacen_destino_id uuid,
    p_folio text,
    p_fecha_emision timestamptz DEFAULT now(),
    p_fecha_entrega_estimada date DEFAULT NULL,
    p_moneda character varying DEFAULT 'MXN',
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
    v_proveedor public.proveedores%ROWTYPE;
    v_almacen public.almacenes%ROWTYPE;
    v_orden_id uuid;
    v_item record;
    v_catalog_item public.catalog_items%ROWTYPE;
    v_proveedor_item public.proveedor_items%ROWTYPE;
    v_unidad text;
    v_cantidad numeric(14,3);
    v_costo numeric(14,4);
    v_descuento numeric(5,2);
    v_impuestos numeric(14,4);
    v_subtotal_bruto numeric(14,4);
    v_descuento_monto numeric(14,4);
    v_subtotal_neto numeric(14,4);
    v_total_linea numeric(14,4);
    v_total_subtotal numeric(14,4) := 0;
    v_total_descuento numeric(14,4) := 0;
    v_total_impuestos numeric(14,4) := 0;
    v_total_final numeric(14,4) := 0;
BEGIN
    IF p_organizacion_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion es obligatoria';
    END IF;

    IF p_proveedor_id IS NULL THEN
        RAISE EXCEPTION 'El proveedor es obligatorio';
    END IF;

    IF p_almacen_destino_id IS NULL THEN
        RAISE EXCEPTION 'El almacen destino es obligatorio';
    END IF;

    IF p_folio IS NULL OR length(trim(p_folio)) = 0 THEN
        RAISE EXCEPTION 'El folio es obligatorio';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La orden de compra debe incluir al menos un item';
    END IF;

    SELECT *
    INTO v_proveedor
    FROM public.proveedores
    WHERE id = p_proveedor_id
      AND organizacion_id = p_organizacion_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proveedor no encontrado';
    END IF;

    SELECT *
    INTO v_almacen
    FROM public.almacenes
    WHERE id = p_almacen_destino_id
      AND organizacion_id = p_organizacion_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Almacen destino no encontrado';
    END IF;

    INSERT INTO public.ordenes_compra (
        organizacion_id,
        folio,
        proveedor_id,
        almacen_destino_id,
        estado,
        fecha_emision,
        fecha_entrega_estimada,
        moneda,
        subtotal,
        descuento_total,
        impuestos_total,
        total,
        solicitado_por_usuario_id,
        aprobado_por_usuario_id,
        referencia_externa,
        observaciones,
        instrucciones_entrega
    ) VALUES (
        p_organizacion_id,
        trim(p_folio),
        p_proveedor_id,
        p_almacen_destino_id,
        'borrador',
        coalesce(p_fecha_emision, now()),
        p_fecha_entrega_estimada,
        upper(coalesce(p_moneda, 'MXN')),
        0,
        0,
        0,
        0,
        p_solicitado_por_usuario_id,
        p_aprobado_por_usuario_id,
        p_referencia_externa,
        p_observaciones,
        p_instrucciones_entrega
    )
    RETURNING id INTO v_orden_id;

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
        IF v_item.catalog_item_id IS NULL THEN
            RAISE EXCEPTION 'Cada item debe incluir catalog_item_id';
        END IF;

        SELECT *
        INTO v_catalog_item
        FROM public.catalog_items
        WHERE id = v_item.catalog_item_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_item.catalog_item_id;
        END IF;

        IF v_item.proveedor_item_id IS NOT NULL THEN
            SELECT *
            INTO v_proveedor_item
            FROM public.proveedor_items
            WHERE id = v_item.proveedor_item_id
              AND organizacion_id = p_organizacion_id
              AND proveedor_id = p_proveedor_id
              AND catalog_item_id = v_item.catalog_item_id
            FOR SHARE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'El proveedor_item no coincide con el proveedor o el producto';
            END IF;
        ELSE
            v_proveedor_item := NULL;
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
            v_orden_id,
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
    WHERE id = v_orden_id;

    RETURN v_orden_id;
END;
$$;

COMMIT;
