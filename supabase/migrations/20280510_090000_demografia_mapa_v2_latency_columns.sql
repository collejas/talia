BEGIN;

-- Índices para acelerar filtros geográficos/temporales usados por panel_visitantes_geo_resumen_v2.
CREATE INDEX IF NOT EXISTS contactos_org_geo_idx
    ON public.contactos (organizacion_id, clave_entidad, clave_municipio, pais);

CREATE INDEX IF NOT EXISTS conversaciones_org_contacto_canal_ultimo_idx
    ON public.conversaciones (organizacion_id, contacto_id, canal, ultimo_mensaje_en DESC);

CREATE INDEX IF NOT EXISTS mensajes_prospeccion_correo_reply_idx
    ON public.mensajes (conversacion_id, creado_en)
    WHERE lower(COALESCE(datos ->> 'action', '')) = 'reply_inbound'
      AND lower(COALESCE(datos ->> 'source', '')) = 'prospeccion'
      AND lower(COALESCE(datos ->> 'channel', '')) = 'correo';

CREATE OR REPLACE FUNCTION public.panel_visitantes_geo_resumen_v2(
    p_nivel text default 'estado'::text,
    p_from timestamp with time zone default null::timestamp with time zone,
    p_to timestamp with time zone default null::timestamp with time zone,
    p_estado text default null::text,
    p_source_class text default null::text,
    p_utm_source text default null::text,
    p_utm_medium text default null::text,
    p_utm_campaign text default null::text,
    p_cid uuid default null::uuid,
    p_tid uuid default null::uuid,
    p_campaign_type text default null::text,
    p_wa_canal_publicitario text default null::text,
    p_wa_campana_publicitaria text default null::text,
    p_wa_regla_id uuid default null::uuid
) returns table(
    location_level text,
    location_key text,
    location_name text,
    sesiones_web_total bigint,
    sesiones_webchat_total bigint,
    sesiones_con_chat_webchat bigint,
    sesiones_sin_chat_webchat bigint,
    conversaciones_whatsapp bigint,
    conversaciones_voz bigint,
    conversaciones_correo bigint,
    fuentes_top jsonb,
    utm_top jsonb,
    wa_atribucion_top jsonb,
    wa_atribucion_total bigint,
    total_visitas bigint,
    visitas_con_chat bigint,
    visitas_sin_chat bigint,
    webchat_total bigint,
    webchat_con_chat bigint,
    webchat_sin_chat bigint,
    whatsapp_total bigint,
    voz_total bigint,
    correo_total bigint,
    has_data boolean
) language sql stable security definer
set search_path to 'public'
as $_$
WITH normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
state_filter AS (
    SELECT CASE
        WHEN p_estado IS NULL OR btrim(p_estado) = '' THEN NULL::text
        ELSE lpad(regexp_replace(btrim(p_estado), '\\D', '', 'g'), 2, '0')
    END AS estado
),
tenant AS (
    SELECT public.usuario_organizacion_id(auth.uid()) AS organizacion_id
),
web_sessions_raw AS (
    SELECT
        w.session_id,
        COALESCE(w.last_seen_at, w.first_seen_at, now()) AS activity_at,
        NULLIF(lower(btrim(COALESCE(w.source_class, ''))), '') AS source_class,
        NULLIF(lower(btrim(COALESCE(w.utm_source, ''))), '') AS utm_source,
        NULLIF(lower(btrim(COALESCE(w.utm_medium, ''))), '') AS utm_medium,
        NULLIF(lower(btrim(COALESCE(w.utm_campaign, ''))), '') AS utm_campaign,
        CASE
            WHEN w.country_code IS NULL OR btrim(w.country_code) = '' THEN 'UNK'
            WHEN length(btrim(w.country_code)) = 2 THEN upper(btrim(w.country_code))
            ELSE upper(substr(btrim(w.country_code), 1, 2))
        END AS country_code,
        COALESCE(NULLIF(btrim(w.country_name), ''), 'País desconocido') AS country_name,
        CASE
            WHEN w.cve_ent IS NULL OR btrim(w.cve_ent) = '' THEN NULL::text
            ELSE lpad(regexp_replace(btrim(w.cve_ent), '\\D', '', 'g'), 2, '0')
        END AS cve_ent,
        COALESCE(NULLIF(btrim(w.nom_ent), ''), 'Estado desconocido') AS nom_ent,
        CASE
            WHEN w.cve_mun IS NULL OR btrim(w.cve_mun) = '' THEN NULL::text
            ELSE lpad(regexp_replace(btrim(w.cve_mun), '\\D', '', 'g'), 3, '0')
        END AS cve_mun,
        COALESCE(NULLIF(btrim(w.nom_mun), ''), 'Municipio desconocido') AS nom_mun,
        CASE
            WHEN w.cvegeo IS NOT NULL AND btrim(w.cvegeo) <> '' THEN lpad(regexp_replace(btrim(w.cvegeo), '\\D', '', 'g'), 5, '0')
            WHEN w.cve_ent IS NOT NULL AND w.cve_mun IS NOT NULL THEN
                lpad(regexp_replace(btrim(w.cve_ent), '\\D', '', 'g'), 2, '0')
                || lpad(regexp_replace(btrim(w.cve_mun), '\\D', '', 'g'), 3, '0')
            ELSE NULL::text
        END AS cvegeo
    FROM public.web_sessions w
    JOIN tenant t ON w.organizacion_id = t.organizacion_id
    LEFT JOIN public.campanas c ON c.id = w.cid AND c.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR COALESCE(w.last_seen_at, w.first_seen_at, now()) >= p_from)
      AND (p_to IS NULL OR COALESCE(w.last_seen_at, w.first_seen_at, now()) <= p_to)
      AND (p_source_class IS NULL OR lower(COALESCE(w.source_class, '')) = lower(p_source_class))
      AND (p_utm_source IS NULL OR lower(COALESCE(w.utm_source, '')) = lower(p_utm_source))
      AND (p_utm_medium IS NULL OR lower(COALESCE(w.utm_medium, '')) = lower(p_utm_medium))
      AND (p_utm_campaign IS NULL OR lower(COALESCE(w.utm_campaign, '')) = lower(p_utm_campaign))
      AND (p_cid IS NULL OR w.cid = p_cid)
      AND (p_tid IS NULL OR w.tid = p_tid)
      AND (
            p_campaign_type IS NULL
            OR lower(COALESCE(c.canal, '')) = lower(p_campaign_type)
          )
      AND (p_wa_canal_publicitario IS NULL AND p_wa_campana_publicitaria IS NULL AND p_wa_regla_id IS NULL)
),
web_sessions_scoped AS (
    SELECT
        nl.nivel,
        r.session_id,
        COALESCE(r.source_class, 'direct') AS source_class,
        r.utm_source,
        r.utm_medium,
        r.utm_campaign,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(r.country_code, ''), 'UNK')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(r.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(r.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN COALESCE(NULLIF(r.country_name, ''), 'País desconocido')
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(r.nom_mun, ''), COALESCE(NULLIF(r.cvegeo, ''), 'Municipio desconocido'))
            ELSE COALESCE(NULLIF(r.nom_ent, ''), COALESCE(NULLIF(r.cve_ent, ''), 'Estado desconocido'))
        END AS location_name,
        r.cve_ent
    FROM web_sessions_raw r
    CROSS JOIN normalized_level nl
),
web_sessions_filtered AS (
    SELECT s.*
    FROM web_sessions_scoped s
    CROSS JOIN normalized_level nl
    CROSS JOIN state_filter sf
    WHERE nl.nivel <> 'municipio' OR sf.estado IS NULL OR s.cve_ent = sf.estado
),
web_sessions_metrics AS (
    SELECT
        s.nivel AS location_level,
        s.location_key,
        s.location_name,
        COUNT(DISTINCT s.session_id)::bigint AS sesiones_web_total
    FROM web_sessions_filtered s
    GROUP BY s.nivel, s.location_key, s.location_name
),
source_rank AS (
    SELECT
        s.nivel AS location_level,
        s.location_key,
        s.location_name,
        s.source_class,
        COUNT(DISTINCT s.session_id)::bigint AS total,
        ROW_NUMBER() OVER (
            PARTITION BY s.nivel, s.location_key, s.location_name
            ORDER BY COUNT(DISTINCT s.session_id) DESC, s.source_class
        ) AS rn
    FROM web_sessions_filtered s
    GROUP BY s.nivel, s.location_key, s.location_name, s.source_class
),
source_top AS (
    SELECT
        r.location_level,
        r.location_key,
        r.location_name,
        COALESCE(
            jsonb_agg(
                jsonb_build_object('source', r.source_class, 'total', r.total)
                ORDER BY r.total DESC, r.source_class
            ),
            '[]'::jsonb
        ) AS fuentes_top
    FROM source_rank r
    GROUP BY r.location_level, r.location_key, r.location_name
),
utm_rank AS (
    SELECT
        s.nivel AS location_level,
        s.location_key,
        s.location_name,
        COALESCE(s.utm_source, '(none)') AS utm_source,
        COALESCE(s.utm_medium, '(none)') AS utm_medium,
        COALESCE(s.utm_campaign, '(none)') AS utm_campaign,
        COUNT(DISTINCT s.session_id)::bigint AS total,
        ROW_NUMBER() OVER (
            PARTITION BY s.nivel, s.location_key, s.location_name
            ORDER BY COUNT(DISTINCT s.session_id) DESC,
                     COALESCE(s.utm_source, '(none)'),
                     COALESCE(s.utm_medium, '(none)'),
                     COALESCE(s.utm_campaign, '(none)')
        ) AS rn
    FROM web_sessions_filtered s
    GROUP BY s.nivel, s.location_key, s.location_name, COALESCE(s.utm_source, '(none)'), COALESCE(s.utm_medium, '(none)'), COALESCE(s.utm_campaign, '(none)')
),
utm_top AS (
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
                )
                ORDER BY r.total DESC, r.utm_source, r.utm_medium, r.utm_campaign
            ),
            '[]'::jsonb
        ) AS utm_top
    FROM utm_rank r
    GROUP BY r.location_level, r.location_key, r.location_name
),
webchat_visits AS (
    SELECT
        w.session_id,
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
    JOIN tenant t ON w.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR w.ultimo_evento_en >= p_from)
      AND (p_to IS NULL OR w.ultimo_evento_en <= p_to)
      AND (p_wa_canal_publicitario IS NULL AND p_wa_campana_publicitaria IS NULL AND p_wa_regla_id IS NULL)
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
            WHEN g.cve_ent IS NOT NULL AND g.cve_ent <> '' THEN lpad(regexp_replace(g.cve_ent, '\\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        g.nom_ent,
        CASE
            WHEN g.cve_mun IS NOT NULL AND g.cve_mun <> '' THEN lpad(regexp_replace(g.cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        g.nom_mun,
        CASE
            WHEN g.cvegeo IS NOT NULL AND g.cvegeo <> '' THEN lpad(regexp_replace(g.cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN g.cve_ent IS NOT NULL AND g.cve_mun IS NOT NULL THEN
                lpad(regexp_replace(g.cve_ent, '\\D', '', 'g'), 2, '0')
                || lpad(regexp_replace(g.cve_mun, '\\D', '', 'g'), 3, '0')
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
            WHEN nl.nivel = 'municipio' THEN COALESCE(NULLIF(n.nom_mun, ''), COALESCE(NULLIF(n.cvegeo, ''), 'Municipio desconocido'))
            ELSE COALESCE(NULLIF(n.nom_ent, ''), COALESCE(NULLIF(n.cve_ent, ''), 'Estado desconocido'))
        END AS location_name,
        n.cve_ent
    FROM webchat_normalized n
    CROSS JOIN normalized_level nl
),
webchat_filtered AS (
    SELECT s.*
    FROM webchat_scoped s
    CROSS JOIN normalized_level nl
    CROSS JOIN state_filter sf
    WHERE nl.nivel <> 'municipio' OR sf.estado IS NULL OR s.cve_ent = sf.estado
),
webchat_metrics AS (
    SELECT
        s.nivel AS location_level,
        s.location_key,
        s.location_name,
        COUNT(DISTINCT s.session_id)::bigint AS sesiones_webchat_total,
        COUNT(DISTINCT s.session_id) FILTER (WHERE s.tuvo_chat)::bigint AS sesiones_con_chat_webchat,
        COUNT(DISTINCT s.session_id) FILTER (WHERE NOT s.tuvo_chat)::bigint AS sesiones_sin_chat_webchat
    FROM webchat_filtered s
    GROUP BY s.nivel, s.location_key, s.location_name
),
wa_atribucion_raw AS (
    SELECT
        e.conversacion_id,
        e.organizacion_id,
        e.regla_id,
        e.canal_publicitario,
        e.campana_publicitaria,
        e.creado_en
    FROM public.prospeccion_whatsapp_atribucion_eventos e
    JOIN tenant t ON e.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR e.creado_en >= p_from)
      AND (p_to IS NULL OR e.creado_en <= p_to)
      AND (p_source_class IS NULL OR lower(p_source_class) = 'campaign')
      AND (p_cid IS NULL AND p_tid IS NULL)
      AND (
            p_campaign_type IS NULL
            OR lower(p_campaign_type) = 'whatsapp'
          )
      AND (
            p_wa_canal_publicitario IS NULL
            OR lower(COALESCE(e.canal_publicitario, '')) = lower(p_wa_canal_publicitario)
          )
      AND (
            p_wa_campana_publicitaria IS NULL
            OR lower(COALESCE(e.campana_publicitaria, '')) = lower(p_wa_campana_publicitaria)
          )
      AND (p_wa_regla_id IS NULL OR e.regla_id = p_wa_regla_id)
),
wa_atribucion_latest AS (
    SELECT DISTINCT ON (r.conversacion_id)
        r.conversacion_id,
        r.creado_en
    FROM wa_atribucion_raw r
    ORDER BY r.conversacion_id, r.creado_en DESC
),
conversation_base AS (
    SELECT
        conv.id,
        lower(COALESCE(conv.canal, '')) AS canal,
        COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) AS activity_at,
        ct.pais,
        ct.clave_entidad,
        ct.entidad,
        ct.clave_municipio,
        ct.municipio,
        ct.telefono_e164,
        CASE
            WHEN lower(COALESCE(conv.canal, '')) = 'whatsapp' AND wal.conversacion_id IS NOT NULL THEN 'campaign'
            ELSE 'direct'
        END AS source_class
    FROM public.conversaciones conv
    JOIN tenant t ON conv.organizacion_id = t.organizacion_id
    JOIN public.contactos ct ON ct.id = conv.contacto_id AND ct.organizacion_id = t.organizacion_id
    LEFT JOIN wa_atribucion_latest wal ON wal.conversacion_id = conv.id
    WHERE lower(COALESCE(conv.canal, '')) IN ('whatsapp', 'voz')
      AND public.puede_ver_contacto(ct.id)
      AND (
            p_campaign_type IS NULL
            OR (lower(p_campaign_type) = 'whatsapp' AND lower(COALESCE(conv.canal, '')) = 'whatsapp')
            OR (lower(p_campaign_type) IN ('voz', 'llamada') AND lower(COALESCE(conv.canal, '')) = 'voz')
          )
      AND (p_cid IS NULL AND p_tid IS NULL)
      AND (p_from IS NULL OR COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) >= p_from)
      AND (p_to IS NULL OR COALESCE(conv.ultimo_mensaje_en, conv.iniciada_en, now()) <= p_to)
),
conversation_geo AS (
    SELECT
        cb.*,
        NULLIF(upper(btrim(COALESCE(cb.pais, ''))), '') AS raw_country_code,
        NULLIF(btrim(COALESCE(cb.pais, '')), '') AS raw_country_name,
        NULLIF(btrim(COALESCE(cb.clave_entidad, '')), '') AS raw_cve_ent,
        NULLIF(btrim(COALESCE(cb.entidad, '')), '') AS raw_nom_ent,
        NULLIF(btrim(COALESCE(cb.clave_municipio, '')), '') AS raw_cve_mun,
        NULLIF(btrim(COALESCE(cb.municipio, '')), '') AS raw_nom_mun,
        CASE
            WHEN NULLIF(btrim(COALESCE(cb.clave_entidad, '')), '') IS NOT NULL
             AND NULLIF(btrim(COALESCE(cb.clave_municipio, '')), '') IS NOT NULL
            THEN lpad(regexp_replace(btrim(cb.clave_entidad), '\\D', '', 'g'), 2, '0')
                 || lpad(regexp_replace(btrim(cb.clave_municipio), '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS raw_cvegeo,
        regexp_replace(COALESCE(cb.telefono_e164, ''), '\\D', '', 'g') AS telefono_digits
    FROM conversation_base cb
),
conversation_normalized AS (
    SELECT
        cg.id,
        cg.canal,
        cg.source_class,
        CASE
            WHEN cg.raw_country_code IS NOT NULL AND cg.raw_country_code <> '' THEN
                CASE
                    WHEN cg.raw_country_code IN ('MX','MEX') OR lower(cg.raw_country_name) IN ('méxico','mexico') THEN 'MX'
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
    FROM conversation_geo cg
),
conversation_scoped AS (
    SELECT
        nl.nivel,
        n.id,
        n.canal,
        n.source_class,
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
    FROM conversation_normalized n
    CROSS JOIN normalized_level nl
),
conversation_filtered AS (
    SELECT s.*
    FROM conversation_scoped s
    CROSS JOIN normalized_level nl
    CROSS JOIN state_filter sf
    WHERE (nl.nivel <> 'municipio' OR sf.estado IS NULL OR s.cve_ent = sf.estado)
      AND (p_source_class IS NULL OR lower(COALESCE(s.source_class, '')) = lower(p_source_class))
      AND (
            (p_wa_canal_publicitario IS NULL AND p_wa_campana_publicitaria IS NULL AND p_wa_regla_id IS NULL)
            OR (
                s.canal = 'whatsapp'
                AND EXISTS (
                    SELECT 1
                    FROM wa_atribucion_raw r
                    WHERE r.conversacion_id = s.id
                )
            )
          )
),
conversation_metrics AS (
    SELECT
        cs.nivel AS location_level,
        cs.location_key,
        cs.location_name,
        COUNT(*) FILTER (WHERE cs.canal = 'whatsapp')::bigint AS conversaciones_whatsapp,
        COUNT(*) FILTER (WHERE cs.canal = 'voz')::bigint AS conversaciones_voz
    FROM conversation_filtered cs
    GROUP BY cs.nivel, cs.location_key, cs.location_name
),
email_inbound_raw AS (
    SELECT
        m.conversacion_id,
        m.creado_en,
        m.datos,
        conv.contacto_id,
        ct.pais,
        ct.clave_entidad,
        ct.entidad,
        ct.clave_municipio,
        ct.municipio,
        ct.telefono_e164,
        CASE
            WHEN (m.datos ->> 'campana_id') ~* '^[0-9a-f-]{36}$' THEN (m.datos ->> 'campana_id')::uuid
            ELSE NULL
        END AS campana_id,
        CASE
            WHEN (m.datos ->> 'template_id') ~* '^[0-9a-f-]{36}$' THEN (m.datos ->> 'template_id')::uuid
            ELSE NULL
        END AS template_id
    FROM public.mensajes m
    JOIN public.conversaciones conv ON conv.id = m.conversacion_id
    JOIN tenant t ON conv.organizacion_id = t.organizacion_id
    JOIN public.contactos ct ON ct.id = conv.contacto_id AND ct.organizacion_id = t.organizacion_id
    LEFT JOIN public.campanas c ON c.id = (
        CASE
            WHEN (m.datos ->> 'campana_id') ~* '^[0-9a-f-]{36}$' THEN (m.datos ->> 'campana_id')::uuid
            ELSE NULL
        END
    ) AND c.organizacion_id = t.organizacion_id
    WHERE (p_from IS NULL OR m.creado_en >= p_from)
      AND (p_to IS NULL OR m.creado_en <= p_to)
      AND lower(COALESCE(m.datos ->> 'action', '')) = 'reply_inbound'
      AND lower(COALESCE(m.datos ->> 'source', '')) = 'prospeccion'
      AND lower(COALESCE(m.datos ->> 'channel', '')) = 'correo'
      AND public.puede_ver_contacto(ct.id)
      AND (p_cid IS NULL OR (
            (m.datos ->> 'campana_id') ~* '^[0-9a-f-]{36}$'
            AND (m.datos ->> 'campana_id')::uuid = p_cid
          ))
      AND (p_tid IS NULL OR (
            (m.datos ->> 'template_id') ~* '^[0-9a-f-]{36}$'
            AND (m.datos ->> 'template_id')::uuid = p_tid
          ))
      AND (
            p_campaign_type IS NULL
            OR lower(COALESCE(c.canal, '')) = lower(p_campaign_type)
          )
      AND (p_wa_canal_publicitario IS NULL AND p_wa_campana_publicitaria IS NULL AND p_wa_regla_id IS NULL)
),
email_geo AS (
    SELECT
        e.*,
        NULLIF(upper(btrim(COALESCE(e.pais, ''))), '') AS raw_country_code,
        NULLIF(btrim(COALESCE(e.pais, '')), '') AS raw_country_name,
        NULLIF(btrim(COALESCE(e.clave_entidad, '')), '') AS raw_cve_ent,
        NULLIF(btrim(COALESCE(e.entidad, '')), '') AS raw_nom_ent,
        NULLIF(btrim(COALESCE(e.clave_municipio, '')), '') AS raw_cve_mun,
        NULLIF(btrim(COALESCE(e.municipio, '')), '') AS raw_nom_mun,
        CASE
            WHEN NULLIF(btrim(COALESCE(e.clave_entidad, '')), '') IS NOT NULL
             AND NULLIF(btrim(COALESCE(e.clave_municipio, '')), '') IS NOT NULL
            THEN lpad(regexp_replace(btrim(e.clave_entidad), '\\D', '', 'g'), 2, '0')
                 || lpad(regexp_replace(btrim(e.clave_municipio), '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS raw_cvegeo,
        regexp_replace(COALESCE(e.telefono_e164, ''), '\\D', '', 'g') AS telefono_digits
    FROM email_inbound_raw e
),
email_normalized AS (
    SELECT
        eg.conversacion_id,
        CASE
            WHEN eg.raw_country_code IS NOT NULL AND eg.raw_country_code <> '' THEN
                CASE
                    WHEN eg.raw_country_code IN ('MX','MEX') OR lower(eg.raw_country_name) IN ('méxico','mexico') THEN 'MX'
                    WHEN length(eg.raw_country_code) = 2 THEN upper(eg.raw_country_code)
                    WHEN length(eg.raw_country_code) = 3 AND eg.raw_country_code ~ '^[A-Za-z]{3}$'
                        THEN upper(eg.raw_country_code)
                    ELSE upper(substr(eg.raw_country_code, 1, 2))
                END
            WHEN eg.telefono_digits LIKE '52%' THEN 'MX'
            ELSE 'UNK'
        END AS country_code,
        CASE
            WHEN eg.raw_country_name IS NOT NULL AND eg.raw_country_name <> '' THEN eg.raw_country_name
            WHEN eg.telefono_digits LIKE '52%' THEN 'México'
            ELSE 'País desconocido'
        END AS country_name,
        CASE
            WHEN eg.raw_cve_ent IS NOT NULL AND eg.raw_cve_ent <> '' THEN lpad(regexp_replace(eg.raw_cve_ent, '\\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        COALESCE(eg.raw_nom_ent, CASE WHEN eg.telefono_digits LIKE '52%' THEN 'Estado desconocido' END) AS nom_ent,
        CASE
            WHEN eg.raw_cve_mun IS NOT NULL AND eg.raw_cve_mun <> '' THEN lpad(regexp_replace(eg.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        eg.raw_nom_mun AS nom_mun,
        CASE
            WHEN eg.raw_cvegeo IS NOT NULL AND eg.raw_cvegeo <> '' THEN lpad(regexp_replace(eg.raw_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN eg.raw_cve_ent IS NOT NULL AND eg.raw_cve_mun IS NOT NULL THEN
                lpad(regexp_replace(eg.raw_cve_ent, '\\D', '', 'g'), 2, '0')
                || lpad(regexp_replace(eg.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM email_geo eg
),
email_scoped AS (
    SELECT
        nl.nivel,
        n.conversacion_id,
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
    FROM email_normalized n
    CROSS JOIN normalized_level nl
),
email_filtered AS (
    SELECT s.*
    FROM email_scoped s
    CROSS JOIN normalized_level nl
    CROSS JOIN state_filter sf
    WHERE (nl.nivel <> 'municipio' OR sf.estado IS NULL OR s.cve_ent = sf.estado)
      AND (
            p_campaign_type IS NULL
            OR lower(p_campaign_type) = 'correo'
          )
),
email_metrics AS (
    SELECT
        e.nivel AS location_level,
        e.location_key,
        e.location_name,
        COUNT(DISTINCT e.conversacion_id)::bigint AS conversaciones_correo
    FROM email_filtered e
    GROUP BY e.nivel, e.location_key, e.location_name
),
wa_atribucion_scoped AS (
    SELECT
        cs.nivel AS location_level,
        cs.location_key,
        cs.location_name,
        COALESCE(NULLIF(lower(btrim(COALESCE(r.canal_publicitario, ''))), ''), 'sin_canal') AS canal_publicitario,
        COALESCE(NULLIF(lower(btrim(COALESCE(r.campana_publicitaria, ''))), ''), 'sin_campana') AS campana_publicitaria
    FROM wa_atribucion_raw r
    JOIN conversation_scoped cs ON cs.id = r.conversacion_id
    UNION ALL
    SELECT
        nl.nivel AS location_level,
        'UNK'::text AS location_key,
        CASE
            WHEN nl.nivel = 'pais' THEN 'País desconocido'
            WHEN nl.nivel = 'municipio' THEN 'Municipio desconocido'
            ELSE 'Estado desconocido'
        END AS location_name,
        COALESCE(NULLIF(lower(btrim(COALESCE(r.canal_publicitario, ''))), ''), 'sin_canal') AS canal_publicitario,
        COALESCE(NULLIF(lower(btrim(COALESCE(r.campana_publicitaria, ''))), ''), 'sin_campana') AS campana_publicitaria
    FROM wa_atribucion_raw r
    CROSS JOIN normalized_level nl
    WHERE NOT EXISTS (
        SELECT 1
        FROM conversation_scoped cs
        WHERE cs.id = r.conversacion_id
    )
),
wa_atribucion_rank AS (
    SELECT
        s.location_level,
        s.location_key,
        s.location_name,
        s.canal_publicitario,
        s.campana_publicitaria,
        COUNT(*)::bigint AS total,
        ROW_NUMBER() OVER (
            PARTITION BY s.location_level, s.location_key, s.location_name
            ORDER BY COUNT(*) DESC, s.canal_publicitario, s.campana_publicitaria
        ) AS rn
    FROM wa_atribucion_scoped s
    GROUP BY s.location_level, s.location_key, s.location_name, s.canal_publicitario, s.campana_publicitaria
),
wa_atribucion_top AS (
    SELECT
        r.location_level,
        r.location_key,
        r.location_name,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'canal_publicitario', r.canal_publicitario,
                    'campana_publicitaria', r.campana_publicitaria,
                    'total', r.total
                )
                ORDER BY r.total DESC, r.canal_publicitario, r.campana_publicitaria
            ),
            '[]'::jsonb
        ) AS wa_atribucion_top
    FROM wa_atribucion_rank r
    GROUP BY r.location_level, r.location_key, r.location_name
),
wa_atribucion_metrics AS (
    SELECT
        s.location_level,
        s.location_key,
        s.location_name,
        COUNT(*)::bigint AS wa_atribucion_total
    FROM wa_atribucion_scoped s
    GROUP BY s.location_level, s.location_key, s.location_name
),
all_locations AS (
    SELECT location_level, location_key, location_name FROM web_sessions_metrics
    UNION
    SELECT location_level, location_key, location_name FROM webchat_metrics
    UNION
    SELECT location_level, location_key, location_name FROM conversation_metrics
    UNION
    SELECT location_level, location_key, location_name FROM email_metrics
    UNION
    SELECT location_level, location_key, location_name FROM wa_atribucion_top
    UNION
    SELECT location_level, location_key, location_name FROM wa_atribucion_metrics
)
SELECT
    l.location_level,
    l.location_key,
    l.location_name,
    COALESCE(ws.sesiones_web_total, 0)::bigint AS sesiones_web_total,
    COALESCE(wc.sesiones_webchat_total, 0)::bigint AS sesiones_webchat_total,
    COALESCE(wc.sesiones_con_chat_webchat, 0)::bigint AS sesiones_con_chat_webchat,
    COALESCE(wc.sesiones_sin_chat_webchat, 0)::bigint AS sesiones_sin_chat_webchat,
    COALESCE(cv.conversaciones_whatsapp, 0)::bigint AS conversaciones_whatsapp,
    COALESCE(cv.conversaciones_voz, 0)::bigint AS conversaciones_voz,
    COALESCE(em.conversaciones_correo, 0)::bigint AS conversaciones_correo,
    COALESCE(st.fuentes_top, '[]'::jsonb) AS fuentes_top,
    COALESCE(ut.utm_top, '[]'::jsonb) AS utm_top,
    COALESCE(wat.wa_atribucion_top, '[]'::jsonb) AS wa_atribucion_top,
    COALESCE(wam.wa_atribucion_total, 0)::bigint AS wa_atribucion_total,
    (COALESCE(ws.sesiones_web_total, 0) + COALESCE(wc.sesiones_webchat_total, 0))::bigint AS total_visitas,
    COALESCE(wc.sesiones_con_chat_webchat, 0)::bigint AS visitas_con_chat,
    COALESCE(wc.sesiones_sin_chat_webchat, 0)::bigint AS visitas_sin_chat,
    COALESCE(wc.sesiones_webchat_total, 0)::bigint AS webchat_total,
    COALESCE(wc.sesiones_con_chat_webchat, 0)::bigint AS webchat_con_chat,
    COALESCE(wc.sesiones_sin_chat_webchat, 0)::bigint AS webchat_sin_chat,
    COALESCE(cv.conversaciones_whatsapp, 0)::bigint AS whatsapp_total,
    COALESCE(cv.conversaciones_voz, 0)::bigint AS voz_total,
    COALESCE(em.conversaciones_correo, 0)::bigint AS correo_total,
    (
        COALESCE(ws.sesiones_web_total, 0)
        + COALESCE(wc.sesiones_webchat_total, 0)
        + COALESCE(cv.conversaciones_whatsapp, 0)
        + COALESCE(cv.conversaciones_voz, 0)
        + COALESCE(em.conversaciones_correo, 0)
    ) > 0 AS has_data
FROM all_locations l
LEFT JOIN web_sessions_metrics ws
       ON ws.location_level = l.location_level
      AND ws.location_key = l.location_key
      AND ws.location_name = l.location_name
LEFT JOIN webchat_metrics wc
       ON wc.location_level = l.location_level
      AND wc.location_key = l.location_key
      AND wc.location_name = l.location_name
LEFT JOIN conversation_metrics cv
       ON cv.location_level = l.location_level
      AND cv.location_key = l.location_key
      AND cv.location_name = l.location_name
LEFT JOIN email_metrics em
       ON em.location_level = l.location_level
      AND em.location_key = l.location_key
      AND em.location_name = l.location_name
LEFT JOIN source_top st
       ON st.location_level = l.location_level
      AND st.location_key = l.location_key
      AND st.location_name = l.location_name
LEFT JOIN utm_top ut
       ON ut.location_level = l.location_level
      AND ut.location_key = l.location_key
      AND ut.location_name = l.location_name
LEFT JOIN wa_atribucion_top wat
       ON wat.location_level = l.location_level
      AND wat.location_key = l.location_key
      AND wat.location_name = l.location_name
LEFT JOIN wa_atribucion_metrics wam
       ON wam.location_level = l.location_level
      AND wam.location_key = l.location_key
      AND wam.location_name = l.location_name
ORDER BY l.location_level, l.location_name;
$_$;

COMMIT;
