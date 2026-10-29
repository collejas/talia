BEGIN;

-- Una cotización aceptada no equivale por sí sola a una venta ganada.
-- El reporte debe excluir oportunidades perdidas o aún abiertas.
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
JOIN public.oportunidades o
    ON o.id = c.oportunidad_id
   AND o.organizacion_id = c.organizacion_id
JOIN public.cotizacion_items ci ON ci.cotizacion_id = c.id
LEFT JOIN public.productos p ON p.id = ci.producto_id
LEFT JOIN public.propiedad_unidades pu ON pu.id = ci.unidad_id
LEFT JOIN public.propiedad_manzanas pm ON pm.id = pu.manzana_id
LEFT JOIN public.propiedad_capas cap ON cap.id = pm.macrolote_id
LEFT JOIN public.propiedad_desarrollos d ON d.id = pu.desarrollo_id
WHERE c.estatus = 'aceptada'
  AND o.estado = 'ganada'
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
    'Agregados mensuales de ventas inmobiliarias y de productos; solo incluye cotizaciones aceptadas de oportunidades ganadas y conserva la jerarquía inmobiliaria relacionada.';

COMMIT;
