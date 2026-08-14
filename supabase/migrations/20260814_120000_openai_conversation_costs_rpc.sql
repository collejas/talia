-- Agrega costos por conversación aplicando los filtros sobre el ledger antes
-- de agrupar. La vista equivalente tenía que agrupar todo el ledger y solo
-- después podía aplicar los filtros de PostgREST.

CREATE INDEX IF NOT EXISTS openai_request_usage_created_conversation_idx
    ON public.openai_request_usage (created_at, organizacion_id, conversation_id)
    WHERE conversation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.openai_costs_by_conversation_filtered(
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL,
    p_channel text DEFAULT NULL,
    p_feature text DEFAULT NULL,
    p_project_key text DEFAULT NULL,
    p_organizacion_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(
    conversation_id uuid,
    first_request_at timestamptz,
    last_request_at timestamptz,
    organizacion_id uuid,
    organizacion_nombre text,
    source_tenant_mode text,
    channel text,
    feature text,
    openai_project_key text,
    openai_project_display_name text,
    conversation_display_name text,
    requests_count bigint,
    models_count bigint,
    models_used text[],
    input_tokens bigint,
    cached_input_tokens bigint,
    output_tokens bigint,
    reasoning_tokens bigint,
    total_tokens bigint,
    estimated_total_cost_usd numeric,
    avg_latency_ms numeric,
    fallback_count bigint,
    quality_retry_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
WITH scope AS (
    SELECT
        auth.role() = 'service_role' AS is_service_role,
        CASE
            WHEN auth.role() = 'service_role' THEN p_organizacion_id
            WHEN auth.uid() IS NOT NULL THEN public.usuario_organizacion_id(auth.uid())
            ELSE NULL::uuid
        END AS organizacion_id
), filtered_usage AS (
    SELECT
        u.conversation_id,
        u.created_at,
        u.organizacion_id,
        u.organizacion_nombre,
        u.source_tenant_mode,
        u.channel,
        u.feature,
        u.openai_project_key,
        u.openai_project_display_name,
        u.openai_model_family,
        u.input_tokens,
        u.cached_input_tokens,
        u.output_tokens,
        u.reasoning_tokens,
        u.total_tokens,
        u.estimated_total_cost_usd,
        u.latency_ms,
        u.fallback_used,
        u.quality_retry_used
    FROM public.v_openai_usage_enriched AS u
    CROSS JOIN scope AS s
    WHERE u.conversation_id IS NOT NULL
      AND (s.is_service_role OR s.organizacion_id IS NOT NULL)
      AND (p_date_from IS NULL OR u.created_at >= (p_date_from::timestamp AT TIME ZONE 'UTC'))
      AND (p_date_to IS NULL OR u.created_at < ((p_date_to + 1)::timestamp AT TIME ZONE 'UTC'))
      AND (p_channel IS NULL OR u.channel = p_channel)
      AND (p_feature IS NULL OR u.feature = p_feature)
      AND (p_project_key IS NULL OR u.openai_project_key = p_project_key)
      AND (s.is_service_role AND (s.organizacion_id IS NULL OR u.organizacion_id = s.organizacion_id)
           OR NOT s.is_service_role AND u.organizacion_id = s.organizacion_id)
), aggregated AS (
    SELECT
        u.conversation_id,
        MIN(u.created_at) AS first_request_at,
        MAX(u.created_at) AS last_request_at,
        u.organizacion_id,
        MAX(u.organizacion_nombre) AS organizacion_nombre,
        MAX(u.source_tenant_mode) AS source_tenant_mode,
        MAX(u.channel) AS channel,
        MAX(u.feature) AS feature,
        MAX(u.openai_project_key) AS openai_project_key,
        MAX(u.openai_project_display_name) AS openai_project_display_name,
        COUNT(*) AS requests_count,
        COUNT(DISTINCT u.openai_model_family) AS models_count,
        ARRAY_AGG(DISTINCT u.openai_model_family ORDER BY u.openai_model_family)
            FILTER (WHERE u.openai_model_family IS NOT NULL) AS models_used,
        SUM(u.input_tokens)::bigint AS input_tokens,
        SUM(u.cached_input_tokens)::bigint AS cached_input_tokens,
        SUM(u.output_tokens)::bigint AS output_tokens,
        SUM(u.reasoning_tokens)::bigint AS reasoning_tokens,
        SUM(u.total_tokens)::bigint AS total_tokens,
        SUM(u.estimated_total_cost_usd) AS estimated_total_cost_usd,
        AVG(u.latency_ms)::numeric(12, 2) AS avg_latency_ms,
        COUNT(*) FILTER (WHERE u.fallback_used) AS fallback_count,
        COUNT(*) FILTER (WHERE u.quality_retry_used) AS quality_retry_count
    FROM filtered_usage AS u
    GROUP BY u.conversation_id, u.organizacion_id
)
SELECT
    a.conversation_id,
    a.first_request_at,
    a.last_request_at,
    a.organizacion_id,
    a.organizacion_nombre,
    a.source_tenant_mode,
    a.channel,
    a.feature,
    a.openai_project_key,
    a.openai_project_display_name,
    COALESCE(
        NULLIF(TRIM(BOTH FROM p.nombre_completo), ''),
        NULLIF(TRIM(BOTH FROM p.correo_principal), ''),
        NULLIF(TRIM(BOTH FROM p.telefono_principal_e164), ''),
        CONCAT(INITCAP(COALESCE(a.channel, 'Conversación')), ' · ', LEFT(a.conversation_id::text, 8))
    ) AS conversation_display_name,
    a.requests_count,
    a.models_count,
    a.models_used,
    a.input_tokens,
    a.cached_input_tokens,
    a.output_tokens,
    a.reasoning_tokens,
    a.total_tokens,
    a.estimated_total_cost_usd,
    a.avg_latency_ms,
    a.fallback_count,
    a.quality_retry_count
FROM aggregated AS a
LEFT JOIN public.conversaciones AS c
    ON c.id = a.conversation_id
LEFT JOIN public.personas AS p
    ON p.id = COALESCE(c.persona_id, c.contacto_id)
ORDER BY a.estimated_total_cost_usd DESC NULLS LAST, a.last_request_at DESC
LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;

COMMENT ON FUNCTION public.openai_costs_by_conversation_filtered(date, date, text, text, text, uuid, integer)
IS 'Costos por conversación con filtros aplicados antes de agregar el ledger OpenAI.';

GRANT EXECUTE ON FUNCTION public.openai_costs_by_conversation_filtered(date, date, text, text, text, uuid, integer)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.openai_costs_by_conversation_filtered(date, date, text, text, text, uuid, integer)
FROM PUBLIC, anon;
