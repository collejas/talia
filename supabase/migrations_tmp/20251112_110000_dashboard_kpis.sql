BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_kpis(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH conv_base AS (
        SELECT
            COALESCE(NULLIF(lower(estado), ''), 'desconocido') AS estado,
            lower(NULLIF(canal, '')) AS canal
        FROM public.conversaciones
        WHERE (p_from IS NULL OR iniciada_en >= p_from)
          AND (p_to IS NULL OR iniciada_en <= p_to)
    ),
    conv_totals AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE canal = 'webchat') AS webchat_total,
            COUNT(DISTINCT canal) FILTER (WHERE canal IS NOT NULL) AS canales_activos
        FROM conv_base
    ),
    conv_by_state AS (
        SELECT estado, COUNT(*) AS total
        FROM conv_base
        GROUP BY estado
    ),
    contactos_base AS (
        SELECT
            COALESCE(NULLIF(lower(estado), ''), 'desconocido') AS estado,
            COALESCE(NULLIF(lower(captura_estado), ''), 'incompleto') AS captura_estado,
            COALESCE(NULLIF(lower(origen), ''), 'desconocido') AS origen
        FROM public.contactos
        WHERE (p_from IS NULL OR creado_en >= p_from)
          AND (p_to IS NULL OR creado_en <= p_to)
    ),
    contactos_totals AS (
        SELECT COUNT(*) AS total FROM contactos_base WHERE captura_estado = 'completo'
    ),
    contactos_webchat_completos AS (
        SELECT COUNT(*) AS total
        FROM contactos_base
        WHERE captura_estado = 'completo'
          AND origen = 'webchat'
    ),
    contactos_by_state AS (
        SELECT estado, COUNT(*) AS total
        FROM contactos_base
        GROUP BY estado
    ),
    captura_by_state AS (
        SELECT captura_estado, COUNT(*) AS total
        FROM contactos_base
        GROUP BY captura_estado
    ),
    visitantes AS (
        SELECT COALESCE(total, 0) AS total
        FROM public.embudo_visitantes_contador(p_from, p_to)
    ),
    webchat_visitas AS (
        SELECT
            COALESCE((SELECT total FROM visitantes), 0) AS visitas_sin_chat,
            COALESCE((SELECT webchat_total FROM conv_totals), 0) AS conversaciones
    ),
    mensajes_base AS (
        SELECT
            conversacion_id,
            direccion,
            creado_en
        FROM public.mensajes
        WHERE direccion IN ('entrante', 'saliente')
          AND (p_from IS NULL OR creado_en >= p_from)
          AND (p_to IS NULL OR creado_en <= p_to)
    ),
    first_responses AS (
        SELECT
            m_in.conversacion_id,
            m_in.creado_en AS entrante_en,
            MIN(m_out.creado_en) AS respuesta_en
        FROM mensajes_base m_in
        LEFT JOIN mensajes_base m_out
          ON m_in.conversacion_id = m_out.conversacion_id
         AND m_out.direccion = 'saliente'
         AND m_out.creado_en >= m_in.creado_en
        WHERE m_in.direccion = 'entrante'
        GROUP BY m_in.conversacion_id, m_in.creado_en
    ),
    response_metrics AS (
        SELECT EXTRACT(EPOCH FROM (respuesta_en - entrante_en)) AS segundos
        FROM first_responses
        WHERE respuesta_en IS NOT NULL
          AND respuesta_en > entrante_en
    ),
    response_summary AS (
        SELECT
            AVG(segundos) AS promedio_segundos,
            MAX(segundos) AS maximo_segundos
        FROM response_metrics
    )
    SELECT jsonb_build_object(
        'conversaciones', jsonb_build_object(
            'total', COALESCE((SELECT total FROM conv_totals), 0),
            'por_estado', COALESCE((
                SELECT jsonb_object_agg(estado, total ORDER BY estado)
                FROM conv_by_state
            ), '{}'::jsonb),
            'webchat_total', COALESCE((SELECT webchat_total FROM conv_totals), 0),
            'canales_activos', COALESCE((SELECT canales_activos FROM conv_totals), 0)
        ),
        'contactos', jsonb_build_object(
            'total', COALESCE((SELECT total FROM contactos_totals), 0),
            'por_estado', COALESCE((
                SELECT jsonb_object_agg(estado, total ORDER BY estado)
                FROM contactos_by_state
            ), '{}'::jsonb),
            'captura', COALESCE((
                SELECT jsonb_object_agg(captura_estado, total ORDER BY captura_estado)
                FROM captura_by_state
            ), '{}'::jsonb)
        ),
        'visitantes', COALESCE((SELECT total FROM visitantes), 0),
        'tiempos_respuesta', (
            SELECT jsonb_build_object(
                'promedio', promedio_segundos,
                'maximo', maximo_segundos
            )
            FROM response_summary
        ),
        'webchat', (
            SELECT jsonb_build_object(
                'visitas_sin_chat', visitas_sin_chat,
                'conversaciones', conversaciones,
                'visitas_totales', visitas_sin_chat + conversaciones,
                'contactos_completos', COALESCE((
                    SELECT total FROM contactos_webchat_completos
                ), 0)
            )
            FROM webchat_visitas
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_kpis(timestamptz, timestamptz)
    TO postgres, service_role, authenticated;

COMMIT;
