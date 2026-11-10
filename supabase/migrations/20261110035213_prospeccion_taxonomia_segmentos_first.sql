-- PostgREST limita cada respuesta a 1,000 filas. La función anterior
-- devolvía primero todas las actividades; en tenants con más de 1,000
-- actividades los segmentos quedaban fuera de la primera página y el panel
-- mostraba el filtro de segmentos vacío.
CREATE OR REPLACE FUNCTION public.prospeccion_taxonomia_resumen(
    p_fuente text DEFAULT NULL::text,
    p_date_from timestamptz DEFAULT NULL::timestamptz,
    p_date_to timestamptz DEFAULT NULL::timestamptz
)
RETURNS TABLE (
    activity text,
    segmento text,
    tipo_negocio_display text,
    tipo_negocio text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH contexto_org AS (
    SELECT COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    ) AS organizacion_id
), base AS (
    SELECT
        NULLIF(trim(p.actividad), '') AS activity,
        NULLIF(trim(p.segmento), '') AS segmento,
        NULLIF(trim(p.google_primary_type_display_name), '') AS tipo_negocio_display,
        NULLIF(trim(p.google_primary_type), '') AS tipo_negocio
    FROM public.prospeccion_prospectos p
    CROSS JOIN contexto_org co
    WHERE p.organizacion_id = co.organizacion_id
      AND (p_fuente IS NULL OR p_fuente = '' OR p.fuente::text = p_fuente)
      AND (p_date_from IS NULL OR p.creado_en >= p_date_from)
      AND (p_date_to IS NULL OR p.creado_en < p_date_to)
), taxonomia AS (
    -- Segmentos primero: deben estar dentro de la primera página de PostgREST.
    SELECT NULL::text AS activity, segmento, NULL::text AS tipo_negocio_display,
           NULL::text AS tipo_negocio, 0 AS prioridad
    FROM base
    WHERE segmento IS NOT NULL
    GROUP BY segmento
    UNION ALL
    SELECT activity, NULL::text, NULL::text, NULL::text, 1
    FROM base
    WHERE activity IS NOT NULL
    GROUP BY activity
    UNION ALL
    SELECT NULL::text, NULL::text, tipo_negocio_display, NULL::text, 2
    FROM base
    WHERE tipo_negocio_display IS NOT NULL
    GROUP BY tipo_negocio_display
    UNION ALL
    SELECT NULL::text, NULL::text, NULL::text, tipo_negocio, 3
    FROM base
    WHERE tipo_negocio IS NOT NULL
    GROUP BY tipo_negocio
)
SELECT activity, segmento, tipo_negocio_display, tipo_negocio
FROM taxonomia
ORDER BY prioridad, COALESCE(segmento, activity, tipo_negocio_display, tipo_negocio);
$function$;

REVOKE ALL ON FUNCTION public.prospeccion_taxonomia_resumen(text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prospeccion_taxonomia_resumen(text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_taxonomia_resumen(text, timestamptz, timestamptz) TO service_role;
