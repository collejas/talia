CREATE OR REPLACE FUNCTION public.prospeccion_envio_sesiones_utm(
    p_envio_ids uuid[]
)
RETURNS TABLE (
    envio_id uuid,
    sesiones_utm bigint
)
LANGUAGE sql
STABLE
AS $$
WITH contexto_org AS (
    SELECT
      COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
      ) AS organizacion_id
),
targets AS (
    SELECT DISTINCT unnest(p_envio_ids) AS envio_id
),
sesion_signals AS (
    SELECT
        w.session_id,
        lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)utm_source=([^&#]+)'), '')) AS utm_source,
        lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)utm_medium=([^&#]+)'), '')) AS utm_medium,
        COALESCE(substring(w.landing_url FROM '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'), '') AS envio_id,
        COALESCE(w.landing_url, '') AS landing_url
    FROM public.webchat_visitantes w
    CROSS JOIN contexto_org co
    WHERE w.organizacion_id = co.organizacion_id
      AND COALESCE(w.landing_url, '') <> ''
),
sesion_by_envio AS (
    SELECT
        NULLIF(envio_id, '')::uuid AS envio_id,
        COUNT(DISTINCT session_id)::bigint AS sesiones
    FROM sesion_signals
    WHERE utm_source = 'prospeccion'
      AND utm_medium = 'email'
      AND NULLIF(envio_id, '') IS NOT NULL
    GROUP BY NULLIF(envio_id, '')::uuid
)
SELECT
    t.envio_id,
    COALESCE(s.sesiones, 0)::bigint AS sesiones_utm
FROM targets t
LEFT JOIN sesion_by_envio s ON s.envio_id = t.envio_id;
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_envio_sesiones_utm(uuid[]) TO authenticated;
