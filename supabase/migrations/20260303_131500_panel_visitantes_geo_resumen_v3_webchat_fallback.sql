-- v3: fallback de tráfico web/fuente/utm con señales de webchat cuando web_sessions está vacío.

CREATE OR REPLACE FUNCTION public.panel_visitantes_geo_resumen_v3(
    p_nivel text DEFAULT 'estado'::text,
    p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_estado text DEFAULT NULL::text,
    p_source_class text DEFAULT NULL::text,
    p_utm_source text DEFAULT NULL::text,
    p_utm_medium text DEFAULT NULL::text,
    p_utm_campaign text DEFAULT NULL::text
) RETURNS TABLE(
    location_level text,
    location_key text,
    location_name text,
    sesiones_web_total bigint,
    sesiones_webchat_total bigint,
    sesiones_con_chat_webchat bigint,
    sesiones_sin_chat_webchat bigint,
    conversaciones_whatsapp bigint,
    conversaciones_voz bigint,
    fuentes_top jsonb,
    utm_top jsonb,
    total_visitas bigint,
    visitas_con_chat bigint,
    visitas_sin_chat bigint,
    webchat_total bigint,
    webchat_con_chat bigint,
    webchat_sin_chat bigint,
    whatsapp_total bigint,
    voz_total bigint,
    has_data boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $_$
WITH base AS (
    SELECT *
    FROM public.panel_visitantes_geo_resumen_v2(
        p_nivel,
        p_from,
        p_to,
        p_estado,
        p_source_class,
        p_utm_source,
        p_utm_medium,
        p_utm_campaign
    )
),
normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
attribution_filter_active AS (
    SELECT (
        p_source_class IS NOT NULL OR
        p_utm_source IS NOT NULL OR
        p_utm_medium IS NOT NULL OR
        p_utm_campaign IS NOT NULL
    ) AS is_active
),
state_filter AS (
    SELECT CASE
        WHEN p_estado IS NULL OR btrim(p_estado) = '' THEN NULL::text
        ELSE lpad(regexp_replace(btrim(p_estado), '\\D', '', 'g'), 2, '0')
    END AS estado
),
tenant AS (
    SELECT COALESCE(public.usuario_organizacion_id(auth.uid()), '00000000-0000-0000-0000-000000000001'::uuid) AS organizacion_id
),
webchat_as_web_raw AS (
    SELECT
        w.session_id,
        w.contacto_id,
        COALESCE(w.ultimo_evento_en, now()) AS activity_at,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.mensajes m
                WHERE m.datos ->> 'session_id' = w.session_id
                  AND m.direccion = 'entrante'
            )
            THEN TRUE
            ELSE FALSE
        END AS tuvo_chat,
        NULLIF(lower(substring(COALESCE(w.landing_url, '') FROM '(?:\\?|&)utm_source=([^&#]+)')), '') AS utm_source,
        NULLIF(lower(substring(COALESCE(w.landing_url, '') FROM '(?:\\?|&)utm_medium=([^&#]+)')), '') AS utm_medium,
        NULLIF(lower(substring(COALESCE(w.landing_url, '') FROM '(?:\\?|&)utm_campaign=([^&#]+)')), '') AS utm_campaign,
        NULLIF(btrim(w.referrer), '') AS referrer,
        COALESCE(w.cve_ent, NULLIF(w.geo ->> 'cve_ent', '')) AS cve_ent_raw,
        COALESCE(w.nom_ent, NULLIF(w.geo ->> 'nom_ent', '')) AS nom_ent_raw,
        COALESCE(w.cve_mun, NULLIF(w.geo ->> 'cve_mun', '')) AS cve_mun_raw,
        COALESCE(w.nom_mun, NULLIF(w.geo ->> 'nom_mun', '')) AS nom_mun_raw,
        COALESCE(w.cvegeo, NULLIF(w.geo ->> 'cvegeo', '')) AS cvegeo_raw,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'country_code', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((w.geo -> 'client') ->> 'country_code', ''),
            NULLIF((w.geo -> 'client') ->> 'country', ''),
            'UNK'
        ) AS country_code_raw,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'country_name', ''),
            NULLIF((w.geo -> 'client') ->> 'country_name', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((w.geo -> 'client') ->> 'country', ''),
            'País desconocido'
        ) AS country_name_raw
    FROM public.webchat_visitantes w
    JOIN tenant t ON w.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR w.ultimo_evento_en >= p_from)
      AND (p_to IS NULL OR w.ultimo_evento_en <= p_to)
),
webchat_as_web_norm AS (
    SELECT
        r.session_id,
        r.contacto_id,
        r.activity_at,
        r.tuvo_chat,
        CASE
            WHEN r.country_code_raw IS NULL OR r.country_code_raw = '' THEN 'UNK'
            WHEN length(r.country_code_raw) = 2 THEN upper(r.country_code_raw)
            ELSE upper(substr(r.country_code_raw, 1, 2))
        END AS country_code,
        COALESCE(NULLIF(r.country_name_raw, ''), 'País desconocido') AS country_name,
        CASE
            WHEN r.cve_ent_raw IS NULL OR btrim(r.cve_ent_raw) = '' THEN NULL::text
            ELSE lpad(regexp_replace(btrim(r.cve_ent_raw), '\\D', '', 'g'), 2, '0')
        END AS cve_ent,
        COALESCE(NULLIF(btrim(r.nom_ent_raw), ''), 'Estado desconocido') AS nom_ent,
        CASE
            WHEN r.cve_mun_raw IS NULL OR btrim(r.cve_mun_raw) = '' THEN NULL::text
            ELSE lpad(regexp_replace(btrim(r.cve_mun_raw), '\\D', '', 'g'), 3, '0')
        END AS cve_mun,
        COALESCE(NULLIF(btrim(r.nom_mun_raw), ''), 'Municipio desconocido') AS nom_mun,
        CASE
            WHEN r.cvegeo_raw IS NOT NULL AND btrim(r.cvegeo_raw) <> '' THEN lpad(regexp_replace(btrim(r.cvegeo_raw), '\\D', '', 'g'), 5, '0')
            WHEN r.cve_ent_raw IS NOT NULL AND r.cve_mun_raw IS NOT NULL THEN
                lpad(regexp_replace(btrim(r.cve_ent_raw), '\\D', '', 'g'), 2, '0')
                || lpad(regexp_replace(btrim(r.cve_mun_raw), '\\D', '', 'g'), 3, '0')
            ELSE NULL::text
        END AS cvegeo,
        r.referrer,
        COALESCE(r.utm_source, NULLIF(lower(substring(COALESCE(r.referrer, '') FROM '(?:\\?|&)utm_source=([^&#]+)')), '')) AS utm_source,
        r.utm_medium,
        r.utm_campaign,
        CASE
            WHEN COALESCE(r.utm_source, r.utm_medium, r.utm_campaign) IS NOT NULL THEN 'campaign'
            WHEN r.referrer IS NULL THEN 'direct'
            WHEN r.referrer ~* 'google\\.' THEN 'organic_search'
            WHEN r.referrer ~* '(facebook|instagram|twitter|t\\.co|linkedin)\\.' THEN 'organic_social'
            ELSE 'referral'
        END AS source_class
    FROM webchat_as_web_raw r
),
webchat_as_web_scoped AS (
    SELECT
        nl.nivel AS location_level,
        n.session_id,
        n.contacto_id,
        n.activity_at,
        n.tuvo_chat,
        n.source_class,
        n.utm_source,
        n.utm_medium,
        n.utm_campaign,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_code, ''), 'UNK')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(n.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_name, ''), 'País desconocido')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.nom_mun, ''), COALESCE(NULLIF(n.cvegeo, ''), 'Municipio desconocido'))
            ELSE COALESCE(NULLIF(n.nom_ent, ''), COALESCE(NULLIF(n.cve_ent, ''), 'Estado desconocido'))
        END AS location_name,
        n.cve_ent
    FROM webchat_as_web_norm n
    CROSS JOIN normalized_level nl
),
webchat_as_web_filtered AS (
    SELECT s.*
    FROM webchat_as_web_scoped s
    CROSS JOIN normalized_level nl
    CROSS JOIN state_filter sf
    WHERE (nl.nivel <> 'municipio' OR sf.estado IS NULL OR s.cve_ent = sf.estado)
      AND (p_source_class IS NULL OR lower(s.source_class) = lower(p_source_class))
      AND (p_utm_source IS NULL OR lower(COALESCE(s.utm_source, '')) = lower(p_utm_source))
      AND (p_utm_medium IS NULL OR lower(COALESCE(s.utm_medium, '')) = lower(p_utm_medium))
      AND (p_utm_campaign IS NULL OR lower(COALESCE(s.utm_campaign, '')) = lower(p_utm_campaign))
),
fallback_metrics AS (
    SELECT
        f.location_level,
        f.location_key,
        f.location_name,
        COUNT(DISTINCT f.session_id)::bigint AS sesiones_web_fallback
    FROM webchat_as_web_filtered f
    GROUP BY f.location_level, f.location_key, f.location_name
),
fallback_webchat_metrics AS (
    SELECT
        f.location_level,
        f.location_key,
        f.location_name,
        COUNT(DISTINCT f.session_id)::bigint AS sesiones_webchat_total,
        COUNT(DISTINCT f.session_id) FILTER (WHERE f.tuvo_chat)::bigint AS sesiones_con_chat_webchat,
        COUNT(DISTINCT f.session_id) FILTER (WHERE NOT f.tuvo_chat)::bigint AS sesiones_sin_chat_webchat
    FROM webchat_as_web_filtered f
    GROUP BY f.location_level, f.location_key, f.location_name
),
attributed_contacts AS (
    SELECT DISTINCT f.contacto_id
    FROM webchat_as_web_filtered f
    WHERE f.contacto_id IS NOT NULL
),
fallback_conversation_base AS (
    SELECT
        conv.id,
        lower(COALESCE(conv.canal, '')) AS canal,
        COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) AS activity_at,
        ct.contacto_datos,
        ct.telefono_e164
    FROM public.conversaciones conv
    JOIN tenant t ON conv.organizacion_id = t.organizacion_id
    JOIN attributed_contacts ac ON ac.contacto_id = conv.contacto_id
    JOIN public.contactos ct ON ct.id = conv.contacto_id AND ct.organizacion_id = t.organizacion_id
    WHERE lower(COALESCE(conv.canal, '')) IN ('whatsapp', 'voz')
      AND public.puede_ver_contacto(ct.id)
      AND (p_from IS NULL OR COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) >= p_from)
      AND (p_to IS NULL OR COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) <= p_to)
),
fallback_conversation_geo AS (
    SELECT
        cb.*,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,country_code}', ''),
            NULLIF(cb.contacto_datos #>> '{country_code}', ''),
            NULLIF(cb.contacto_datos #>> '{ubicacion,pais_codigo}', ''),
            NULLIF(cb.contacto_datos #>> '{pais_codigo}', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,country_name}', ''),
            NULLIF(cb.contacto_datos #>> '{country_name}', ''),
            NULLIF(cb.contacto_datos #>> '{ubicacion,pais_nombre}', ''),
            NULLIF(cb.contacto_datos #>> '{pais_nombre}', ''),
            NULLIF(cb.contacto_datos #>> '{ubicacion,pais}', ''),
            NULLIF(cb.contacto_datos #>> '{pais}', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,cve_ent}', ''),
            NULLIF(cb.contacto_datos #>> '{cve_ent}', '')
        ) AS raw_cve_ent,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,nom_ent}', ''),
            NULLIF(cb.contacto_datos #>> '{nom_ent}', '')
        ) AS raw_nom_ent,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,cve_mun}', ''),
            NULLIF(cb.contacto_datos #>> '{cve_mun}', '')
        ) AS raw_cve_mun,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,nom_mun}', ''),
            NULLIF(cb.contacto_datos #>> '{nom_mun}', '')
        ) AS raw_nom_mun,
        COALESCE(
            NULLIF(cb.contacto_datos #>> '{ubicacion,cvegeo}', ''),
            NULLIF(cb.contacto_datos #>> '{cvegeo}', '')
        ) AS raw_cvegeo,
        regexp_replace(COALESCE(cb.telefono_e164, ''), '\\D', '', 'g') AS telefono_digits
    FROM fallback_conversation_base cb
),
fallback_conversation_normalized AS (
    SELECT
        cg.id,
        cg.canal,
        CASE
            WHEN cg.raw_country_code IS NOT NULL AND cg.raw_country_code <> '' THEN
                CASE
                    WHEN length(cg.raw_country_code) = 2 THEN upper(cg.raw_country_code)
                    WHEN length(cg.raw_country_code) = 3 AND cg.raw_country_code ~ '^[A-Za-z]{3}$'
                        THEN upper(cg.raw_country_code)
                    ELSE upper(substr(cg.raw_country_code, 1, 2))
                END
            WHEN cg.telefono_digits LIKE '52%' THEN 'MX'
            ELSE 'UNK'
        END AS country_code,
        CASE
            WHEN cg.raw_country_name IS NOT NULL AND cg.raw_country_name <> '' THEN cg.raw_country_name
            WHEN cg.telefono_digits LIKE '52%' THEN 'México'
            ELSE 'País desconocido'
        END AS country_name,
        CASE
            WHEN cg.raw_cve_ent IS NOT NULL AND cg.raw_cve_ent <> '' THEN lpad(regexp_replace(cg.raw_cve_ent, '\\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        COALESCE(cg.raw_nom_ent, CASE WHEN cg.telefono_digits LIKE '52%' THEN 'Estado desconocido' END) AS nom_ent,
        CASE
            WHEN cg.raw_cve_mun IS NOT NULL AND cg.raw_cve_mun <> '' THEN lpad(regexp_replace(cg.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        cg.raw_nom_mun AS nom_mun,
        CASE
            WHEN cg.raw_cvegeo IS NOT NULL AND cg.raw_cvegeo <> '' THEN lpad(regexp_replace(cg.raw_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN cg.raw_cve_ent IS NOT NULL AND cg.raw_cve_mun IS NOT NULL THEN
                lpad(regexp_replace(cg.raw_cve_ent, '\\D', '', 'g'), 2, '0')
                || lpad(regexp_replace(cg.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM fallback_conversation_geo cg
),
fallback_conversation_scoped AS (
    SELECT
        nl.nivel AS location_level,
        n.canal,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_code, ''), 'UNK')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(n.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_name, ''), 'País desconocido')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.nom_mun, ''), COALESCE(NULLIF(n.cvegeo, ''), 'Municipio desconocido'))
            ELSE COALESCE(NULLIF(n.nom_ent, ''), COALESCE(NULLIF(n.cve_ent, ''), 'Estado desconocido'))
        END AS location_name,
        n.cve_ent
    FROM fallback_conversation_normalized n
    CROSS JOIN normalized_level nl
),
fallback_conversation_filtered AS (
    SELECT s.*
    FROM fallback_conversation_scoped s
    CROSS JOIN normalized_level nl
    CROSS JOIN state_filter sf
    WHERE nl.nivel <> 'municipio' OR sf.estado IS NULL OR s.cve_ent = sf.estado
),
fallback_conversation_metrics AS (
    SELECT
        s.location_level,
        s.location_key,
        s.location_name,
        COUNT(*) FILTER (WHERE s.canal = 'whatsapp')::bigint AS conversaciones_whatsapp,
        COUNT(*) FILTER (WHERE s.canal = 'voz')::bigint AS conversaciones_voz
    FROM fallback_conversation_filtered s
    GROUP BY s.location_level, s.location_key, s.location_name
),
fallback_source_rank AS (
    SELECT
        f.location_level,
        f.location_key,
        f.location_name,
        f.source_class,
        COUNT(DISTINCT f.session_id)::bigint AS total,
        row_number() OVER (
            PARTITION BY f.location_level, f.location_key, f.location_name
            ORDER BY COUNT(DISTINCT f.session_id) DESC, f.source_class
        ) AS rn
    FROM webchat_as_web_filtered f
    GROUP BY f.location_level, f.location_key, f.location_name, f.source_class
),
fallback_source_top AS (
    SELECT
        r.location_level,
        r.location_key,
        r.location_name,
        COALESCE(
            jsonb_agg(jsonb_build_object('source', r.source_class, 'total', r.total)
            ORDER BY r.total DESC, r.source_class) FILTER (WHERE r.rn <= 5),
            '[]'::jsonb
        ) AS fuentes_top
    FROM fallback_source_rank r
    GROUP BY r.location_level, r.location_key, r.location_name
),
fallback_utm_rank AS (
    SELECT
        f.location_level,
        f.location_key,
        f.location_name,
        COALESCE(f.utm_source, '(none)') AS utm_source,
        COALESCE(f.utm_medium, '(none)') AS utm_medium,
        COALESCE(f.utm_campaign, '(none)') AS utm_campaign,
        COUNT(DISTINCT f.session_id)::bigint AS total,
        row_number() OVER (
            PARTITION BY f.location_level, f.location_key, f.location_name
            ORDER BY COUNT(DISTINCT f.session_id) DESC,
                     COALESCE(f.utm_source, '(none)'),
                     COALESCE(f.utm_medium, '(none)'),
                     COALESCE(f.utm_campaign, '(none)')
        ) AS rn
    FROM webchat_as_web_filtered f
    GROUP BY f.location_level, f.location_key, f.location_name,
             COALESCE(f.utm_source, '(none)'), COALESCE(f.utm_medium, '(none)'), COALESCE(f.utm_campaign, '(none)')
),
fallback_utm_top AS (
    SELECT
        r.location_level,
        r.location_key,
        r.location_name,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'utm_source', r.utm_source,
                    'utm_medium', r.utm_medium,
                    'utm_campaign', r.utm_campaign,
                    'total', r.total
                ) ORDER BY r.total DESC, r.utm_source, r.utm_medium, r.utm_campaign
            ) FILTER (WHERE r.rn <= 5),
            '[]'::jsonb
        ) AS utm_top
    FROM fallback_utm_rank r
    GROUP BY r.location_level, r.location_key, r.location_name
)
SELECT
    b.location_level,
    b.location_key,
    b.location_name,
    CASE
        WHEN COALESCE(b.sesiones_web_total, 0) > 0 THEN b.sesiones_web_total
        ELSE COALESCE(fm.sesiones_web_fallback, 0)
    END::bigint AS sesiones_web_total,
    CASE
        WHEN af.is_active THEN COALESCE(fwm.sesiones_webchat_total, 0)
        ELSE b.sesiones_webchat_total
    END::bigint AS sesiones_webchat_total,
    CASE
        WHEN af.is_active THEN COALESCE(fwm.sesiones_con_chat_webchat, 0)
        ELSE b.sesiones_con_chat_webchat
    END::bigint AS sesiones_con_chat_webchat,
    CASE
        WHEN af.is_active THEN COALESCE(fwm.sesiones_sin_chat_webchat, 0)
        ELSE b.sesiones_sin_chat_webchat
    END::bigint AS sesiones_sin_chat_webchat,
    CASE
        WHEN af.is_active THEN LEAST(COALESCE(b.conversaciones_whatsapp, 0), COALESCE(fcm.conversaciones_whatsapp, 0))
        ELSE b.conversaciones_whatsapp
    END::bigint AS conversaciones_whatsapp,
    CASE
        WHEN af.is_active THEN LEAST(COALESCE(b.conversaciones_voz, 0), COALESCE(fcm.conversaciones_voz, 0))
        ELSE b.conversaciones_voz
    END::bigint AS conversaciones_voz,
    CASE
        WHEN jsonb_array_length(COALESCE(b.fuentes_top, '[]'::jsonb)) > 0 THEN b.fuentes_top
        ELSE COALESCE(fs.fuentes_top, '[]'::jsonb)
    END AS fuentes_top,
    CASE
        WHEN jsonb_array_length(COALESCE(b.utm_top, '[]'::jsonb)) > 0 THEN b.utm_top
        ELSE COALESCE(fu.utm_top, '[]'::jsonb)
    END AS utm_top,
    (
        CASE
            WHEN COALESCE(b.sesiones_web_total, 0) > 0 THEN b.sesiones_web_total
            ELSE COALESCE(fm.sesiones_web_fallback, 0)
        END
        + CASE
            WHEN af.is_active THEN COALESCE(fwm.sesiones_webchat_total, 0)
            ELSE b.sesiones_webchat_total
          END
    )::bigint AS total_visitas,
    CASE
        WHEN af.is_active THEN COALESCE(fwm.sesiones_con_chat_webchat, 0)
        ELSE b.visitas_con_chat
    END::bigint AS visitas_con_chat,
    CASE
        WHEN af.is_active THEN COALESCE(fwm.sesiones_sin_chat_webchat, 0)
        ELSE b.visitas_sin_chat
    END::bigint AS visitas_sin_chat,
    CASE
        WHEN af.is_active THEN COALESCE(fwm.sesiones_webchat_total, 0)
        ELSE b.webchat_total
    END::bigint AS webchat_total,
    CASE
        WHEN af.is_active THEN COALESCE(fwm.sesiones_con_chat_webchat, 0)
        ELSE b.webchat_con_chat
    END::bigint AS webchat_con_chat,
    CASE
        WHEN af.is_active THEN COALESCE(fwm.sesiones_sin_chat_webchat, 0)
        ELSE b.webchat_sin_chat
    END::bigint AS webchat_sin_chat,
    CASE
        WHEN af.is_active THEN LEAST(COALESCE(b.whatsapp_total, 0), COALESCE(fcm.conversaciones_whatsapp, 0))
        ELSE b.whatsapp_total
    END::bigint AS whatsapp_total,
    CASE
        WHEN af.is_active THEN LEAST(COALESCE(b.voz_total, 0), COALESCE(fcm.conversaciones_voz, 0))
        ELSE b.voz_total
    END::bigint AS voz_total,
    (
        (
            CASE
                WHEN COALESCE(b.sesiones_web_total, 0) > 0 THEN b.sesiones_web_total
                ELSE COALESCE(fm.sesiones_web_fallback, 0)
            END
            + CASE
                WHEN af.is_active THEN COALESCE(fwm.sesiones_webchat_total, 0)
                ELSE b.sesiones_webchat_total
              END
        )
        + CASE
            WHEN af.is_active THEN LEAST(COALESCE(b.conversaciones_whatsapp, 0), COALESCE(fcm.conversaciones_whatsapp, 0))
            ELSE COALESCE(b.conversaciones_whatsapp, 0)
          END
        + CASE
            WHEN af.is_active THEN LEAST(COALESCE(b.conversaciones_voz, 0), COALESCE(fcm.conversaciones_voz, 0))
            ELSE COALESCE(b.conversaciones_voz, 0)
          END
    ) > 0 AS has_data
FROM base b
CROSS JOIN attribution_filter_active af
LEFT JOIN fallback_metrics fm
       ON fm.location_level = b.location_level
      AND fm.location_key = b.location_key
      AND fm.location_name = b.location_name
LEFT JOIN fallback_webchat_metrics fwm
       ON fwm.location_level = b.location_level
      AND fwm.location_key = b.location_key
      AND fwm.location_name = b.location_name
LEFT JOIN fallback_conversation_metrics fcm
       ON fcm.location_level = b.location_level
      AND fcm.location_key = b.location_key
      AND fcm.location_name = b.location_name
LEFT JOIN fallback_source_top fs
       ON fs.location_level = b.location_level
      AND fs.location_key = b.location_key
      AND fs.location_name = b.location_name
LEFT JOIN fallback_utm_top fu
       ON fu.location_level = b.location_level
      AND fu.location_key = b.location_key
      AND fu.location_name = b.location_name
ORDER BY b.location_level, b.location_name;
$_$;

REVOKE ALL ON FUNCTION public.panel_visitantes_geo_resumen_v3(
    text,
    timestamp with time zone,
    timestamp with time zone,
    text,
    text,
    text,
    text,
    text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_geo_resumen_v3(
    text,
    timestamp with time zone,
    timestamp with time zone,
    text,
    text,
    text,
    text,
    text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_geo_resumen_v3(
    text,
    timestamp with time zone,
    timestamp with time zone,
    text,
    text,
    text,
    text,
    text
) TO service_role;
