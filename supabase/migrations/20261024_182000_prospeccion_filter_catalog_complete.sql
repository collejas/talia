BEGIN;

-- Los catálogos de actividad y segmento deben incluir prospectos sin q_value.
-- La MV diaria se conserva para contar consultas, pero no puede ser la fuente
-- de estos filtros porque excluye filas que no tienen una búsqueda asociada.
CREATE OR REPLACE FUNCTION public.prospeccion_activities_resumen(
    p_query_filters text[] DEFAULT NULL,
    p_fuente text DEFAULT NULL,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(activity text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $function$
WITH contexto_org AS (
    SELECT COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    ) AS organizacion_id
), base AS (
    SELECT
        NULLIF(trim(p.actividad), '') AS activity,
        COALESCE(
            NULLIF(trim(p.metadata->>'busqueda_id'), ''),
            NULLIF(trim(p.metadata->>'busqueda_query'), ''),
            NULLIF(trim(p.metadata->>'query'), ''),
            NULLIF(trim(p.metadata->'busqueda_meta'->>'query'), '')
        ) AS q_value
    FROM public.prospeccion_prospectos p
    CROSS JOIN contexto_org co
    WHERE p.organizacion_id = co.organizacion_id
      AND (p_fuente IS NULL OR p_fuente = '' OR p.fuente::text = p_fuente)
      AND (p_date_from IS NULL OR p.creado_en >= p_date_from)
      AND (p_date_to IS NULL OR p.creado_en < p_date_to)
)
SELECT DISTINCT activity
FROM base
WHERE activity IS NOT NULL
  AND (
      p_query_filters IS NULL
      OR cardinality(p_query_filters) = 0
      OR q_value = ANY(p_query_filters)
  )
ORDER BY activity;
$function$;

CREATE OR REPLACE FUNCTION public.prospeccion_segmentos_resumen(
    p_query_filters text[] DEFAULT NULL,
    p_fuente text DEFAULT NULL,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(segmento text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $function$
WITH contexto_org AS (
    SELECT COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    ) AS organizacion_id
), base AS (
    SELECT
        NULLIF(trim(p.segmento), '') AS segmento,
        COALESCE(
            NULLIF(trim(p.metadata->>'busqueda_id'), ''),
            NULLIF(trim(p.metadata->>'busqueda_query'), ''),
            NULLIF(trim(p.metadata->>'query'), ''),
            NULLIF(trim(p.metadata->'busqueda_meta'->>'query'), '')
        ) AS q_value
    FROM public.prospeccion_prospectos p
    CROSS JOIN contexto_org co
    WHERE p.organizacion_id = co.organizacion_id
      AND (p_fuente IS NULL OR p_fuente = '' OR p.fuente::text = p_fuente)
      AND (p_date_from IS NULL OR p.creado_en >= p_date_from)
      AND (p_date_to IS NULL OR p.creado_en < p_date_to)
)
SELECT DISTINCT segmento
FROM base
WHERE segmento IS NOT NULL
  AND (
      p_query_filters IS NULL
      OR cardinality(p_query_filters) = 0
      OR q_value = ANY(p_query_filters)
  )
ORDER BY segmento;
$function$;

-- Devuelve categorías independientes en lugar de combinaciones de cuatro
-- columnas. Así se reduce el trabajo de DISTINCT y se conservan todos los
-- valores disponibles para cada filtro.
CREATE OR REPLACE FUNCTION public.prospeccion_taxonomia_resumen(
    p_fuente text DEFAULT NULL,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
    activity text,
    segmento text,
    tipo_negocio_display text,
    tipo_negocio text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
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
)
SELECT activity, NULL::text, NULL::text, NULL::text FROM base WHERE activity IS NOT NULL GROUP BY activity
UNION ALL
SELECT NULL::text, segmento, NULL::text, NULL::text FROM base WHERE segmento IS NOT NULL GROUP BY segmento
UNION ALL
SELECT NULL::text, NULL::text, tipo_negocio_display, NULL::text FROM base WHERE tipo_negocio_display IS NOT NULL GROUP BY tipo_negocio_display
UNION ALL
SELECT NULL::text, NULL::text, NULL::text, tipo_negocio FROM base WHERE tipo_negocio IS NOT NULL GROUP BY tipo_negocio;
$function$;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_segmento_idx
    ON public.prospeccion_prospectos (organizacion_id, segmento)
    WHERE segmento IS NOT NULL;

GRANT EXECUTE ON FUNCTION public.prospeccion_activities_resumen(text[], text, timestamptz, timestamptz)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prospeccion_segmentos_resumen(text[], text, timestamptz, timestamptz)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prospeccion_taxonomia_resumen(text, timestamptz, timestamptz)
    TO authenticated, service_role;

COMMIT;
