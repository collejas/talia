CREATE OR REPLACE FUNCTION public.dashboard_kpis(
    p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_organizacion uuid DEFAULT NULL::uuid
) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
WITH tenant AS (
    SELECT COALESCE(p_organizacion, public.usuario_organizacion_id(auth.uid())) AS organizacion_id
),
conv_base AS (
    SELECT
        c.id,
        c.contacto_id,
        c.ultimo_mensaje_en,
        c.ultimo_entrante_en,
        c.ultimo_saliente_en,
        COALESCE(NULLIF(lower(c.estado), ''), 'desconocido') AS estado,
        CASE
            WHEN lower(c.canal) IN ('manual', 'correo', 'email') THEN 'email'
            WHEN lower(c.canal) IN ('voz', 'voice', 'llamada', 'call') THEN 'voz'
            ELSE COALESCE(NULLIF(lower(c.canal), ''), 'desconocido')
        END AS canal
    FROM public.conversaciones c
    JOIN tenant t ON c.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR c.iniciada_en >= p_from)
      AND (p_to IS NULL OR c.iniciada_en <= p_to)
),
conv_totals AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE canal = 'webchat') AS webchat_total,
        COUNT(DISTINCT canal) FILTER (WHERE canal IS NOT NULL) AS canales_activos,
        COUNT(*) FILTER (
            WHERE ultimo_entrante_en IS NOT NULL
              AND (ultimo_saliente_en IS NULL OR ultimo_saliente_en < ultimo_entrante_en)
        ) AS sin_respuesta_total,
        COUNT(*) FILTER (
            WHERE COALESCE(estado, '') NOT IN ('cerrada', 'closed', 'resuelta', 'resolved')
        ) AS abiertas_total,
        COUNT(*) FILTER (
            WHERE ultimo_mensaje_en >= now() - interval '24 hours'
              AND COALESCE(estado, '') NOT IN ('cerrada', 'closed', 'resuelta', 'resolved')
        ) AS activas_24h
    FROM conv_base
),
conv_by_state AS (
    SELECT estado, COUNT(*) AS total
    FROM conv_base
    GROUP BY estado
),
conv_by_channel AS (
    SELECT canal, COUNT(*) AS total
    FROM conv_base
    GROUP BY canal
),
conv_unanswered_by_channel AS (
    SELECT canal, COUNT(*) AS total
    FROM conv_base
    WHERE ultimo_entrante_en IS NOT NULL
      AND (ultimo_saliente_en IS NULL OR ultimo_saliente_en < ultimo_entrante_en)
    GROUP BY canal
),
contactos_base AS (
    SELECT
        c.id,
        COALESCE(NULLIF(lower(c.estado), ''), 'desconocido') AS estado,
        COALESCE(NULLIF(lower(c.captura_estado), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(c.origen), ''), 'desconocido') AS origen
    FROM public.contactos c
    JOIN tenant t ON c.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR c.creado_en >= p_from)
      AND (p_to IS NULL OR c.creado_en <= p_to)
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
contact_conversion AS (
    SELECT
        cb.canal,
        COUNT(*) AS conversaciones,
        COUNT(*) FILTER (WHERE cb.contacto_id IS NOT NULL) AS con_contacto,
        COUNT(*) FILTER (WHERE ct.id IS NOT NULL AND COALESCE(NULLIF(lower(ct.captura_estado), ''), 'incompleto') = 'completo') AS contacto_completo
    FROM conv_base cb
    LEFT JOIN public.contactos ct ON ct.id = cb.contacto_id
    GROUP BY cb.canal
),
contact_conversion_totals AS (
    SELECT
        COALESCE(SUM(con_contacto), 0) AS con_contacto_total,
        COALESCE(SUM(contacto_completo), 0) AS contacto_completo_total
    FROM contact_conversion
),
visitantes AS (
    SELECT COALESCE(total, 0) AS total
    FROM public.embudo_visitantes_contador(p_from, p_to, (SELECT organizacion_id FROM tenant))
),
webchat_visitas AS (
    SELECT
        COALESCE((SELECT total FROM visitantes), 0) AS visitas_sin_chat,
        COALESCE((SELECT webchat_total FROM conv_totals), 0) AS conversaciones
),
lead_visitas AS (
    SELECT COUNT(*)::bigint AS total
    FROM public.panel_leads_geo_base(NULL, p_from, p_to)
),
total_visitas AS (
    SELECT
        COALESCE((SELECT total FROM visitantes), 0)
        + COALESCE((SELECT total FROM lead_visitas), 0) AS total
),
mensajes_base AS (
    SELECT
        m.conversacion_id,
        m.creado_en,
        CASE
            WHEN lower(COALESCE(m.direccion, '')) IN ('entrante', 'inbound', 'incoming', 'received') THEN 'entrante'
            WHEN lower(COALESCE(m.direccion, '')) IN ('saliente', 'outbound', 'outgoing', 'sent') THEN 'saliente'
            ELSE NULL
        END AS direccion,
        cb.canal
    FROM public.mensajes m
    JOIN conv_base cb ON cb.id = m.conversacion_id
    JOIN tenant t ON m.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR m.creado_en >= p_from)
      AND (p_to IS NULL OR m.creado_en <= p_to)
),
first_inbound AS (
    SELECT conversacion_id, canal, MIN(creado_en) AS entrante_en
    FROM mensajes_base
    WHERE direccion = 'entrante'
    GROUP BY conversacion_id, canal
),
first_response AS (
    SELECT
        fi.conversacion_id,
        fi.canal,
        fi.entrante_en,
        MIN(mb.creado_en) AS respuesta_en
    FROM first_inbound fi
    LEFT JOIN mensajes_base mb
      ON mb.conversacion_id = fi.conversacion_id
     AND mb.direccion = 'saliente'
     AND mb.creado_en >= fi.entrante_en
    GROUP BY fi.conversacion_id, fi.canal, fi.entrante_en
),
response_metrics AS (
    SELECT
        canal,
        EXTRACT(EPOCH FROM (respuesta_en - entrante_en)) AS segundos
    FROM first_response
    WHERE respuesta_en IS NOT NULL
      AND respuesta_en > entrante_en
),
response_summary AS (
    SELECT
        AVG(segundos) AS promedio_segundos,
        MAX(segundos) AS maximo_segundos
    FROM response_metrics
),
response_summary_by_channel AS (
    SELECT
        canal,
        COUNT(*) AS con_respuesta,
        AVG(segundos) AS promedio_segundos,
        MAX(segundos) AS maximo_segundos
    FROM response_metrics
    GROUP BY canal
)
SELECT jsonb_build_object(
    'conversaciones', jsonb_build_object(
        'total', COALESCE((SELECT total FROM conv_totals), 0),
        'por_estado', COALESCE((
            SELECT jsonb_object_agg(estado, total ORDER BY estado)
            FROM conv_by_state
        ), '{}'::jsonb),
        'por_canal', COALESCE((
            SELECT jsonb_object_agg(canal, total ORDER BY canal)
            FROM conv_by_channel
        ), '{}'::jsonb),
        'sin_respuesta_total', COALESCE((SELECT sin_respuesta_total FROM conv_totals), 0),
        'sin_respuesta_por_canal', COALESCE((
            SELECT jsonb_object_agg(canal, total ORDER BY canal)
            FROM conv_unanswered_by_channel
        ), '{}'::jsonb),
        'abiertas_total', COALESCE((SELECT abiertas_total FROM conv_totals), 0),
        'activas_24h', COALESCE((SELECT activas_24h FROM conv_totals), 0),
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
        ), '{}'::jsonb),
        'desde_conversaciones', jsonb_build_object(
            'con_contacto_total', COALESCE((SELECT con_contacto_total FROM contact_conversion_totals), 0),
            'contacto_completo_total', COALESCE((SELECT contacto_completo_total FROM contact_conversion_totals), 0),
            'por_canal', COALESCE((
                SELECT jsonb_object_agg(
                    canal,
                    jsonb_build_object(
                        'conversaciones', conversaciones,
                        'con_contacto', con_contacto,
                        'contacto_completo', contacto_completo
                    )
                    ORDER BY canal
                )
                FROM contact_conversion
            ), '{}'::jsonb)
        )
    ),
    'visitantes', COALESCE((SELECT total FROM visitantes), 0),
    'visitas_totales', COALESCE((SELECT total FROM total_visitas), 0),
    'tiempos_respuesta', jsonb_build_object(
        'promedio', COALESCE((SELECT promedio_segundos FROM response_summary), 0),
        'maximo', COALESCE((SELECT maximo_segundos FROM response_summary), 0),
        'por_canal', COALESCE((
            SELECT jsonb_object_agg(
                canal,
                jsonb_build_object(
                    'con_respuesta', con_respuesta,
                    'promedio', promedio_segundos,
                    'maximo', maximo_segundos
                )
                ORDER BY canal
            )
            FROM response_summary_by_channel
        ), '{}'::jsonb)
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
