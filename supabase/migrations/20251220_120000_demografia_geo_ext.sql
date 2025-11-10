BEGIN;

-- Nueva función con métricas detalladas por canal/etapa y filtros dinámicos
DROP FUNCTION IF EXISTS public.panel_leads_geo_base_ext(text, timestamp with time zone, timestamp with time zone);
CREATE FUNCTION public.panel_leads_geo_base_ext(
    p_canales text DEFAULT NULL::text,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    lead_id uuid,
    contacto_id uuid,
    canal text,
    etapa_id uuid,
    etapa_codigo text,
    etapa_nombre text,
    etapa_categoria public.lead_categoria,
    pais_codigo text,
    pais_nombre text,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH params AS (
    SELECT CASE
        WHEN p_canales IS NULL OR btrim(p_canales) = '' THEN NULL
        ELSE ARRAY(
            SELECT lower(btrim(value))
            FROM regexp_split_to_table(p_canales, ',') AS value
            WHERE btrim(value) <> ''
        )::text[]
    END AS canales
),
base AS (
    SELECT
        lt.id AS lead_id,
        lt.contacto_id,
        lower(COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, ''))) AS canal,
        lt.etapa_id,
        le.codigo AS etapa_codigo,
        le.nombre AS etapa_nombre,
        le.categoria AS etapa_categoria,
        ct.contacto_datos,
        ct.telefono_e164
    FROM public.lead_tarjetas lt
    JOIN public.lead_etapas le ON le.id = lt.etapa_id
    JOIN public.contactos ct ON ct.id = lt.contacto_id
    LEFT JOIN public.conversaciones conv ON conv.id = lt.conversacion_id
    WHERE public.puede_ver_lead(lt.id)
      AND (p_from IS NULL OR lt.creado_en >= p_from)
      AND (p_to IS NULL OR lt.creado_en <= p_to)
      AND (
        (SELECT canales FROM params) IS NULL
        OR lower(COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, ''))) = ANY (COALESCE((SELECT canales FROM params), ARRAY[]::text[]))
      )
),
geo AS (
    SELECT
        b.*,
        COALESCE(
            NULLIF(b.contacto_datos #>> '{ubicacion,country_code}', ''),
            NULLIF(b.contacto_datos #>> '{country_code}', ''),
            NULLIF(b.contacto_datos #>> '{ubicacion,pais_codigo}', ''),
            NULLIF(b.contacto_datos #>> '{pais_codigo}', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(b.contacto_datos #>> '{ubicacion,country_name}', ''),
            NULLIF(b.contacto_datos #>> '{country_name}', ''),
            NULLIF(b.contacto_datos #>> '{ubicacion,pais_nombre}', ''),
            NULLIF(b.contacto_datos #>> '{pais_nombre}', ''),
            NULLIF(b.contacto_datos #>> '{ubicacion,pais}', ''),
            NULLIF(b.contacto_datos #>> '{pais}', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(b.contacto_datos #>> '{ubicacion,cve_ent}', ''),
            NULLIF(b.contacto_datos #>> '{cve_ent}', '')
        ) AS raw_cve_ent,
        COALESCE(
            NULLIF(b.contacto_datos #>> '{ubicacion,nom_ent}', ''),
            NULLIF(b.contacto_datos #>> '{nom_ent}', '')
        ) AS raw_nom_ent,
        COALESCE(
            NULLIF(b.contacto_datos #>> '{ubicacion,cve_mun}', ''),
            NULLIF(b.contacto_datos #>> '{cve_mun}', '')
        ) AS raw_cve_mun,
        COALESCE(
            NULLIF(b.contacto_datos #>> '{ubicacion,nom_mun}', ''),
            NULLIF(b.contacto_datos #>> '{nom_mun}', '')
        ) AS raw_nom_mun,
        COALESCE(
            NULLIF(b.contacto_datos #>> '{ubicacion,cvegeo}', ''),
            NULLIF(b.contacto_datos #>> '{cvegeo}', '')
        ) AS raw_cvegeo,
        COALESCE(
            NULLIF(b.contacto_datos #>> '{ubicacion,session_id}', ''),
            NULLIF(b.contacto_datos #>> '{session_id}', ''),
            NULLIF(b.contacto_datos #>> '{trazabilidad,session_id}', '')
        ) AS raw_session_id,
        b.telefono_e164
    FROM base b
),
session_geo AS (
    SELECT
        g.*,
        w.cve_ent AS visitor_cve_ent,
        w.nom_ent AS visitor_nom_ent,
        w.cve_mun AS visitor_cve_mun,
        w.nom_mun AS visitor_nom_mun,
        w.cvegeo AS visitor_cvegeo,
        (w.geo -> 'ip_lookup' ->> 'country_code')::text AS visitor_country_code,
        (w.geo -> 'ip_lookup' ->> 'country_name')::text AS visitor_country_name
    FROM geo g
    LEFT JOIN public.webchat_visitantes w
        ON g.raw_session_id IS NOT NULL
       AND w.session_id = g.raw_session_id
),
normalized AS (
    SELECT
        g.lead_id,
        g.contacto_id,
        COALESCE(NULLIF(g.canal, ''), 'desconocido') AS canal,
        g.etapa_id,
        g.etapa_codigo,
        g.etapa_nombre,
        g.etapa_categoria,
        CASE
            WHEN COALESCE(g.raw_country_code, g.visitor_country_code) IS NULL
                 OR COALESCE(g.raw_country_code, g.visitor_country_code) = '' THEN
                CASE
                    WHEN lower(COALESCE(g.canal, '')) IN ('whatsapp', 'voz') THEN 'MX'
                    ELSE NULL
                END
            WHEN length(COALESCE(g.raw_country_code, g.visitor_country_code)) = 2 THEN upper(COALESCE(g.raw_country_code, g.visitor_country_code))
            WHEN length(COALESCE(g.raw_country_code, g.visitor_country_code)) = 3
                 AND COALESCE(g.raw_country_code, g.visitor_country_code) ~ '^[A-Za-z]{3}$'
                THEN upper(COALESCE(g.raw_country_code, g.visitor_country_code))
            ELSE upper(substr(COALESCE(g.raw_country_code, g.visitor_country_code), 1, 2))
        END AS pais_codigo,
        CASE
            WHEN g.raw_country_name IS NOT NULL AND g.raw_country_name <> '' THEN g.raw_country_name
            WHEN g.visitor_country_name IS NOT NULL AND g.visitor_country_name <> '' THEN g.visitor_country_name
            WHEN COALESCE(g.raw_country_code, g.visitor_country_code) IS NULL
                 AND lower(COALESCE(g.canal, '')) IN ('whatsapp', 'voz') THEN 'México'
            WHEN COALESCE(g.raw_country_code, g.visitor_country_code) IS NOT NULL
                 AND upper(COALESCE(g.raw_country_code, g.visitor_country_code)) = 'MX' THEN 'México'
            ELSE g.raw_country_name
        END AS pais_nombre,
        CASE
            WHEN g.raw_cve_ent IS NOT NULL AND g.raw_cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
            WHEN g.visitor_cve_ent IS NOT NULL AND g.visitor_cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.visitor_cve_ent, '\\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        COALESCE(g.raw_nom_ent, g.visitor_nom_ent) AS nom_ent,
        CASE
            WHEN g.raw_cve_mun IS NOT NULL AND g.raw_cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            WHEN g.visitor_cve_mun IS NOT NULL AND g.visitor_cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.visitor_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        COALESCE(g.raw_nom_mun, g.visitor_nom_mun) AS nom_mun,
        CASE
            WHEN g.raw_cvegeo IS NOT NULL AND g.raw_cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN g.visitor_cvegeo IS NOT NULL AND g.visitor_cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.visitor_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN (g.raw_cve_ent IS NOT NULL AND g.raw_cve_mun IS NOT NULL)
                THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
                     || LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            WHEN (g.visitor_cve_ent IS NOT NULL AND g.visitor_cve_mun IS NOT NULL)
                THEN LPAD(REGEXP_REPLACE(g.visitor_cve_ent, '\\D', '', 'g'), 2, '0')
                     || LPAD(REGEXP_REPLACE(g.visitor_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM session_geo g
)
SELECT
    n.lead_id,
    n.contacto_id,
    n.canal,
    n.etapa_id,
    n.etapa_codigo,
    n.etapa_nombre,
    n.etapa_categoria,
    n.pais_codigo,
    n.pais_nombre,
    n.cve_ent,
    n.nom_ent,
    n.cve_mun,
    n.nom_mun,
    n.cvegeo
FROM normalized n;
$$;

DROP FUNCTION IF EXISTS public.panel_leads_geo_resumen_ext(text, text, text, timestamp with time zone, timestamp with time zone);
CREATE FUNCTION public.panel_leads_geo_resumen_ext(
    p_nivel text DEFAULT 'estado'::text,
    p_canales text DEFAULT NULL::text,
    p_etapas text DEFAULT NULL::text,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    location_level text,
    location_key text,
    location_name text,
    canal text,
    etapa_codigo text,
    etapa_categoria public.lead_categoria,
    etapa_orden smallint,
    captado_orden smallint,
    total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
stage_values AS (
    SELECT lower(btrim(value)) AS value
    FROM regexp_split_to_table(COALESCE(p_etapas, ''), ',') AS value
),
stage_param AS (
    SELECT
        CASE
            WHEN EXISTS (
                SELECT 1 FROM stage_values sv
                WHERE sv.value IS NOT NULL
                  AND sv.value <> ''
                  AND sv.value <> 'captado_plus'
            )
            THEN ARRAY(
                SELECT sv.value
                FROM stage_values sv
                WHERE sv.value IS NOT NULL
                  AND sv.value <> ''
                  AND sv.value <> 'captado_plus'
            )::text[]
            ELSE NULL::text[]
        END AS etapas,
        COALESCE(
            (SELECT BOOL_OR(sv.value = 'captado_plus') FROM stage_values sv),
            FALSE
        ) AS include_captado_plus
),
stage_meta AS (
    SELECT lower(codigo) AS codigo, categoria, orden
    FROM public.lead_etapas
),
stage_bounds AS (
    SELECT
        MIN(sm.orden) FILTER (WHERE sm.codigo = 'captado') AS captado_orden
    FROM stage_meta sm
),
base AS (
    SELECT
        n.nivel,
        COALESCE(NULLIF(g.canal, ''), 'desconocido') AS canal,
        lower(COALESCE(g.etapa_codigo, '')) AS etapa_codigo,
        COALESCE(sm.categoria, g.etapa_categoria) AS etapa_categoria,
        COALESCE(sm.orden, 0) AS etapa_orden,
        CASE
            WHEN n.nivel = 'pais' THEN COALESCE(NULLIF(g.pais_codigo, ''), 'UNK')
            WHEN n.nivel = 'municipio' THEN COALESCE(NULLIF(g.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(g.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN n.nivel = 'pais' THEN
                COALESCE(
                    NULLIF(g.pais_nombre, ''),
                    COALESCE(NULLIF(g.pais_codigo, ''), 'País desconocido')
                )
            WHEN n.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(g.nom_mun, ''),
                    COALESCE(NULLIF(g.cvegeo, ''), 'Municipio desconocido')
                )
            ELSE
                COALESCE(
                    NULLIF(g.nom_ent, ''),
                    COALESCE(NULLIF(g.cve_ent, ''), 'Estado desconocido')
                )
        END AS location_name
    FROM normalized_level n
    JOIN public.panel_leads_geo_base_ext(p_canales, p_from, p_to) g ON TRUE
    LEFT JOIN stage_meta sm
        ON lower(COALESCE(g.etapa_codigo, '')) = sm.codigo
),
filtered AS (
    SELECT
        b.*,
        COALESCE(sb.captado_orden, 1) AS captado_orden
    FROM base b
    CROSS JOIN stage_param sp
    CROSS JOIN stage_bounds sb
    WHERE
        (
            ((sp.etapas IS NULL OR array_length(sp.etapas, 1) = 0) AND NOT sp.include_captado_plus)
            OR (
                sp.etapas IS NOT NULL
                AND array_length(sp.etapas, 1) > 0
                AND b.etapa_codigo = ANY (sp.etapas)
            )
            OR (
                sp.include_captado_plus
                AND b.etapa_orden >= COALESCE(sb.captado_orden, 0)
            )
        )
)
SELECT
    f.nivel AS location_level,
    f.location_key,
    f.location_name,
    f.canal,
    f.etapa_codigo,
    f.etapa_categoria,
    f.etapa_orden::smallint,
    f.captado_orden::smallint,
    COUNT(*)::bigint AS total
FROM filtered f
GROUP BY
    f.nivel,
    f.location_key,
    f.location_name,
    f.canal,
    f.etapa_codigo,
    f.etapa_categoria,
    f.etapa_orden,
    f.captado_orden
ORDER BY f.nivel, f.location_name, f.canal, f.etapa_codigo;
$$;

-- Función extendida para visitantes con métricas por canal
DROP FUNCTION IF EXISTS public.panel_visitantes_geo_resumen_ext(text, timestamp with time zone, timestamp with time zone);
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
SET search_path = public
AS $$
WITH normalized_level AS (
    SELECT CASE
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'pais' THEN 'pais'
        WHEN lower(COALESCE(p_nivel, 'estado')) = 'municipio' THEN 'municipio'
        ELSE 'estado'
    END AS nivel
),
visits AS (
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
geo AS (
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
    FROM visits v
),
normalized AS (
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
            WHEN g.cve_ent IS NOT NULL AND g.cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.cve_ent, '\\D', '', 'g'), 2, '0')
            ELSE NULL
        END AS cve_ent,
        g.nom_ent,
        CASE
            WHEN g.cve_mun IS NOT NULL AND g.cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        g.nom_mun,
        CASE
            WHEN g.cvegeo IS NOT NULL AND g.cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN g.cve_ent IS NOT NULL AND g.cve_mun IS NOT NULL THEN
                LPAD(REGEXP_REPLACE(g.cve_ent, '\\D', '', 'g'), 2, '0')
                || LPAD(REGEXP_REPLACE(g.cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM geo g
),
scoped AS (
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
    FROM normalized n
    CROSS JOIN normalized_level nl
)
SELECT
    s.nivel AS location_level,
    s.location_key,
    s.location_name,
    COUNT(*)::bigint AS total_visitas,
    COUNT(*) FILTER (WHERE s.tuvo_chat) AS visitas_con_chat,
    COUNT(*) FILTER (WHERE NOT s.tuvo_chat) AS visitas_sin_chat,
    COUNT(*)::bigint AS webchat_total,
    COUNT(*) FILTER (WHERE s.tuvo_chat) AS webchat_con_chat,
    COUNT(*) FILTER (WHERE NOT s.tuvo_chat) AS webchat_sin_chat,
    0::bigint AS whatsapp_total,
    0::bigint AS voz_total,
    (COUNT(*) > 0) AS has_data
FROM scoped s
GROUP BY s.nivel, s.location_key, s.location_name
ORDER BY s.nivel, s.location_name;
$$;

COMMIT;
