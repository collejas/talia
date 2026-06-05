BEGIN;

CREATE OR REPLACE FUNCTION public.trg_validar_recepcion_compra_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recepcion public.recepciones_compra%ROWTYPE;
    v_orden_item public.ordenes_compra_items%ROWTYPE;
    v_orden public.ordenes_compra%ROWTYPE;
    v_recibido_total numeric(14,3);
BEGIN
    SELECT *
    INTO v_recepcion
    FROM public.recepciones_compra
    WHERE id = NEW.recepcion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recepcion de compra no encontrada';
    END IF;

    IF v_recepcion.estado = 'rechazada' THEN
        RAISE EXCEPTION 'No se pueden agregar items a una recepcion rechazada';
    END IF;

    SELECT *
    INTO v_orden_item
    FROM public.ordenes_compra_items
    WHERE id = NEW.orden_compra_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Linea de orden de compra no encontrada';
    END IF;

    SELECT *
    INTO v_orden
    FROM public.ordenes_compra
    WHERE id = v_orden_item.orden_compra_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden de compra no encontrada';
    END IF;

    NEW.organizacion_id := v_recepcion.organizacion_id;

    IF NEW.organizacion_id IS DISTINCT FROM v_orden.organizacion_id
       OR NEW.organizacion_id IS DISTINCT FROM v_orden_item.organizacion_id THEN
        RAISE EXCEPTION 'El item de recepcion debe pertenecer a la misma organizacion que la recepcion y la orden';
    END IF;

    IF v_recepcion.orden_compra_id IS DISTINCT FROM v_orden.id THEN
        RAISE EXCEPTION 'La recepcion no corresponde a la orden de compra indicada';
    END IF;

    IF NEW.catalog_item_id IS DISTINCT FROM v_orden_item.catalog_item_id THEN
        RAISE EXCEPTION 'El catalog_item_id de la recepcion no coincide con la linea de la orden';
    END IF;

    SELECT COALESCE(SUM(cantidad_recibida), 0)
    INTO v_recibido_total
    FROM public.recepciones_compra_items
    WHERE orden_compra_item_id = NEW.orden_compra_item_id;

    IF v_recibido_total + NEW.cantidad_recibida > v_orden_item.cantidad_solicitada THEN
        RAISE EXCEPTION 'La cantidad recibida excede la cantidad solicitada en la orden';
    END IF;

    NEW.organizacion_id := v_recepcion.organizacion_id;
    NEW.subtotal := round(NEW.cantidad_recibida * NEW.costo_unitario_real, 4);

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_validar_recepcion_compra_item() IS
    'Valida items de recepcion de compra permitiendo recibir en un almacen distinto al destino de la orden, siempre que pertenezca a la misma organizacion.';

COMMIT;
