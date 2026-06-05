BEGIN;

CREATE OR REPLACE FUNCTION public.eliminar_recepcion_compra(
    p_organizacion_id uuid,
    p_recepcion_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recepcion public.recepciones_compra%ROWTYPE;
    v_item record;
BEGIN
    SELECT *
    INTO v_recepcion
    FROM public.recepciones_compra
    WHERE id = p_recepcion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recepcion de compra no encontrada';
    END IF;

    IF v_recepcion.organizacion_id <> p_organizacion_id THEN
        RAISE EXCEPTION 'La recepcion debe pertenecer a la misma organizacion';
    END IF;

    FOR v_item IN
        SELECT id, catalog_item_id, cantidad_recibida
        FROM public.recepciones_compra_items
        WHERE recepcion_id = p_recepcion_id
    LOOP
        DELETE FROM public.inventario_movimientos
        WHERE referencia_tipo = 'recepcion_compra_item'
          AND referencia_id = v_item.id;

        UPDATE public.inventario_existencias
        SET stock_actual = GREATEST(stock_actual - COALESCE(v_item.cantidad_recibida, 0), 0),
            costo_ultimo = CASE
                WHEN stock_actual - COALESCE(v_item.cantidad_recibida, 0) <= 0 THEN NULL
                ELSE costo_ultimo
            END,
            costo_promedio = CASE
                WHEN stock_actual - COALESCE(v_item.cantidad_recibida, 0) <= 0 THEN NULL
                ELSE costo_promedio
            END,
            actualizado_en = now()
        WHERE organizacion_id = p_organizacion_id
          AND almacen_id = v_recepcion.almacen_id
          AND catalog_item_id = v_item.catalog_item_id;
    END LOOP;

    DELETE FROM public.recepciones_compra_items
    WHERE recepcion_id = p_recepcion_id;

    DELETE FROM public.recepciones_compra
    WHERE id = p_recepcion_id
      AND organizacion_id = p_organizacion_id;

    UPDATE public.ordenes_compra_items oi
    SET cantidad_recibida = COALESCE((
        SELECT SUM(rci.cantidad_recibida)
        FROM public.recepciones_compra_items rci
        JOIN public.recepciones_compra rc
            ON rc.id = rci.recepcion_id
        WHERE rci.orden_compra_item_id = oi.id
          AND rc.estado <> 'rechazada'
    ), 0)
    WHERE oi.orden_compra_id = v_recepcion.orden_compra_id;

    UPDATE public.ordenes_compra oc
    SET estado = CASE
        WHEN EXISTS (
            SELECT 1
            FROM public.ordenes_compra_items oi
            WHERE oi.orden_compra_id = oc.id
              AND oi.cantidad_recibida > 0
              AND oi.cantidad_recibida < oi.cantidad_solicitada
        ) THEN 'parcial'
        WHEN EXISTS (
            SELECT 1
            FROM public.ordenes_compra_items oi
            WHERE oi.orden_compra_id = oc.id
              AND oi.cantidad_recibida >= oi.cantidad_solicitada
        ) THEN 'recibida'
        ELSE 'aprobada'
    END
    WHERE oc.id = v_recepcion.orden_compra_id;

    RETURN p_recepcion_id;
END;
$$;

COMMENT ON FUNCTION public.eliminar_recepcion_compra(uuid, uuid) IS
    'Elimina una recepcion de compra y revierte inventario y cantidades recibidas.';

CREATE OR REPLACE FUNCTION public.actualizar_recepcion_compra(
    p_organizacion_id uuid,
    p_recepcion_id uuid,
    p_orden_compra_id uuid,
    p_almacen_id uuid,
    p_numero_recepcion text,
    p_recibido_por_usuario_id uuid DEFAULT NULL,
    p_referencia_externa text DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted uuid;
    v_new_recepcion_id uuid;
BEGIN
    v_deleted := public.eliminar_recepcion_compra(p_organizacion_id, p_recepcion_id);
    v_new_recepcion_id := public.registrar_recepcion_compra(
        p_organizacion_id,
        p_orden_compra_id,
        p_almacen_id,
        p_numero_recepcion,
        p_recibido_por_usuario_id,
        p_referencia_externa,
        p_observaciones,
        p_items
    );
    RETURN v_new_recepcion_id;
END;
$$;

COMMENT ON FUNCTION public.actualizar_recepcion_compra(uuid, uuid, uuid, uuid, text, uuid, text, text, jsonb) IS
    'Actualiza una recepcion de compra reemplazandola de forma transaccional.';

GRANT EXECUTE ON FUNCTION public.eliminar_recepcion_compra(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_recepcion_compra(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.eliminar_recepcion_compra(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.actualizar_recepcion_compra(uuid, uuid, uuid, uuid, text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_recepcion_compra(uuid, uuid, uuid, uuid, text, uuid, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.actualizar_recepcion_compra(uuid, uuid, uuid, uuid, text, uuid, text, text, jsonb) FROM anon;

COMMIT;
