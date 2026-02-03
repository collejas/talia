-- Agrega filtrado por organizacion_id a las RPC que alimentan los dashboards de tenant.

CREATE OR REPLACE FUNCTION public.embudo_visitantes_contador(
    p_closed_after timestamp with time zone DEFAULT (now() - '30 days'::interval),
    p_organizacion uuid DEFAULT NULL::uuid
) RETURNS TABLE(total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
WITH tenant AS (
    SELECT COALESCE(p_organizacion, public.usuario_organizacion_id(auth.uid())) AS organizacion_id
),
base AS (
    SELECT sc.session_id
    FROM public.webchat_session_closures sc
    JOIN tenant t ON sc.organizacion_id = t.organizacion_id
    WHERE p_closed_after IS NULL OR sc.closed_at >= p_closed_after
),
filtered AS (
    SELECT b.session_id
    FROM base b
    CROSS JOIN tenant t
    LEFT JOIN public.mensajes m
      ON m.datos ->> 'session_id' = b.session_id
     AND m.direccion = 'entrante'
     AND m.organizacion_id = t.organizacion_id
    WHERE m.id IS NULL
)
SELECT COUNT(*)::bigint AS total
FROM filtered;
$$;

CREATE OR REPLACE FUNCTION public.embudo_visitantes_contador(
    p_closed_after timestamp with time zone DEFAULT (now() - '30 days'::interval),
    p_closed_before timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_organizacion uuid DEFAULT NULL::uuid
) RETURNS TABLE(total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
WITH tenant AS (
    SELECT COALESCE(p_organizacion, public.usuario_organizacion_id(auth.uid())) AS organizacion_id
),
base AS (
    SELECT sc.session_id
    FROM public.webchat_session_closures sc
    JOIN tenant t ON sc.organizacion_id = t.organizacion_id
    WHERE (p_closed_after IS NULL OR sc.closed_at >= p_closed_after)
      AND (p_closed_before IS NULL OR sc.closed_at <= p_closed_before)
),
filtered AS (
    SELECT b.session_id
    FROM base b
    CROSS JOIN tenant t
    LEFT JOIN public.mensajes m
      ON m.datos ->> 'session_id' = b.session_id
     AND m.direccion = 'entrante'
     AND m.organizacion_id = t.organizacion_id
    WHERE m.id IS NULL
)
SELECT COUNT(*)::bigint AS total
FROM filtered;
$$;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_base(
    p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_organizacion uuid DEFAULT NULL::uuid
) RETURNS TABLE(
    session_id text,
    closed_at timestamp with time zone,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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
        w.contacto_id,
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
        SELECT contacto_datos AS cd
        FROM public.contactos
        WHERE id = v.contacto_id
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

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_estados(
    p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_organizacion uuid DEFAULT NULL::uuid
) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
WITH base AS (
    SELECT * FROM public.panel_visitantes_sin_chat_base(p_from, p_to, p_organizacion)
),
summary AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cve_ent IS NOT NULL) AS ubicados,
        COUNT(*) FILTER (WHERE cve_ent IS NULL) AS sin_ubicacion
    FROM base
),
grouped AS (
    SELECT
        cve_ent,
        MAX(nom_ent) AS nombre,
        COUNT(*) AS total
    FROM base
    WHERE cve_ent IS NOT NULL
    GROUP BY cve_ent
)
SELECT jsonb_build_object(
    'totals', jsonb_build_object(
        'total', COALESCE(summary.total, 0),
        'ubicados', COALESCE(summary.ubicados, 0),
        'sin_ubicacion', COALESCE(summary.sin_ubicacion, 0)
    ),
    'items', (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'cve_ent', grouped.cve_ent,
                    'nombre', grouped.nombre,
                    'total', grouped.total,
                    'por_canal', jsonb_build_object('visitantes', grouped.total)
                )
                ORDER BY grouped.cve_ent
            ),
            '[]'::jsonb
        )
        FROM grouped
    )
)
FROM summary;
$$;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_municipios(
    p_estado text,
    p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_organizacion uuid DEFAULT NULL::uuid
) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
AS $$
WITH state_code AS (
    SELECT LPAD(REGEXP_REPLACE(COALESCE(p_estado, ''), '\\D', '', 'g'), 2, '0') AS code
),
base AS (
    SELECT b.*
    FROM public.panel_visitantes_sin_chat_base(p_from, p_to, p_organizacion) b
    JOIN state_code s ON b.cve_ent = s.code
),
summary AS (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cvegeo IS NOT NULL) AS ubicados,
        COUNT(*) FILTER (WHERE cvegeo IS NULL) AS sin_ubicacion
    FROM base
),
grouped AS (
    SELECT
        cvegeo,
        MAX(nom_mun) AS nombre,
        COUNT(*) AS total
    FROM base
    WHERE cvegeo IS NOT NULL
    GROUP BY cvegeo
),
estado_info AS (
    SELECT MAX(cve_ent) AS cve_ent, MAX(nom_ent) AS nombre FROM base
)
SELECT jsonb_build_object(
    'estado', jsonb_build_object(
        'cve_ent', COALESCE((SELECT cve_ent FROM estado_info), (SELECT code FROM state_code)),
        'nombre', (SELECT nombre FROM estado_info)
    ),
    'totals', jsonb_build_object(
        'total', COALESCE(summary.total, 0),
        'ubicados', COALESCE(summary.ubicados, 0),
        'sin_ubicacion', COALESCE(summary.sin_ubicacion, 0)
    ),
    'items', (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'cvegeo', grouped.cvegeo,
                    'nombre', grouped.nombre,
                    'total', grouped.total,
                    'por_canal', jsonb_build_object('visitantes', grouped.total)
                )
                ORDER BY grouped.cvegeo
            ),
            '[]'::jsonb
        )
        FROM grouped
    )
)
FROM summary;
$$;

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
        COALESCE(NULLIF(lower(c.estado), ''), 'desconocido') AS estado,
        lower(NULLIF(c.canal, '')) AS canal
    FROM public.conversaciones c
    JOIN tenant t ON c.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR c.iniciada_en >= p_from)
      AND (p_to IS NULL OR c.iniciada_en <= p_to)
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
        m.direccion,
        m.creado_en
    FROM public.mensajes m
    JOIN tenant t ON m.organizacion_id = t.organizacion_id
    WHERE m.direccion IN ('entrante', 'saliente')
      AND (p_from IS NULL OR m.creado_en >= p_from)
      AND (p_to IS NULL OR m.creado_en <= p_to)
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
