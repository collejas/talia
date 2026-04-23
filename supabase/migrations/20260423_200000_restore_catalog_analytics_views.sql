BEGIN;

--------------------------------------------------------------------------------
-- Restituir vistas de analíticas de catálogo sobre el modelo nuevo.
-- Estas vistas habían sido eliminadas al retirar las tablas legacy, pero
-- el backend y el panel siguen consultando los mismos nombres.
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.ventas_por_producto_mes
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', COALESCE(c.actualizado_en, c.creado_en))::date AS mes,
    ci.producto_id AS catalog_item_id,
    COALESCE(p.nombre, ci.descripcion) AS item_nombre,
    c.moneda,
    SUM(COALESCE(ci.subtotal, ci.cantidad * COALESCE(ci.precio_unitario, 0))) AS total_vendido,
    SUM(COALESCE(ci.cantidad, 0)) AS unidades_vendidas,
    COUNT(DISTINCT COALESCE(c.oportunidad_id, c.id)) AS leads_ganados
FROM public.cotizaciones c
JOIN public.cotizacion_items ci
    ON ci.cotizacion_id = c.id
LEFT JOIN public.productos p
    ON p.id = ci.producto_id
WHERE c.estatus = 'aceptada'
GROUP BY
    mes,
    ci.producto_id,
    item_nombre,
    ci.moneda;

COMMENT ON VIEW public.ventas_por_producto_mes IS
    'Agregados mensuales de ventas por producto/servicio usando cotizaciones aceptadas.';

CREATE OR REPLACE VIEW public.embudo_por_producto
WITH (security_invoker = true) AS
WITH latest_quotes AS (
    SELECT DISTINCT ON (c.oportunidad_id)
        c.id,
        c.oportunidad_id,
        c.estatus,
        c.creado_en,
        c.actualizado_en
    FROM public.cotizaciones c
    WHERE c.oportunidad_id IS NOT NULL
    ORDER BY c.oportunidad_id, c.actualizado_en DESC, c.creado_en DESC, c.id DESC
),
opportunity_board AS (
    SELECT
        o.id,
        o.organizacion_id,
        o.etapa_id,
        o.estado,
        o.cerrado_en,
        o.metadata,
        ep.metadata AS etapa_metadata,
        CASE
            WHEN o.metadata ? 'tablero_id' AND (o.metadata->>'tablero_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (o.metadata->>'tablero_id')::uuid
            WHEN ep.metadata ? 'tablero_id' AND (ep.metadata->>'tablero_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (ep.metadata->>'tablero_id')::uuid
            ELSE NULL
        END AS tablero_id
    FROM public.oportunidades o
    JOIN public.etapas_pipeline ep
        ON ep.id = o.etapa_id
)
SELECT
    ob.tablero_id,
    ob.etapa_id,
    ci.producto_id AS catalog_item_id,
    COALESCE(p.nombre, ci.descripcion) AS item_nombre,
    c.moneda,
    SUM(COALESCE(ci.subtotal, ci.cantidad * COALESCE(ci.precio_unitario, 0))) AS monto_estimado,
    COUNT(DISTINCT ob.id) AS leads_con_cotizacion
FROM latest_quotes lq
JOIN opportunity_board ob
    ON ob.id = lq.oportunidad_id
JOIN public.cotizaciones c
    ON c.id = lq.id
JOIN public.cotizacion_items ci
    ON ci.cotizacion_id = lq.id
LEFT JOIN public.productos p
    ON p.id = ci.producto_id
WHERE ob.cerrado_en IS NULL
GROUP BY
    ob.tablero_id,
    ob.etapa_id,
    ci.producto_id,
    item_nombre,
    c.moneda;

COMMENT ON VIEW public.embudo_por_producto IS
    'Vista del pipeline agrupado por producto y etapa usando la última cotización disponible.';

GRANT SELECT ON public.ventas_por_producto_mes TO authenticated, service_role;
GRANT SELECT ON public.embudo_por_producto TO authenticated, service_role;

COMMIT;
