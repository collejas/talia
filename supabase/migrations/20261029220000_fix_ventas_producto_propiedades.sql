BEGIN;

-- Las ventas inmobiliarias deben usar la jerarquía de la unidad ligada a la
-- partida; productos.nombre puede ser un snapshot antiguo o ambiguo.
CREATE OR REPLACE VIEW public.ventas_por_producto_mes
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', COALESCE(c.actualizado_en, c.creado_en))::date AS mes,
    ci.producto_id AS catalog_item_id,
    CASE
        WHEN pu.id IS NOT NULL THEN concat_ws(
            ' · ',
            NULLIF(BTRIM(d.nombre), ''),
            CASE
                WHEN pu.unidad IS NOT NULL THEN 'Lote ' || pu.unidad::text
                ELSE NULL
            END,
            NULLIF(BTRIM(pm.nombre), ''),
            NULLIF(BTRIM(cap.nombre), '')
        )
        ELSE COALESCE(p.nombre, ci.descripcion)
    END AS item_nombre,
    c.moneda,
    SUM(COALESCE(ci.subtotal, ci.cantidad * COALESCE(ci.precio_unitario, 0))) AS total_vendido,
    SUM(COALESCE(ci.cantidad, 0)) AS unidades_vendidas,
    COUNT(DISTINCT COALESCE(c.oportunidad_id, c.id)) AS leads_ganados
FROM public.cotizaciones c
JOIN public.cotizacion_items ci ON ci.cotizacion_id = c.id
LEFT JOIN public.productos p ON p.id = ci.producto_id
LEFT JOIN public.propiedad_unidades pu ON pu.id = ci.unidad_id
LEFT JOIN public.propiedad_manzanas pm ON pm.id = pu.manzana_id
LEFT JOIN public.propiedad_capas cap ON cap.id = pm.macrolote_id
LEFT JOIN public.propiedad_desarrollos d ON d.id = pu.desarrollo_id
WHERE c.estatus = 'aceptada'
GROUP BY
    (date_trunc('month', COALESCE(c.actualizado_en, c.creado_en))::date),
    ci.producto_id,
    CASE
        WHEN pu.id IS NOT NULL THEN concat_ws(
            ' · ',
            NULLIF(BTRIM(d.nombre), ''),
            CASE
                WHEN pu.unidad IS NOT NULL THEN 'Lote ' || pu.unidad::text
                ELSE NULL
            END,
            NULLIF(BTRIM(pm.nombre), ''),
            NULLIF(BTRIM(cap.nombre), '')
        )
        ELSE COALESCE(p.nombre, ci.descripcion)
    END,
    c.moneda;

COMMENT ON VIEW public.ventas_por_producto_mes IS
    'Agregados mensuales de ventas por producto/servicio; las unidades inmobiliarias usan su desarrollo, lote, manzana y macrolote relacionados.';

COMMIT;
