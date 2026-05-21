BEGIN;

DROP FUNCTION IF EXISTS public.crm_ajustar_inventario(
    uuid,
    uuid,
    uuid,
    text,
    numeric,
    text,
    uuid
);

CREATE OR REPLACE FUNCTION public.crm_ajustar_inventario(
    p_organizacion_id uuid,
    p_catalog_item_id uuid,
    p_almacen_id uuid,
    p_sentido text,
    p_cantidad numeric,
    p_motivo text DEFAULT NULL,
    p_creado_por uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existencia public.inventario_existencias%ROWTYPE;
    v_catalog_item public.catalog_items%ROWTYPE;
    v_movimiento_id uuid := gen_random_uuid();
    v_cantidad numeric(14,3);
    v_delta numeric(14,3);
    v_tipo text;
    v_sentido text;
    v_nuevo_stock numeric(14,3);
    v_costo_unitario numeric(14,4);
BEGIN
    IF p_organizacion_id IS NULL OR p_catalog_item_id IS NULL OR p_almacen_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion, el producto y el almacen son obligatorios';
    END IF;

    v_cantidad := round(coalesce(p_cantidad, 0), 3);
    IF v_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
    END IF;

    SELECT *
    INTO v_catalog_item
    FROM public.catalog_items
    WHERE id = p_catalog_item_id
      AND organizacion_id = p_organizacion_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado';
    END IF;

    SELECT *
    INTO v_existencia
    FROM public.inventario_existencias
    WHERE organizacion_id = p_organizacion_id
      AND catalog_item_id = p_catalog_item_id
      AND almacen_id = p_almacen_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.inventario_existencias (
            organizacion_id,
            catalog_item_id,
            almacen_id,
            stock_actual,
            stock_reservado,
            stock_minimo,
            stock_objetivo,
            costo_ultimo,
            costo_promedio
        )
        VALUES (
            p_organizacion_id,
            p_catalog_item_id,
            p_almacen_id,
            0,
            0,
            v_catalog_item.stock_minimo,
            v_catalog_item.stock_objetivo,
            COALESCE(v_catalog_item.costo_ultimo, 0),
            COALESCE(v_catalog_item.costo_promedio, COALESCE(v_catalog_item.costo_ultimo, 0))
        )
        RETURNING * INTO v_existencia;
    END IF;

    v_sentido := lower(coalesce(nullif(trim(p_sentido), ''), ''));
    IF v_sentido = 'entrada' THEN
        v_delta := v_cantidad;
        v_tipo := 'ajuste_positivo';
    ELSIF v_sentido = 'salida' THEN
        v_delta := -v_cantidad;
        v_tipo := 'ajuste_negativo';
    ELSE
        RAISE EXCEPTION 'El sentido debe ser entrada o salida';
    END IF;

    v_nuevo_stock := round(COALESCE(v_existencia.stock_actual, 0) + v_delta, 3);
    IF v_nuevo_stock < 0 THEN
        RAISE EXCEPTION 'El ajuste deja el stock en negativo';
    END IF;

    v_costo_unitario := COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, v_catalog_item.costo_promedio, v_catalog_item.costo_ultimo, 0);

    UPDATE public.inventario_existencias
    SET stock_actual = v_nuevo_stock,
        stock_minimo = COALESCE(stock_minimo, v_catalog_item.stock_minimo),
        stock_objetivo = COALESCE(stock_objetivo, v_catalog_item.stock_objetivo),
        costo_ultimo = CASE WHEN v_sentido = 'entrada' THEN v_costo_unitario ELSE costo_ultimo END,
        costo_promedio = CASE WHEN v_sentido = 'entrada' THEN v_costo_unitario ELSE costo_promedio END,
        actualizado_en = now()
    WHERE id = v_existencia.id;

    INSERT INTO public.inventario_movimientos (
        id,
        organizacion_id,
        catalog_item_id,
        almacen_id,
        tipo,
        cantidad_entrada,
        cantidad_salida,
        costo_unitario,
        costo_total,
        referencia_tipo,
        referencia_id,
        motivo,
        creado_por,
        creado_en
    )
    VALUES (
        v_movimiento_id,
        p_organizacion_id,
        p_catalog_item_id,
        p_almacen_id,
        v_tipo,
        CASE WHEN v_sentido = 'entrada' THEN v_cantidad ELSE 0 END,
        CASE WHEN v_sentido = 'salida' THEN v_cantidad ELSE 0 END,
        v_costo_unitario,
        round(v_cantidad * v_costo_unitario, 4),
        'ajuste_inventario',
        v_movimiento_id,
        p_motivo,
        p_creado_por,
        now()
    );

    RETURN v_movimiento_id;
END;
$$;

COMMIT;
