BEGIN;

-- Exponer la fecha de referencia para que el dashboard pueda aplicar el
-- mismo periodo global con precisión diaria, sin perder los agregados por mes.
CREATE OR REPLACE VIEW public.ventas_por_producto_mes
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', COALESCE(o.cerrado_en, c.actualizado_en, c.creado_en))::date AS mes,
    ci.producto_id AS catalog_item_id,
    CASE
        WHEN pu.id IS NOT NULL THEN concat_ws(
            ' · ', NULLIF(BTRIM(d.nombre), ''),
            CASE WHEN pu.unidad IS NOT NULL THEN 'Lote ' || pu.unidad::text ELSE NULL END,
            NULLIF(BTRIM(pm.nombre), ''), NULLIF(BTRIM(cap.nombre), '')
        )
        ELSE COALESCE(p.nombre, ci.descripcion)
    END AS item_nombre,
    c.moneda,
    SUM(COALESCE(ci.subtotal, ci.cantidad * COALESCE(ci.precio_unitario, 0))) AS total_vendido,
    SUM(COALESCE(ci.cantidad, 0)) AS unidades_vendidas,
    COUNT(DISTINCT COALESCE(c.oportunidad_id, c.id)) AS leads_ganados,
    COALESCE(o.cerrado_en, c.actualizado_en, c.creado_en)::date AS fecha_referencia
FROM public.cotizaciones c
JOIN public.oportunidades o ON o.id = c.oportunidad_id AND o.organizacion_id = c.organizacion_id
JOIN public.cotizacion_items ci ON ci.cotizacion_id = c.id
LEFT JOIN public.productos p ON p.id = ci.producto_id
LEFT JOIN public.propiedad_unidades pu ON pu.id = ci.unidad_id
LEFT JOIN public.propiedad_manzanas pm ON pm.id = pu.manzana_id
LEFT JOIN public.propiedad_capas cap ON cap.id = pm.macrolote_id
LEFT JOIN public.propiedad_desarrollos d ON d.id = pu.desarrollo_id
WHERE c.estatus = 'aceptada' AND o.estado = 'ganada'
GROUP BY
    date_trunc('month', COALESCE(o.cerrado_en, c.actualizado_en, c.creado_en))::date,
    COALESCE(o.cerrado_en, c.actualizado_en, c.creado_en)::date,
    ci.producto_id,
    CASE
        WHEN pu.id IS NOT NULL THEN concat_ws(
            ' · ', NULLIF(BTRIM(d.nombre), ''),
            CASE WHEN pu.unidad IS NOT NULL THEN 'Lote ' || pu.unidad::text ELSE NULL END,
            NULLIF(BTRIM(pm.nombre), ''), NULLIF(BTRIM(cap.nombre), '')
        )
        ELSE COALESCE(p.nombre, ci.descripcion)
    END,
    c.moneda;

CREATE OR REPLACE VIEW public.embudo_por_producto
WITH (security_invoker = true) AS
WITH latest_quotes AS (
    SELECT DISTINCT ON (c.oportunidad_id)
        c.id, c.oportunidad_id, c.estatus, c.creado_en, c.actualizado_en
    FROM public.cotizaciones c
    WHERE c.oportunidad_id IS NOT NULL
    ORDER BY c.oportunidad_id, c.actualizado_en DESC, c.creado_en DESC, c.id DESC
),
opportunity_board AS (
    SELECT
        o.id, o.organizacion_id, o.etapa_id, o.estado, o.creado_en, o.cerrado_en,
        o.metadata, ep.metadata AS etapa_metadata,
        CASE
            WHEN o.metadata ? 'tablero_id' AND (o.metadata->>'tablero_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (o.metadata->>'tablero_id')::uuid
            WHEN ep.metadata ? 'tablero_id' AND (ep.metadata->>'tablero_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (ep.metadata->>'tablero_id')::uuid
            ELSE NULL::uuid
        END AS tablero_id
    FROM public.oportunidades o
    JOIN public.etapas_pipeline ep ON ep.id = o.etapa_id
)
SELECT
    ob.tablero_id,
    ob.etapa_id,
    ci.producto_id AS catalog_item_id,
    CASE
        WHEN pu.id IS NOT NULL THEN concat_ws(
            ' · ', NULLIF(BTRIM(d.nombre), ''),
            CASE WHEN pu.unidad IS NOT NULL THEN 'Lote ' || pu.unidad::text ELSE NULL END,
            NULLIF(BTRIM(pm.nombre), ''), NULLIF(BTRIM(cap.nombre), '')
        )
        ELSE COALESCE(p.nombre, ci.descripcion)
    END AS item_nombre,
    c.moneda,
    SUM(COALESCE(ci.subtotal, ci.cantidad * COALESCE(ci.precio_unitario, 0))) AS monto_estimado,
    COUNT(DISTINCT ob.id) AS leads_con_cotizacion,
    ob.creado_en::date AS fecha_referencia
FROM latest_quotes lq
JOIN opportunity_board ob ON ob.id = lq.oportunidad_id
JOIN public.cotizaciones c ON c.id = lq.id
JOIN public.cotizacion_items ci ON ci.cotizacion_id = lq.id
LEFT JOIN public.productos p ON p.id = ci.producto_id
LEFT JOIN public.propiedad_unidades pu ON pu.id = ci.unidad_id
LEFT JOIN public.propiedad_manzanas pm ON pm.id = pu.manzana_id
LEFT JOIN public.propiedad_capas cap ON cap.id = pm.macrolote_id
LEFT JOIN public.propiedad_desarrollos d ON d.id = pu.desarrollo_id
WHERE ob.cerrado_en IS NULL
GROUP BY
    ob.tablero_id, ob.etapa_id, ob.creado_en::date, ci.producto_id,
    CASE
        WHEN pu.id IS NOT NULL THEN concat_ws(
            ' · ', NULLIF(BTRIM(d.nombre), ''),
            CASE WHEN pu.unidad IS NOT NULL THEN 'Lote ' || pu.unidad::text ELSE NULL END,
            NULLIF(BTRIM(pm.nombre), ''), NULLIF(BTRIM(cap.nombre), '')
        )
        ELSE COALESCE(p.nombre, ci.descripcion)
    END,
    c.moneda;

COMMENT ON VIEW public.ventas_por_producto_mes IS
    'Ventas ganadas agregadas por mes con fecha diaria de referencia para filtros del dashboard.';
COMMENT ON VIEW public.embudo_por_producto IS
    'Embudo abierto agregado por producto y etapa con fecha de creación para filtros del dashboard.';

COMMIT;
