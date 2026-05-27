BEGIN;

CREATE OR REPLACE FUNCTION public.crm_recalcular_pedimento_importacion(
    p_organizacion_id uuid,
    p_pedimento_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org uuid;
    v_gastos_pedimento numeric(14,4) := 0;
    v_gastos_ordenes numeric(14,4) := 0;
    v_costo_total numeric(14,4) := 0;
BEGIN
    SELECT organizacion_id
    INTO v_org
    FROM public.pedimentos_importacion
    WHERE id = p_pedimento_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedimento no encontrado';
    END IF;

    IF v_org <> p_organizacion_id THEN
        RAISE EXCEPTION 'El pedimento debe pertenecer a la misma organizacion';
    END IF;

    SELECT COALESCE(SUM(g.monto_mxn), 0)
    INTO v_gastos_pedimento
    FROM public.pedimentos_importacion_gastos g
    WHERE g.organizacion_id = p_organizacion_id
      AND g.pedimento_id = p_pedimento_id
      AND g.estado <> 'cancelado';

    SELECT COALESCE(SUM(
        CASE
            WHEN UPPER(COALESCE(pago.moneda_codigo, 'MXN')) = 'MXN' THEN COALESCE(pago.monto, 0)
            ELSE COALESCE(pago.monto, 0) * COALESCE(oc.tipo_cambio_referencia, ped.tipo_cambio, 1)
        END
    ), 0)
    INTO v_gastos_ordenes
    FROM public.pedimentos_importacion_ordenes_compra rel
    JOIN public.pedimentos_importacion ped
        ON ped.id = rel.pedimento_id
       AND ped.organizacion_id = rel.organizacion_id
    JOIN public.ordenes_compra oc
        ON oc.id = rel.orden_compra_id
       AND oc.organizacion_id = rel.organizacion_id
    JOIN public.ordenes_compra_pagos_programados pago
        ON pago.organizacion_id = rel.organizacion_id
       AND pago.orden_compra_id = rel.orden_compra_id
    WHERE rel.organizacion_id = p_organizacion_id
      AND rel.pedimento_id = p_pedimento_id
      AND pago.tipo_pago = 'parcial'
      AND pago.evento_base = 'gasto_adicional'
      AND pago.estado <> 'cancelado';

    v_costo_total := round(COALESCE(v_gastos_pedimento, 0) + COALESCE(v_gastos_ordenes, 0), 4);

    DELETE FROM public.pedimentos_importacion_prorrateos
    WHERE organizacion_id = p_organizacion_id
      AND pedimento_id = p_pedimento_id;

    WITH raw_items AS (
        SELECT
            rel.organizacion_id,
            rel.pedimento_id,
            rel.orden_compra_id,
            item.id AS orden_compra_item_id,
            CASE
                WHEN COALESCE(item.total, 0) > 0 THEN COALESCE(item.total, 0)
                WHEN COALESCE(item.subtotal, 0) > 0 THEN COALESCE(item.subtotal, 0)
                WHEN COALESCE(item.cantidad_solicitada, 0) > 0 THEN COALESCE(item.cantidad_solicitada, 0) * COALESCE(item.costo_unitario, 0)
                WHEN COALESCE(item.cantidad_recibida, 0) > 0 THEN COALESCE(item.cantidad_recibida, 0) * COALESCE(item.costo_unitario, 0)
                ELSE 0
            END::numeric(14,6) AS raw_base_item,
            item.cantidad_solicitada,
            item.cantidad_recibida
        FROM public.pedimentos_importacion_ordenes_compra rel
        JOIN public.ordenes_compra_items item
            ON item.organizacion_id = rel.organizacion_id
           AND item.orden_compra_id = rel.orden_compra_id
        WHERE rel.organizacion_id = p_organizacion_id
          AND rel.pedimento_id = p_pedimento_id
    ),
    totals AS (
        SELECT
            COALESCE(SUM(raw_base_item), 0)::numeric(14,6) AS raw_base_total,
            COUNT(*)::integer AS total_items
        FROM raw_items
    ),
    items AS (
        SELECT
            r.organizacion_id,
            r.pedimento_id,
            r.orden_compra_id,
            r.orden_compra_item_id,
            CASE
                WHEN t.raw_base_total > 0 THEN r.raw_base_item
                WHEN t.total_items > 0 THEN 1::numeric(14,6)
                ELSE 0::numeric(14,6)
            END AS base_item,
            CASE
                WHEN t.raw_base_total > 0 THEN t.raw_base_total
                WHEN t.total_items > 0 THEN t.total_items::numeric(14,6)
                ELSE 0::numeric(14,6)
            END AS base_total,
            r.cantidad_solicitada,
            r.cantidad_recibida
        FROM raw_items r
        CROSS JOIN totals t
    )
    INSERT INTO public.pedimentos_importacion_prorrateos (
        organizacion_id,
        pedimento_id,
        orden_compra_id,
        orden_compra_item_id,
        base_prorrateo,
        base_item,
        base_total,
        porcentaje_prorrateo,
        costo_pedimento_asignado,
        costo_orden_asignado,
        costo_total_asignado,
        costo_unitario_adicional,
        observaciones
    )
    SELECT
        i.organizacion_id,
        i.pedimento_id,
        i.orden_compra_id,
        i.orden_compra_item_id,
        'valor'::text AS base_prorrateo,
        i.base_item,
        i.base_total,
        CASE
            WHEN i.base_total > 0 THEN round((i.base_item / i.base_total)::numeric, 8)
            ELSE 0
        END AS porcentaje_prorrateo,
        round((v_gastos_pedimento * CASE WHEN i.base_total > 0 THEN (i.base_item / i.base_total) ELSE 0 END)::numeric, 4) AS costo_pedimento_asignado,
        round((v_gastos_ordenes * CASE WHEN i.base_total > 0 THEN (i.base_item / i.base_total) ELSE 0 END)::numeric, 4) AS costo_orden_asignado,
        round((v_costo_total * CASE WHEN i.base_total > 0 THEN (i.base_item / i.base_total) ELSE 0 END)::numeric, 4) AS costo_total_asignado,
        round(
            CASE
                WHEN COALESCE(NULLIF(i.cantidad_solicitada, 0), NULLIF(i.cantidad_recibida, 0), 0) > 0
                    THEN (v_costo_total * CASE WHEN i.base_total > 0 THEN (i.base_item / i.base_total) ELSE 0 END)
                         / COALESCE(NULLIF(i.cantidad_solicitada, 0), NULLIF(i.cantidad_recibida, 0))
                ELSE 0
            END::numeric,
            4
        ) AS costo_unitario_adicional,
        NULL::text AS observaciones
    FROM items i;

    UPDATE public.pedimentos_importacion p
    SET gastos_pedimento_total = COALESCE(v_gastos_pedimento, 0),
        gastos_ordenes_total = COALESCE(v_gastos_ordenes, 0),
        costo_total_prorrateable = COALESCE(v_costo_total, 0),
        actualizado_en = now()
    WHERE p.id = p_pedimento_id
      AND p.organizacion_id = p_organizacion_id;

    RETURN p_pedimento_id;
END;
$$;

COMMENT ON FUNCTION public.crm_recalcular_pedimento_importacion(uuid, uuid) IS
    'Recalcula totales del pedimento de importacion y vuelve a poblar el prorrateo por item.';

GRANT EXECUTE ON FUNCTION public.crm_recalcular_pedimento_importacion(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_recalcular_pedimento_importacion(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_recalcular_pedimento_importacion(uuid, uuid) FROM anon;

COMMIT;
