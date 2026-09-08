BEGIN;

CREATE OR REPLACE FUNCTION public.crm_asignaciones_vendedores_tiempos_resumen(
    p_organizacion_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
WITH base AS (
    SELECT
        a.vendedor_usuario_id,
        COALESCE(NULLIF(BTRIM(u.nombre_completo), ''), NULLIF(BTRIM(u.correo), ''), a.vendedor_usuario_id::text) AS vendedor,
        a.aceptado_en,
        CASE
            WHEN a.aceptado_en IS NOT NULL AND a.aceptado_en >= a.creado_en
            THEN EXTRACT(EPOCH FROM (a.aceptado_en - a.creado_en))::numeric
        END AS segundos
    FROM public.asignaciones_vendedores AS a
    LEFT JOIN public.usuarios AS u ON u.id = a.vendedor_usuario_id
    WHERE a.organizacion_id = p_organizacion_id
      AND a.canal = 'whatsapp'
      AND a.trigger_event LIKE 'notify_%'
), grouped AS (
    SELECT
        vendedor_usuario_id,
        vendedor,
        COUNT(*)::integer AS totales,
        COUNT(*) FILTER (WHERE aceptado_en IS NOT NULL AND segundos IS NOT NULL)::integer AS aceptadas,
        COUNT(*) FILTER (WHERE aceptado_en IS NULL)::integer AS pendientes,
        AVG(segundos) FILTER (WHERE segundos IS NOT NULL) AS promedio_segundos,
        MIN(segundos) FILTER (WHERE segundos IS NOT NULL) AS minimo_segundos,
        MAX(segundos) FILTER (WHERE segundos IS NOT NULL) AS maximo_segundos,
        COUNT(*) FILTER (WHERE segundos < 60)::integer AS rapidos,
        COUNT(*) FILTER (WHERE segundos >= 60 AND segundos <= 300)::integer AS medios,
        COUNT(*) FILTER (WHERE segundos > 300)::integer AS lentos
    FROM base
    GROUP BY vendedor_usuario_id, vendedor
), vendors AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'vendedor_usuario_id', vendedor_usuario_id,
        'vendedor', vendedor,
        'aceptadas', aceptadas,
        'totales', totales,
        'pendientes', pendientes,
        'promedio_segundos', ROUND(promedio_segundos, 1),
        'minimo_segundos', ROUND(minimo_segundos, 1),
        'maximo_segundos', ROUND(maximo_segundos, 1),
        'porcentaje_aceptacion', COALESCE(ROUND(100.0 * aceptadas / NULLIF(totales, 0), 1), 0),
        'porcentaje_rapido', COALESCE(ROUND(100.0 * rapidos / NULLIF(aceptadas, 0), 1), 0),
        'porcentaje_medio', COALESCE(ROUND(100.0 * medios / NULLIF(aceptadas, 0), 1), 0),
        'porcentaje_lento', COALESCE(ROUND(100.0 * lentos / NULLIF(aceptadas, 0), 1), 0)
    ) ORDER BY vendedor), '[]'::jsonb) AS items
    FROM grouped
), pending AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('vendedor', vendedor, 'pendientes', pendientes) ORDER BY pendientes DESC, vendedor), '[]'::jsonb) AS items
    FROM (SELECT vendedor, pendientes FROM grouped WHERE pendientes > 0 ORDER BY pendientes DESC, vendedor LIMIT 8) pending_rows
), fastest AS (
    SELECT jsonb_build_object('vendedor', vendedor, 'promedio_segundos', ROUND(promedio_segundos, 1), 'aceptadas', aceptadas) AS item
    FROM grouped
    WHERE aceptadas > 0
    ORDER BY promedio_segundos ASC, vendedor
    LIMIT 1
), slowest AS (
    SELECT jsonb_build_object('vendedor', vendedor, 'promedio_segundos', ROUND(promedio_segundos, 1), 'aceptadas', aceptadas) AS item
    FROM grouped
    WHERE aceptadas > 0
    ORDER BY promedio_segundos DESC, vendedor
    LIMIT 1
), totals AS (
    SELECT COUNT(*)::integer AS notificaciones,
           COUNT(*) FILTER (WHERE aceptado_en IS NOT NULL AND segundos IS NOT NULL)::integer AS aceptadas,
           COUNT(*) FILTER (WHERE aceptado_en IS NULL)::integer AS pendientes
    FROM base
)
SELECT jsonb_build_object(
    'ok', true,
    'notificaciones', totals.notificaciones,
    'aceptadas', totals.aceptadas,
    'pendientes', totals.pendientes,
    'porcentaje_aceptacion', COALESCE(ROUND(100.0 * totals.aceptadas / NULLIF(totals.notificaciones, 0), 1), 0),
    'vendedor_mas_rapido', (SELECT item FROM fastest),
    'vendedor_mas_lento', (SELECT item FROM slowest),
    'pendientes_por_vendedor', (SELECT items FROM pending),
    'vendedores', (SELECT items FROM vendors)
)
FROM totals;
$function$;

REVOKE ALL ON FUNCTION public.crm_asignaciones_vendedores_tiempos_resumen(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_asignaciones_vendedores_tiempos_resumen(uuid) TO service_role;

COMMIT;
