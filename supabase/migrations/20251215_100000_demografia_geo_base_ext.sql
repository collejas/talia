BEGIN;

CREATE OR REPLACE FUNCTION public.panel_leads_geo_base_ext(
    p_canales text DEFAULT NULL,
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
        ct.contacto_datos
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
        ) AS raw_cvegeo
    FROM base b
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
            WHEN g.raw_country_code IS NULL OR g.raw_country_code = '' THEN
                CASE
                    WHEN lower(COALESCE(g.canal, '')) IN ('whatsapp', 'voz') THEN 'MX'
                    ELSE NULL
                END
            WHEN length(g.raw_country_code) = 2 THEN upper(g.raw_country_code)
            WHEN length(g.raw_country_code) = 3 AND g.raw_country_code ~ '^[A-Za-z]{3}$' THEN upper(g.raw_country_code)
            ELSE upper(substr(g.raw_country_code, 1, 2))
        END AS pais_codigo,
        CASE
            WHEN g.raw_country_name IS NOT NULL AND g.raw_country_name <> '' THEN g.raw_country_name
            WHEN (g.raw_country_code IS NULL OR g.raw_country_code = '') AND lower(COALESCE(g.canal, '')) IN ('whatsapp', 'voz') THEN 'México'
            WHEN g.raw_country_code IS NOT NULL AND upper(g.raw_country_code) = 'MX' THEN 'México'
            ELSE g.raw_country_name
        END AS pais_nombre,
        CASE
            WHEN g.raw_cve_ent IS NULL THEN NULL
            ELSE LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
        END AS cve_ent,
        g.raw_nom_ent AS nom_ent,
        CASE
            WHEN g.raw_cve_mun IS NULL THEN NULL
            ELSE LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
        END AS cve_mun,
        g.raw_nom_mun AS nom_mun,
        CASE
            WHEN g.raw_cvegeo IS NOT NULL THEN LPAD(REGEXP_REPLACE(g.raw_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN g.raw_cve_ent IS NOT NULL AND g.raw_cve_mun IS NOT NULL
                THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
                     || LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM geo g
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

GRANT EXECUTE ON FUNCTION public.panel_leads_geo_base_ext(text, timestamptz, timestamptz)
    TO postgres, service_role, authenticated;

CREATE OR REPLACE FUNCTION public.panel_leads_geo_resumen(
    p_nivel text DEFAULT 'estado',
    p_canales text DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    location_level text,
    location_key text,
    location_name text,
    canal text,
    total bigint,
    abiertas bigint,
    ganadas bigint,
    perdidas bigint
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
base AS (
    SELECT
        n.nivel,
        g.*
    FROM normalized_level n
    JOIN public.panel_leads_geo_base_ext(p_canales, p_from, p_to) g ON TRUE
),
scoped AS (
    SELECT
        b.nivel,
        b.canal,
        b.etapa_categoria,
        CASE
            WHEN b.nivel = 'pais' THEN COALESCE(NULLIF(b.pais_codigo, ''), 'UNK')
            WHEN b.nivel = 'municipio' THEN COALESCE(NULLIF(b.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(b.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN b.nivel = 'pais' THEN
                COALESCE(
                    NULLIF(b.pais_nombre, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.pais_codigo, ''), '') = '' THEN 'Desconocido'
                        ELSE b.pais_codigo
                    END
                )
            WHEN b.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(b.nom_mun, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.cvegeo, ''), '') = '' THEN 'Municipio desconocido'
                        ELSE b.cvegeo
                    END
                )
            ELSE
                COALESCE(
                    NULLIF(b.nom_ent, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.cve_ent, ''), '') = '' THEN 'Estado desconocido'
                        ELSE b.cve_ent
                    END
                )
        END AS location_name
    FROM base b
)
SELECT
    s.nivel AS location_level,
    s.location_key,
    s.location_name,
    s.canal,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE s.etapa_categoria = 'abierta') AS abiertas,
    COUNT(*) FILTER (WHERE s.etapa_categoria = 'ganada') AS ganadas,
    COUNT(*) FILTER (WHERE s.etapa_categoria = 'perdida') AS perdidas
FROM scoped s
GROUP BY s.nivel, s.location_key, s.location_name, s.canal
ORDER BY s.nivel, s.location_name, s.canal;
$$;

GRANT EXECUTE ON FUNCTION public.panel_leads_geo_resumen(text, text, timestamptz, timestamptz)
    TO postgres, service_role, authenticated;

CREATE OR REPLACE FUNCTION public.panel_visitantes_geo_resumen(
    p_nivel text DEFAULT 'estado',
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    location_level text,
    location_key text,
    location_name text,
    total_visitas bigint,
    visitas_con_chat bigint,
    visitas_sin_chat bigint
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
        sc.closed_at,
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
    LEFT JOIN public.webchat_session_closures sc ON sc.session_id = w.session_id
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
            NULLIF((v.geo -> 'client') ->> 'country', ''),
            NULLIF(v.geo ->> 'country_code', ''),
            NULLIF(v.geo ->> 'country', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'country_name', ''),
            NULLIF((v.geo -> 'client') ->> 'country_name', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((v.geo -> 'client') ->> 'country', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'state_code', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'region', ''),
            NULLIF((v.geo -> 'client') ->> 'state_code', ''),
            NULLIF((v.geo -> 'client') ->> 'region', ''),
            NULLIF(v.geo ->> 'state_code', ''),
            NULLIF(v.geo ->> 'region', '')
        ) AS raw_state_code,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'state', ''),
            NULLIF((v.geo -> 'client') ->> 'state', ''),
            NULLIF(v.geo ->> 'state', '')
        ) AS raw_state_name,
        COALESCE(
            NULLIF(v.geo -> 'ip_lookup' ->> 'city', ''),
            NULLIF((v.geo -> 'client') ->> 'city', ''),
            NULLIF(v.geo ->> 'city', '')
        ) AS raw_city_name,
        COALESCE(
            NULLIF(v.geo ->> 'cve_ent', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'cve_ent', '')
        ) AS raw_cve_ent,
        COALESCE(
            NULLIF(v.geo ->> 'cve_mun', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'cve_mun', '')
        ) AS raw_cve_mun,
        COALESCE(
            NULLIF(v.geo ->> 'cvegeo', ''),
            NULLIF(v.geo -> 'ip_lookup' ->> 'cvegeo', '')
        ) AS raw_cvegeo
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
        CASE
            WHEN g.raw_country_name IS NOT NULL AND g.raw_country_name <> '' THEN g.raw_country_name
            WHEN upper(COALESCE(g.raw_country_code, '')) = 'MX' THEN 'México'
            ELSE g.raw_country_name
        END AS country_name,
        CASE
            WHEN g.raw_cve_ent IS NOT NULL AND g.raw_cve_ent <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
            WHEN upper(COALESCE(g.raw_country_code, '')) = 'MX' AND g.raw_state_code ~ '^[0-9]{1,2}$' THEN LPAD(g.raw_state_code, 2, '0')
            ELSE NULL
        END AS cve_ent,
        COALESCE(
            g.raw_state_name,
            g.raw_state_code,
            NULL
        ) AS nom_ent,
        CASE
            WHEN g.raw_cve_mun IS NOT NULL AND g.raw_cve_mun <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cve_mun,
        COALESCE(
            g.raw_city_name,
            NULL
        ) AS nom_mun,
        CASE
            WHEN g.raw_cvegeo IS NOT NULL AND g.raw_cvegeo <> '' THEN LPAD(REGEXP_REPLACE(g.raw_cvegeo, '\\D', '', 'g'), 5, '0')
            WHEN upper(COALESCE(g.raw_country_code, '')) = 'MX' AND g.raw_cve_ent IS NOT NULL AND g.raw_cve_mun IS NOT NULL
                THEN LPAD(REGEXP_REPLACE(g.raw_cve_ent, '\\D', '', 'g'), 2, '0')
                     || LPAD(REGEXP_REPLACE(g.raw_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM geo g
),
base AS (
    SELECT
        (SELECT nivel FROM normalized_level) AS nivel,
        n.*
    FROM normalized n
),
scoped AS (
    SELECT
        b.nivel,
        CASE
            WHEN b.nivel = 'pais' THEN COALESCE(NULLIF(b.country_code, ''), 'UNK')
            WHEN b.nivel = 'municipio' THEN COALESCE(NULLIF(b.cvegeo, ''), 'UNK')
            ELSE COALESCE(NULLIF(b.cve_ent, ''), 'UNK')
        END AS location_key,
        CASE
            WHEN b.nivel = 'pais' THEN
                COALESCE(
                    NULLIF(b.country_name, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.country_code, ''), '') = '' THEN 'Desconocido'
                        ELSE b.country_code
                    END
                )
            WHEN b.nivel = 'municipio' THEN
                COALESCE(
                    NULLIF(b.nom_mun, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.cvegeo, ''), '') = '' THEN 'Municipio desconocido'
                        ELSE b.cvegeo
                    END
                )
            ELSE
                COALESCE(
                    NULLIF(b.nom_ent, ''),
                    CASE
                        WHEN COALESCE(NULLIF(b.cve_ent, ''), '') = '' THEN 'Estado desconocido'
                        ELSE b.cve_ent
                    END
                )
        END AS location_name,
        b.tuvo_chat
    FROM base b
)
SELECT
    s.nivel AS location_level,
    s.location_key,
    s.location_name,
    COUNT(*) AS total_visitas,
    COUNT(*) FILTER (WHERE s.tuvo_chat) AS visitas_con_chat,
    COUNT(*) FILTER (WHERE NOT s.tuvo_chat) AS visitas_sin_chat
FROM scoped s
GROUP BY s.nivel, s.location_key, s.location_name
ORDER BY s.nivel, s.location_name;
$$;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_geo_resumen(text, timestamptz, timestamptz)
    TO postgres, service_role, authenticated;

COMMIT;
