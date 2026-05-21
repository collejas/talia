BEGIN;

-- RPC transaccional para registrar una recepcion con sus lineas.
-- Se apoya en los triggers ya existentes para validar, actualizar stock y recalcular el estado de la OC.

DROP FUNCTION IF EXISTS public.registrar_recepcion_compra(
    uuid,
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    jsonb
);

CREATE OR REPLACE FUNCTION public.registrar_recepcion_compra(
    p_organizacion_id uuid,
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
    v_recepcion_id uuid;
BEGIN
    IF p_organizacion_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion es requerida';
    END IF;
    IF p_orden_compra_id IS NULL THEN
        RAISE EXCEPTION 'La orden de compra es requerida';
    END IF;
    IF p_almacen_id IS NULL THEN
        RAISE EXCEPTION 'El almacen es requerido';
    END IF;
    IF length(trim(coalesce(p_numero_recepcion, ''))) = 0 THEN
        RAISE EXCEPTION 'El numero de recepcion es requerido';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Se requiere al menos una linea de recepcion';
    END IF;

    INSERT INTO public.recepciones_compra (
        organizacion_id,
        orden_compra_id,
        almacen_id,
        numero_recepcion,
        estado,
        recibido_por_usuario_id,
        recibido_en,
        referencia_externa,
        observaciones
    )
    VALUES (
        p_organizacion_id,
        p_orden_compra_id,
        p_almacen_id,
        trim(p_numero_recepcion),
        'parcial',
        p_recibido_por_usuario_id,
        now(),
        nullif(trim(coalesce(p_referencia_externa, '')), ''),
        nullif(trim(coalesce(p_observaciones, '')), '')
    )
    RETURNING id INTO v_recepcion_id;

    INSERT INTO public.recepciones_compra_items (
        organizacion_id,
        recepcion_id,
        orden_compra_item_id,
        catalog_item_id,
        cantidad_recibida,
        costo_unitario_real,
        subtotal,
        lote_codigo,
        fecha_caducidad,
        serie,
        observaciones
    )
    SELECT
        p_organizacion_id,
        v_recepcion_id,
        src.orden_compra_item_id,
        src.catalog_item_id,
        src.cantidad_recibida,
        src.costo_unitario_real,
        0,
        nullif(trim(coalesce(src.lote_codigo, '')), ''),
        src.fecha_caducidad,
        nullif(trim(coalesce(src.serie, '')), ''),
        nullif(trim(coalesce(src.observaciones, '')), '')
    FROM jsonb_to_recordset(p_items) AS src(
        orden_compra_item_id uuid,
        catalog_item_id uuid,
        cantidad_recibida numeric,
        costo_unitario_real numeric,
        lote_codigo text,
        fecha_caducidad date,
        serie text,
        observaciones text
    );

    RETURN v_recepcion_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_recepcion_compra(uuid, uuid, uuid, text, uuid, text, text, jsonb)
    IS 'Registra una recepcion de compra con sus lineas en una sola transaccion.';

REVOKE EXECUTE ON FUNCTION public.registrar_recepcion_compra(
    uuid,
    uuid,
    uuid,
    text,
    uuid,
    text,
    text,
    jsonb
) FROM PUBLIC, anon, authenticated;

COMMIT;
