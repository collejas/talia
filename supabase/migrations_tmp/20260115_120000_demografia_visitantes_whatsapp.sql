BEGIN;

DROP FUNCTION IF EXISTS public.panel_visitantes_geo_resumen_ext(text, timestamptz, timestamptz);

CREATE FUNCTION public.panel_visitantes_geo_resumen_ext(
    p_nivel text DEFAULT 'estado'::text,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    location_level text,
    location_key text,
    location_name text,
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
webchat_visits AS (
    SELECT
        w.session_id,
        w.contacto_id,
        w.ultimo_evento_en,
        w.geo,
        COALESCE(w.cve_ent, NULLIF(w.geo ->> 'cve_ent', '')) AS cve_ent,
        COALESCE(w.nom_ent, NULLIF(w.geo ->> 'nom_ent', '')) AS nom_ent,
        COALESCE(w.cve_mun, NULLIF(w.geo ->> 'cve_mun', '')) AS cve_mun,
        COALESCE(w.nom_mun, NULLIF(w.geo ->> 'nom_mun', '')) AS nom_mun,
        COALESCE(w.cvegeo, NULLIF(w.geo ->> 'cvegeo', '')) AS cvegeo,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.mensajes m
                WHERE m.datos ->> 'session_id' = w.session_id
                  AND m.direccion = 'entrante'
            )
            THEN TRUE
            ELSE FALSE
        END AS tuvo_chat
    FROM public.webchat_visitantes w
    WHERE (p_from IS NULL OR w.ultimo_evento_en >= p_from)
      AND (p_to IS NULL OR w.ultimo_evento_en <= p_to)
),
webchat_geo AS (
    SELECT
        v.*,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'country_code', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((v.geo -> 'client') ->> 'country_code', ''),
            NULLIF((v.geo -> 'client') ->> 'country', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'country_name', ''),
            NULLIF((v.geo -> 'client') ->> 'country_name', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((v.geo -> 'client') ->> 'country', '')
        ) AS raw_country_name
    FROM webchat_visits v
),
webchat_normalized AS (
    SELECT
        g.session_id,
        g.tuvo_chat,
        CASE
            WHEN g.raw_country_code IS NULL OR g.raw_country_code = '' THEN 'UNK'
            WHEN length(g.raw_country_code) = 2 THEN upper(g.raw_country_code)
            WHEN length(g.raw_country_code) = 3 AND g.raw_country_code ~ '^[A-Za-z]{3}$' THEN upper(g.raw_country_code)
            ELSE upper(substr(g.raw_country_code, 1, 2))
        END AS country_code,
        COALESCE(
            g.raw_country_name,
            CASE WHEN upper(COALESCE(g.raw_country_code, '')) = 'MX' THEN 'México' ELSE 'País desconocido' END
        ) AS country_name,
        CASE
            WHEN g.cve_ent IS NOT NULL AND g.cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.cve_ent, '\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        g.nom_ent,
        CASE
            WHEN g.cve_mun IS NOT NULL AND g.cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.cve_mun, '\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        g.nom_mun,
        CASE
            WHEN g.cvegeo IS NOT NULL AND g.cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.cvegeo, '\D', '', 'g'), 5, '0')
            WHEN g.cve_ent IS NOT NULL AND g.cve_mun IS NOT NULL THEN
                LPAD(REGEXP_REPLACE(g.cve_ent, '\D', '', 'g'), 2, '0')
                || LPAD(REGEXP_REPLACE(g.cve_mun, '\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM webchat_geo g
),
webchat_scoped AS (
    SELECT
        nl.nivel,
        n.session_id,
        n.tuvo_chat,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_code, ''), 'UNK')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(n.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_name, ''), 'País desconocido')
            WHEN nl.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(n.nom_mun, ''),
                    COALESCE(NULLIF(n.cvegeo, ''), 'Municipio desconocido')
                )
            ELSE
                COALESCE(
                    NULLIF(n.nom_ent, ''),
                    COALESCE(NULLIF(n.cve_ent, ''), 'Estado desconocido')
                )
        END AS location_name
    FROM webchat_normalized n
    CROSS JOIN normalized_level nl
),
webchat_metrics AS (
    SELECT
        s.nivel AS location_level,
        s.location_key,
        s.location_name,
        COUNT(*)::bigint AS total_visitas,
        COUNT(*) FILTER (WHERE s.tuvo_chat) AS visitas_con_chat,
        COUNT(*) FILTER (WHERE NOT s.tuvo_chat) AS visitas_sin_chat,
        COUNT(*)::bigint AS webchat_total,
        COUNT(*) FILTER (WHERE s.tuvo_chat) AS webchat_con_chat,
        COUNT(*) FILTER (WHERE NOT s.tuvo_chat) AS webchat_sin_chat
    FROM webchat_scoped s
    GROUP BY s.nivel, s.location_key, s.location_name
),
conversation_base AS (
    SELECT
        conv.id,
        lower(COALESCE(conv.canal, '')) AS canal,
        COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) AS activity_at,
        ct.contacto_datos,
        ct.telefono_e164
    FROM public.conversaciones conv
    JOIN public.contactos ct ON ct.id = conv.contacto_id
    WHERE lower(COALESCE(conv.canal, '')) IN ('whatsapp', 'voz')
      AND public.puede_ver_contacto(ct.id)
      AND (p_from IS NULL OR COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) >= p_from)
      AND (p_to IS NULL OR COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) <= p_to)
),
conversation_geo AS (
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
        regexp_replace(COALESCE(cb.telefono_e164, ''), '\D', '', 'g') AS telefono_digits
    FROM conversation_base cb
),
conversation_normalized AS (
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
            WHEN cg.raw_cve_ent IS NOT NULL AND cg.raw_cve_ent <> '' THEN LPAD(REGEXP_REPLACE(cg.raw_cve_ent, '\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        COALESCE(cg.raw_nom_ent, CASE WHEN cg.telefono_digits LIKE '52%' THEN 'Estado desconocido' END) AS nom_ent,
        CASE
            WHEN cg.raw_cve_mun IS NOT NULL AND cg.raw_cve_mun <> '' THEN LPAD(REGEXP_REPLACE(cg.raw_cve_mun, '\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        cg.raw_nom_mun AS nom_mun,
        CASE
            WHEN cg.raw_cvegeo IS NOT NULL AND cg.raw_cvegeo <> '' THEN LPAD(REGEXP_REPLACE(cg.raw_cvegeo, '\D', '', 'g'), 5, '0')
            WHEN cg.raw_cve_ent IS NOT NULL AND cg.raw_cve_mun IS NOT NULL THEN
                LPAD(REGEXP_REPLACE(cg.raw_cve_ent, '\D', '', 'g'), 2, '0')
                || LPAD(REGEXP_REPLACE(cg.raw_cve_mun, '\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM conversation_geo cg
),
conversation_scoped AS (
    SELECT
        nl.nivel,
        n.canal,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_code, ''), 'UNK')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(n.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(n.country_name, ''), 'País desconocido')
            WHEN nl.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(n.nom_mun, ''),
                    COALESCE(NULLIF(n.cvegeo, ''), 'Municipio desconocido')
                )
            ELSE
                COALESCE(
                    NULLIF(n.nom_ent, ''),
                    COALESCE(NULLIF(n.cve_ent, ''), 'Estado desconocido')
                )
        END AS location_name
    FROM conversation_normalized n
    CROSS JOIN normalized_level nl
),
conversation_metrics AS (
    SELECT
        cs.nivel AS location_level,
        cs.location_key,
        cs.location_name,
        COUNT(*) FILTER (WHERE cs.canal = 'whatsapp')::bigint AS whatsapp_total,
        COUNT(*) FILTER (WHERE cs.canal = 'voz')::bigint AS voz_total
    FROM conversation_scoped cs
    GROUP BY cs.nivel, cs.location_key, cs.location_name
),
metrics_union AS (
    SELECT
        wm.location_level,
        wm.location_key,
        wm.location_name,
        wm.total_visitas,
        wm.visitas_con_chat,
        wm.visitas_sin_chat,
        wm.webchat_total,
        wm.webchat_con_chat,
        wm.webchat_sin_chat,
        0::bigint AS whatsapp_total,
        0::bigint AS voz_total
    FROM webchat_metrics wm

    UNION ALL

    SELECT
        cm.location_level,
        cm.location_key,
        cm.location_name,
        0::bigint AS total_visitas,
        0::bigint AS visitas_con_chat,
        0::bigint AS visitas_sin_chat,
        0::bigint AS webchat_total,
        0::bigint AS webchat_con_chat,
        0::bigint AS webchat_sin_chat,
        COALESCE(cm.whatsapp_total, 0)::bigint AS whatsapp_total,
        COALESCE(cm.voz_total, 0)::bigint AS voz_total
    FROM conversation_metrics cm
)
SELECT
    mu.location_level,
    mu.location_key,
    mu.location_name,
    SUM(mu.total_visitas)::bigint AS total_visitas,
    SUM(mu.visitas_con_chat)::bigint AS visitas_con_chat,
    SUM(mu.visitas_sin_chat)::bigint AS visitas_sin_chat,
    SUM(mu.webchat_total)::bigint AS webchat_total,
    SUM(mu.webchat_con_chat)::bigint AS webchat_con_chat,
    SUM(mu.webchat_sin_chat)::bigint AS webchat_sin_chat,
    SUM(mu.whatsapp_total)::bigint AS whatsapp_total,
    SUM(mu.voz_total)::bigint AS voz_total,
    (
        SUM(mu.total_visitas)
        + SUM(mu.whatsapp_total)
        + SUM(mu.voz_total)
    ) > 0 AS has_data
FROM metrics_union mu
GROUP BY mu.location_level, mu.location_key, mu.location_name
ORDER BY mu.location_level, mu.location_name;
$$;

COMMIT;
