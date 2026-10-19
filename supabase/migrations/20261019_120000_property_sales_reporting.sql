BEGIN;

-- Reporte unificado de ventas con dominio comercial y contexto inmobiliario.
-- Se conserva la función anterior para compatibilidad mientras el backend
-- adopta la firma de 11 argumentos.
CREATE OR REPLACE FUNCTION public.crm_reporte_ventas(
    p_organizacion_id uuid,
    p_desde date,
    p_hasta date,
    p_timezone text,
    p_estatus text,
    p_vendedor_usuario_id uuid,
    p_vendedor_usuario_ids uuid[],
    p_moneda text,
    p_limit integer,
    p_offset integer,
    p_dominio text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
WITH pagos_por_venta AS (
    SELECT
        p.organizacion_id,
        p.venta_id,
        sum(p.monto) FILTER (WHERE p.estatus = 'confirmado') AS cobrado_neto,
        sum(CASE WHEN p.estatus = 'confirmado'
                       AND (p.fecha_confirmacion AT TIME ZONE p_timezone)::date BETWEEN p_desde AND p_hasta
                 THEN p.monto ELSE 0 END) AS movimiento_periodo
    FROM public.pagos AS p
    JOIN public.ventas AS v
      ON v.organizacion_id = p.organizacion_id AND v.id = p.venta_id
    WHERE p.organizacion_id = p_organizacion_id
      AND (p_vendedor_usuario_ids IS NULL OR v.vendedor_usuario_id = ANY(p_vendedor_usuario_ids))
      AND (p_vendedor_usuario_id IS NULL OR v.vendedor_usuario_id = p_vendedor_usuario_id)
      AND (p_moneda IS NULL OR upper(v.moneda) = upper(p_moneda))
      AND (p_estatus IS NULL OR v.estatus = p_estatus)
    GROUP BY p.organizacion_id, p.venta_id
),
venta_partidas AS (
    SELECT
        vi.organizacion_id,
        vi.venta_id,
        (array_agg(COALESCE(pvi.propiedad_id, ci.propiedad_id) ORDER BY vi.orden)
            FILTER (WHERE COALESCE(pvi.propiedad_id, ci.propiedad_id) IS NOT NULL))[1] AS propiedad_id,
        (array_agg(COALESCE(pvi.unidad_id, ci.unidad_id) ORDER BY vi.orden)
            FILTER (WHERE COALESCE(pvi.unidad_id, ci.unidad_id) IS NOT NULL))[1] AS unidad_id,
        bool_or(COALESCE(pvi.propiedad_id, ci.propiedad_id) IS NOT NULL
             OR COALESCE(pvi.unidad_id, ci.unidad_id) IS NOT NULL) AS tiene_propiedad,
        bool_or(COALESCE(pvi.propiedad_id, ci.propiedad_id) IS NULL
            AND COALESCE(pvi.unidad_id, ci.unidad_id) IS NULL) AS tiene_producto
    FROM public.venta_items AS vi
    LEFT JOIN public.pedido_venta_items AS pvi
      ON pvi.organizacion_id = vi.organizacion_id
     AND pvi.id = vi.pedido_venta_item_id
    LEFT JOIN public.catalog_items AS ci
      ON ci.organizacion_id = vi.organizacion_id
     AND ci.id = vi.catalog_item_id
    WHERE vi.organizacion_id = p_organizacion_id
    GROUP BY vi.organizacion_id, vi.venta_id
),
venta_contexto AS (
    SELECT
        v.id AS venta_id,
        CASE
            WHEN COALESCE(vp.tiene_propiedad, false) AND COALESCE(vp.tiene_producto, false) THEN 'mixto'
            WHEN COALESCE(vp.tiene_propiedad, false) THEN 'propiedades'
            ELSE 'productos_servicios'
        END AS dominio,
        vp.propiedad_id,
        vp.unidad_id,
        d.nombre AS desarrollo_nombre,
        COALESCE(u.nombre, u.unidad) AS unidad_nombre,
        u.status::text AS propiedad_status
    FROM public.ventas AS v
    LEFT JOIN venta_partidas AS vp
      ON vp.organizacion_id = v.organizacion_id AND vp.venta_id = v.id
    LEFT JOIN public.propiedad_unidades AS u
      ON u.id = vp.unidad_id
    LEFT JOIN public.propiedad_desarrollos AS d
      ON d.organizacion_id = p_organizacion_id
     AND d.id = COALESCE(u.desarrollo_id, vp.propiedad_id)
    WHERE v.organizacion_id = p_organizacion_id
),
ventas_scope AS (
    SELECT v.*,
           COALESCE(NULLIF(trim(c.razon_social), ''), NULLIF(trim(persona.nombre_completo), ''), 'Cliente sin nombre') AS cliente_nombre,
           u.nombre_completo AS vendedor_nombre,
           o.codigo_oportunidad,
           o.titulo AS oportunidad_titulo,
           COALESCE(pv.cobrado_neto, 0)::numeric(14,2) AS cobrado_neto,
           COALESCE(pv.movimiento_periodo, 0)::numeric(14,2) AS movimiento_periodo,
           COALESCE(vc.dominio, 'productos_servicios') AS dominio,
           vc.propiedad_id,
           vc.unidad_id,
           vc.desarrollo_nombre,
           vc.unidad_nombre,
           vc.propiedad_status
    FROM public.ventas AS v
    LEFT JOIN public.clientes AS c
      ON c.organizacion_id = v.organizacion_id AND c.id = v.cliente_id
    LEFT JOIN public.personas AS persona
      ON persona.organizacion_id = c.organizacion_id AND persona.id = c.persona_id
    LEFT JOIN public.usuarios AS u
      ON u.organizacion_id = v.organizacion_id AND u.id = v.vendedor_usuario_id
    LEFT JOIN public.oportunidades AS o
      ON o.organizacion_id = v.organizacion_id AND o.id = v.oportunidad_id
    LEFT JOIN pagos_por_venta AS pv
      ON pv.organizacion_id = v.organizacion_id AND pv.venta_id = v.id
    LEFT JOIN venta_contexto AS vc
      ON vc.venta_id = v.id
    WHERE v.organizacion_id = p_organizacion_id
      AND (p_vendedor_usuario_ids IS NULL OR v.vendedor_usuario_id = ANY(p_vendedor_usuario_ids))
      AND (p_vendedor_usuario_id IS NULL OR v.vendedor_usuario_id = p_vendedor_usuario_id)
      AND (p_moneda IS NULL OR upper(v.moneda) = upper(p_moneda))
      AND (p_estatus IS NULL OR v.estatus = p_estatus)
      AND (p_dominio IS NULL OR p_dominio = 'todos' OR COALESCE(vc.dominio, 'productos_servicios') = p_dominio)
),
monedas_scope AS (
    SELECT DISTINCT btrim(upper(moneda)) AS moneda
    FROM ventas_scope
),
ventas_periodo AS (
    SELECT * FROM ventas_scope
    WHERE fecha_venta >= (p_desde::timestamp AT TIME ZONE p_timezone)
      AND fecha_venta < ((p_hasta + 1)::timestamp AT TIME ZONE p_timezone)
),
resumen AS (
    SELECT
        count(*) FILTER (WHERE estatus NOT IN ('cancelada', 'reembolsada')) AS numero_ventas,
        COALESCE(sum(total) FILTER (WHERE estatus NOT IN ('cancelada', 'reembolsada')), 0) AS total_vendido,
        (SELECT COALESCE(sum(movimiento_periodo), 0) FROM ventas_scope) AS total_cobrado_periodo,
        COALESCE(sum(GREATEST(total - cobrado_neto, 0)) FILTER (WHERE estatus NOT IN ('cancelada', 'reembolsada')), 0) AS saldo_pendiente,
        count(*) FILTER (WHERE estatus = 'pago_parcial') AS numero_pagos_parciales,
        count(*) FILTER (WHERE estatus = 'pendiente_pago') AS numero_pendientes_pago,
        count(*) FILTER (WHERE estatus = 'pagada') AS numero_pagadas,
        count(*) FILTER (WHERE dominio = 'propiedades' AND estatus NOT IN ('cancelada', 'reembolsada')) AS numero_ventas_propiedades,
        COALESCE(sum(total) FILTER (WHERE dominio = 'propiedades' AND estatus NOT IN ('cancelada', 'reembolsada')), 0) AS total_vendido_propiedades,
        count(*) FILTER (WHERE dominio = 'productos_servicios' AND estatus NOT IN ('cancelada', 'reembolsada')) AS numero_ventas_productos,
        COALESCE(sum(total) FILTER (WHERE dominio = 'productos_servicios' AND estatus NOT IN ('cancelada', 'reembolsada')), 0) AS total_vendido_productos
    FROM ventas_periodo
),
meses AS (
    SELECT date_trunc('month', d)::date AS mes
    FROM generate_series(
        date_trunc('month', p_desde::timestamp),
        date_trunc('month', p_hasta::timestamp),
        interval '1 month'
    ) AS d
),
ventas_mensuales AS (
    SELECT date_trunc('month', fecha_venta AT TIME ZONE p_timezone)::date AS mes,
           sum(total) FILTER (WHERE estatus NOT IN ('cancelada', 'reembolsada')) AS vendido
    FROM ventas_periodo
    GROUP BY 1
),
pagos_mensuales AS (
    SELECT date_trunc('month', p.fecha_confirmacion AT TIME ZONE p_timezone)::date AS mes,
           sum(p.monto) AS cobrado
    FROM public.pagos AS p
    JOIN ventas_scope AS v ON v.organizacion_id = p.organizacion_id AND v.id = p.venta_id
    WHERE p.organizacion_id = p_organizacion_id
      AND p.estatus = 'confirmado'
      AND (p.fecha_confirmacion AT TIME ZONE p_timezone)::date BETWEEN p_desde AND p_hasta
    GROUP BY 1
),
pagina AS (
    SELECT id, cliente_id, cliente_nombre, oportunidad_id, codigo_oportunidad,
           oportunidad_titulo, vendedor_usuario_id,
           COALESCE(NULLIF(trim(vendedor_nombre), ''), 'Sin vendedor') AS vendedor_nombre,
           fecha_venta, total, cobrado_neto AS total_cobrado,
           GREATEST(total - cobrado_neto, 0) AS saldo_pendiente,
           estatus, btrim(moneda) AS moneda, dominio, propiedad_id, unidad_id,
           desarrollo_nombre, unidad_nombre, propiedad_status
    FROM ventas_periodo
    ORDER BY fecha_venta DESC, id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
)
SELECT jsonb_build_object(
    'resumen', (SELECT to_jsonb(resumen) FROM resumen),
    'serie', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'mes', to_char(meses.mes, 'YYYY-MM'),
            'total_vendido', COALESCE(ventas_mensuales.vendido, 0),
            'total_cobrado', COALESCE(pagos_mensuales.cobrado, 0)
        ) ORDER BY meses.mes)
        FROM meses
        LEFT JOIN ventas_mensuales USING (mes)
        LEFT JOIN pagos_mensuales USING (mes)
    ), '[]'::jsonb),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(pagina) ORDER BY fecha_venta DESC, id DESC) FROM pagina), '[]'::jsonb),
    'total', (SELECT count(*) FROM ventas_periodo),
    'monedas', COALESCE((SELECT jsonb_agg(moneda ORDER BY moneda) FROM monedas_scope), '[]'::jsonb)
);
$function$;

REVOKE ALL ON FUNCTION public.crm_reporte_ventas(uuid, date, date, text, text, uuid, uuid[], text, integer, integer, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_reporte_ventas(uuid, date, date, text, text, uuid, uuid[], text, integer, integer, text)
    TO service_role;

COMMIT;
