BEGIN;

CREATE OR REPLACE FUNCTION public.crm_contact_restart_stats(
    p_organizacion_id uuid,
    p_min_restart_sequence integer DEFAULT 2,
    p_limit integer DEFAULT 200
)
RETURNS TABLE(
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    total_ciclos integer,
    ciclo_actual integer,
    monto_total numeric,
    monto_ciclo_actual numeric,
    monto_ciclos_previos numeric,
    oportunidad_id uuid,
    etapa_id uuid,
    etapa_nombre text,
    estado text,
    vendedor_id uuid,
    vendedor_nombre text,
    actualizado_en timestamptz,
    primer_ciclo_en timestamptz,
    ultimo_reinicio_en timestamptz,
    metadata jsonb,
    ciclos_detalle jsonb,
    reengage_attempts integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $$
WITH base AS (
    SELECT
        o.id AS oportunidad_id,
        o.contacto_principal_id AS contacto_id,
        o.organizacion_id,
        COALESCE((o.metadata->>'restart_sequence')::integer, 1) AS restart_sequence,
        COALESCE(o.monto_estimado, 0) AS monto_estimado,
        o.estado,
        o.etapa_id,
        o.asignado_a_usuario_id,
        o.propietario_usuario_id,
        COALESCE(o.actualizado_en, o.creado_en) AS actualizado_en,
        o.creado_en,
        o.metadata
    FROM public.oportunidades o
    JOIN public.personas p ON p.id = o.contacto_principal_id
    WHERE
        o.organizacion_id = p_organizacion_id
        AND p.organizacion_id = p_organizacion_id
        AND (
            public.es_admin(auth.uid())
            OR public.is_in_current_user_scope(o.asignado_a_usuario_id)
            OR public.is_in_current_user_scope(o.propietario_usuario_id)
            OR public.is_in_current_user_scope(p.propietario_usuario_id)
        )
),
ranked AS (
    SELECT
        b.*,
        ROW_NUMBER() OVER (
            PARTITION BY b.contacto_id
            ORDER BY b.restart_sequence DESC,
                     b.actualizado_en DESC,
                     b.creado_en DESC
        ) AS rn
    FROM base b
),
aggregated AS (
    SELECT
        contacto_id,
        COUNT(*)::integer AS total_ciclos,
        MAX(restart_sequence)::integer AS ciclo_actual,
        SUM(monto_estimado)::numeric AS monto_total,
        MIN(creado_en) AS primer_ciclo_en,
        MAX(
            CASE
                WHEN restart_sequence > 1 THEN COALESCE(actualizado_en, creado_en)
                ELSE NULL
            END
        ) AS ultimo_reinicio_en
    FROM base
    GROUP BY contacto_id
),
current_cycle AS (
    SELECT r.*
    FROM ranked r
    WHERE r.rn = 1
),
history AS (
    SELECT
        contacto_id,
        jsonb_agg(
            jsonb_build_object(
                'oportunidad_id', oportunidad_id,
                'restart_sequence', restart_sequence,
                'monto_estimado', monto_estimado,
                'etapa_id', etapa_id,
                'estado', estado,
                'asignado_a_usuario_id', asignado_a_usuario_id,
                'actualizado_en', actualizado_en,
                'creado_en', creado_en
            )
            ORDER BY restart_sequence ASC, creado_en ASC
        ) AS ciclos_detalle
    FROM base
    GROUP BY contacto_id
)
SELECT
    agg.contacto_id,
    p.nombre_completo AS contacto_nombre,
    p.correo_principal AS contacto_correo,
    p.telefono_principal_e164 AS contacto_telefono,
    agg.total_ciclos,
    agg.ciclo_actual,
    agg.monto_total,
    cur.monto_estimado AS monto_ciclo_actual,
    (agg.monto_total - cur.monto_estimado) AS monto_ciclos_previos,
    cur.oportunidad_id,
    cur.etapa_id,
    ep.nombre AS etapa_nombre,
    cur.estado,
    cur.asignado_a_usuario_id AS vendedor_id,
    usr.nombre_completo AS vendedor_nombre,
    cur.actualizado_en,
    agg.primer_ciclo_en,
    agg.ultimo_reinicio_en,
    cur.metadata,
    history.ciclos_detalle,
    COALESCE((cur.metadata->'whatsapp_followup'->'reengage'->>'attempts')::integer, 0) AS reengage_attempts
FROM aggregated agg
JOIN current_cycle cur ON cur.contacto_id = agg.contacto_id
JOIN public.personas p ON p.id = agg.contacto_id
LEFT JOIN public.etapas_pipeline ep ON ep.id = cur.etapa_id
LEFT JOIN public.usuarios usr ON usr.id = cur.asignado_a_usuario_id
LEFT JOIN history ON history.contacto_id = agg.contacto_id
WHERE agg.ciclo_actual >= GREATEST(p_min_restart_sequence, 1)
ORDER BY agg.ciclo_actual DESC, agg.total_ciclos DESC, cur.actualizado_en DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 200);
$$;

CREATE OR REPLACE FUNCTION public.dashboard_kpis(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
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
            COALESCE(NULLIF(lower(COALESCE(c.estado, c.metadata ->> 'estado', '')), ''), 'desconocido') AS estado,
            COALESCE(NULLIF(lower(COALESCE(c.persona_datos ->> 'captura_estado', c.metadata ->> 'captura_estado', '')), ''), 'incompleto') AS captura_estado,
            COALESCE(NULLIF(lower(c.origen), ''), 'desconocido') AS origen
        FROM public.personas c
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
    visitantes AS (
        SELECT COALESCE(total, 0) AS total
        FROM public.embudo_visitantes_contador(p_from, p_to, NULL::uuid)
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
        'visitas_totales', COALESCE((SELECT total FROM total_visitas), 0),
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

CREATE OR REPLACE FUNCTION public.dashboard_kpis(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_organizacion uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
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
        COALESCE(NULLIF(lower(COALESCE(c.estado, c.metadata ->> 'estado', '')), ''), 'desconocido') AS estado,
        COALESCE(NULLIF(lower(COALESCE(c.persona_datos ->> 'captura_estado', c.metadata ->> 'captura_estado', '')), ''), 'incompleto') AS captura_estado,
        COALESCE(NULLIF(lower(c.origen), ''), 'desconocido') AS origen
    FROM public.personas c
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
        COUNT(*) FILTER (WHERE ct.id IS NOT NULL AND COALESCE(NULLIF(lower(COALESCE(ct.estado, ct.metadata ->> 'estado', '')), ''), 'desconocido') = 'completo') AS contacto_completo
    FROM conv_base cb
    LEFT JOIN public.personas ct ON ct.id = cb.contacto_id
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

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_base(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(session_id text, closed_at timestamptz, cve_ent text, nom_ent text, cve_mun text, nom_mun text, cvegeo text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $$
    WITH closures AS (
        SELECT sc.session_id, sc.closed_at
        FROM public.webchat_session_closures sc
        WHERE (p_from IS NULL OR sc.closed_at >= p_from)
          AND (p_to IS NULL OR sc.closed_at <= p_to)
    ),
    filtered AS (
        SELECT c.session_id, c.closed_at
        FROM closures c
        LEFT JOIN public.mensajes m
          ON m.datos ->> 'session_id' = c.session_id
         AND m.direccion = 'entrante'
        WHERE m.id IS NULL
    )
    SELECT
        f.session_id,
        f.closed_at,
        COALESCE(
            NULLIF(v.cve_ent, ''),
            NULLIF(c.cve_ent, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 2
                    THEN substr(v.cvegeo_digits, 1, 2)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 2
                    THEN substr(c.cvegeo_digits, 1, 2)
                ELSE NULL
            END
        ) AS cve_ent,
        COALESCE(NULLIF(v.nom_ent, ''), NULLIF(c.nom_ent, '')) AS nom_ent,
        COALESCE(
            NULLIF(v.cve_mun, ''),
            NULLIF(c.cve_mun, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 5
                    THEN substr(v.cvegeo_digits, 3, 3)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 5
                    THEN substr(c.cvegeo_digits, 3, 3)
                ELSE NULL
            END
        ) AS cve_mun,
        COALESCE(NULLIF(v.nom_mun, ''), NULLIF(c.nom_mun, '')) AS nom_mun,
        COALESCE(
            NULLIF(v.cvegeo, ''),
            NULLIF(c.cvegeo, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 5
                    THEN substr(v.cvegeo_digits, 1, 5)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 5
                    THEN substr(c.cvegeo_digits, 1, 5)
                WHEN v.cve_ent IS NOT NULL AND v.cve_mun IS NOT NULL
                    THEN v.cve_ent || v.cve_mun
                WHEN c.cve_ent IS NOT NULL AND c.cve_mun IS NOT NULL
                    THEN c.cve_ent || c.cve_mun
                ELSE NULL
            END
        ) AS cvegeo
    FROM filtered f
    LEFT JOIN LATERAL (
        SELECT
            w.persona_id,
            w.cve_ent,
            w.nom_ent,
            w.cve_mun,
            w.nom_mun,
            w.cvegeo,
            REGEXP_REPLACE(COALESCE(w.cvegeo, ''), '\\D', '', 'g') AS cvegeo_digits
        FROM public.webchat_visitantes w
        WHERE w.session_id = f.session_id
        LIMIT 1
    ) v ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            CASE
                WHEN val_cve_ent IS NULL THEN NULL
                ELSE LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
            END AS cve_ent,
            val_nom_ent AS nom_ent,
            CASE
                WHEN val_cve_mun IS NULL THEN NULL
                ELSE LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
            END AS cve_mun,
            val_nom_mun AS nom_mun,
            CASE
                WHEN val_cvegeo IS NOT NULL THEN LPAD(REGEXP_REPLACE(val_cvegeo, '\\D', '', 'g'), 5, '0')
                WHEN val_cve_ent IS NOT NULL AND val_cve_mun IS NOT NULL
                    THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
                        || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
                ELSE NULL
            END AS cvegeo,
            REGEXP_REPLACE(
                COALESCE(val_cvegeo,
                    CASE
                        WHEN val_cve_ent IS NOT NULL AND val_cve_mun IS NOT NULL
                            THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
                                || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
                        ELSE NULL
                    END
                ),
                '\\D',
                '',
                'g'
            ) AS cvegeo_digits
        FROM (
            SELECT
                COALESCE(
                    NULLIF(p.persona_datos #>> '{ubicacion,cve_ent}', ''),
                    NULLIF(p.persona_datos #>> '{cve_ent}', '')
                ) AS val_cve_ent,
                COALESCE(
                    NULLIF(p.persona_datos #>> '{ubicacion,nom_ent}', ''),
                    NULLIF(p.persona_datos #>> '{nom_ent}', '')
                ) AS val_nom_ent,
                COALESCE(
                    NULLIF(p.persona_datos #>> '{ubicacion,cve_mun}', ''),
                    NULLIF(p.persona_datos #>> '{cve_mun}', '')
                ) AS val_cve_mun,
                COALESCE(
                    NULLIF(p.persona_datos #>> '{ubicacion,nom_mun}', ''),
                    NULLIF(p.persona_datos #>> '{nom_mun}', '')
                ) AS val_nom_mun,
                COALESCE(
                    NULLIF(p.persona_datos #>> '{ubicacion,cvegeo}', ''),
                    NULLIF(p.persona_datos #>> '{cvegeo}', '')
                ) AS val_cvegeo
            FROM public.personas p
            WHERE p.id = v.persona_id
            LIMIT 1
        ) merged
    ) c ON TRUE;
$$;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_base(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_organizacion uuid DEFAULT NULL
)
RETURNS TABLE(session_id text, closed_at timestamptz, cve_ent text, nom_ent text, cve_mun text, nom_mun text, cvegeo text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $$
WITH tenant AS (
    SELECT COALESCE(p_organizacion, public.usuario_organizacion_id(auth.uid())) AS organizacion_id
),
closures AS (
    SELECT sc.session_id, sc.closed_at
    FROM public.webchat_session_closures sc
    JOIN tenant t ON sc.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR sc.closed_at >= p_from)
      AND (p_to IS NULL OR sc.closed_at <= p_to)
),
filtered AS (
    SELECT c.session_id, c.closed_at
    FROM closures c
    CROSS JOIN tenant t
    LEFT JOIN public.mensajes m
      ON m.datos ->> 'session_id' = c.session_id
     AND m.direccion = 'entrante'
     AND m.organizacion_id = t.organizacion_id
    WHERE m.id IS NULL
)
SELECT
    f.session_id,
    f.closed_at,
    COALESCE(
        NULLIF(v.cve_ent, ''),
        NULLIF(c.cve_ent, ''),
        CASE
            WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 2
                THEN substr(v.cvegeo_digits, 1, 2)
            WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 2
                THEN substr(c.cvegeo_digits, 1, 2)
            ELSE NULL
        END
    ) AS cve_ent,
    COALESCE(NULLIF(v.nom_ent, ''), NULLIF(c.nom_ent, '')) AS nom_ent,
    COALESCE(
        NULLIF(v.cve_mun, ''),
        NULLIF(c.cve_mun, ''),
        CASE
            WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 5
                THEN substr(v.cvegeo_digits, 3, 3)
            WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 5
                THEN substr(c.cvegeo_digits, 3, 3)
            ELSE NULL
        END
    ) AS cve_mun,
    COALESCE(NULLIF(v.nom_mun, ''), NULLIF(c.nom_mun, '')) AS nom_mun,
    COALESCE(
        NULLIF(v.cvegeo, ''),
        NULLIF(c.cvegeo, ''),
        CASE
            WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 5
                THEN substr(v.cvegeo_digits, 1, 5)
            WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 5
                THEN substr(c.cvegeo_digits, 1, 5)
            WHEN v.cve_ent IS NOT NULL AND v.cve_mun IS NOT NULL
                THEN v.cve_ent || v.cve_mun
            WHEN c.cve_ent IS NOT NULL AND c.cve_mun IS NOT NULL
                THEN c.cve_ent || c.cve_mun
            ELSE NULL
        END
    ) AS cvegeo
FROM filtered f
CROSS JOIN tenant t
LEFT JOIN LATERAL (
    SELECT
        w.persona_id,
        w.cve_ent,
        w.nom_ent,
        w.cve_mun,
        w.nom_mun,
        w.cvegeo,
        REGEXP_REPLACE(COALESCE(w.cvegeo, ''), '\\D', '', 'g') AS cvegeo_digits
    FROM public.webchat_visitantes w
    WHERE w.session_id = f.session_id
      AND w.organizacion_id = t.organizacion_id
    LIMIT 1
) v ON TRUE
LEFT JOIN LATERAL (
    SELECT
        CASE
            WHEN val_cve_ent IS NULL THEN NULL
            ELSE LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
        END AS cve_ent,
        val_nom_ent AS nom_ent,
        CASE
            WHEN val_cve_mun IS NULL THEN NULL
            ELSE LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
        END AS cve_mun,
        val_nom_mun AS nom_mun,
        CASE
            WHEN val_cvegeo IS NOT NULL THEN LPAD(REGEXP_REPLACE(val_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN val_cve_ent IS NOT NULL AND val_cve_mun IS NOT NULL
                THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
                    || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo,
        REGEXP_REPLACE(
            COALESCE(val_cvegeo,
                CASE
                    WHEN val_cve_ent IS NOT NULL AND val_cve_mun IS NOT NULL
                        THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
                            || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
                    ELSE NULL
                END
            ),
            '\\D', '', 'g'
        ) AS cvegeo_digits
    FROM (
        SELECT persona_datos AS cd
        FROM public.personas
        WHERE id = v.persona_id
          AND organizacion_id = t.organizacion_id
        LIMIT 1
    ) raw,
    LATERAL (
        SELECT
            COALESCE(
                NULLIF(raw.cd #>> '{ubicacion,cve_ent}', ''),
                NULLIF(raw.cd #>> '{cve_ent}', '')
            ) AS val_cve_ent,
            COALESCE(
                NULLIF(raw.cd #>> '{ubicacion,nom_ent}', ''),
                NULLIF(raw.cd #>> '{nom_ent}', '')
            ) AS val_nom_ent,
            COALESCE(
                NULLIF(raw.cd #>> '{ubicacion,cve_mun}', ''),
                NULLIF(raw.cd #>> '{cve_mun}', '')
            ) AS val_cve_mun,
            COALESCE(
                NULLIF(raw.cd #>> '{ubicacion,nom_mun}', ''),
                NULLIF(raw.cd #>> '{nom_mun}', '')
            ) AS val_nom_mun,
            COALESCE(
                NULLIF(raw.cd #>> '{ubicacion,cvegeo}', ''),
                NULLIF(raw.cd #>> '{cvegeo}', '')
            ) AS val_cvegeo
    ) vals
) c ON TRUE;
$$;

COMMIT;
