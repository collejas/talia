BEGIN;

CREATE OR REPLACE FUNCTION public.trg_validar_recepcion_compra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orden public.ordenes_compra%ROWTYPE;
    v_almacen public.almacenes%ROWTYPE;
BEGIN
    SELECT *
    INTO v_orden
    FROM public.ordenes_compra
    WHERE id = NEW.orden_compra_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden de compra no encontrada';
    END IF;

    SELECT *
    INTO v_almacen
    FROM public.almacenes
    WHERE id = NEW.almacen_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Almacen no encontrado';
    END IF;

    NEW.organizacion_id := v_orden.organizacion_id;

    IF NEW.organizacion_id IS DISTINCT FROM v_orden.organizacion_id
       OR NEW.organizacion_id IS DISTINCT FROM v_almacen.organizacion_id THEN
        RAISE EXCEPTION 'La recepcion, la orden y el almacen deben pertenecer a la misma organizacion';
    END IF;

    IF v_orden.estado IN ('cancelada', 'cerrada') THEN
        RAISE EXCEPTION 'No se puede recepcionar una orden en estado %', v_orden.estado;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_validar_recepcion_compra() IS
    'Valida recepciones de compra permitiendo que el almacen de recepcion sea distinto al destino de la orden, siempre que pertenezca a la misma organizacion.';

COMMIT;
