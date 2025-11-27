BEGIN;

-- Refresca los helpers del mapa para que lean oportunidades/etapas_pipeline en lugar de tablas legacy.
DROP FUNCTION IF EXISTS public.panel_leads_geo_base(text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.panel_leads_geo_base_ext(text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.panel_leads_geo_resumen_ext(text, text, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.panel_leads_geo_base(
    p_canales text DEFAULT NULL::text,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    contacto_id uuid,
    canal text,
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
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id,
        public.es_admin(auth.uid()) AS es_admin,
        lower(COALESCE(current_setting('request.jwt.claim.role', true), '')) = 'service_role' AS is_service_role
),
params AS (
    SELECT CASE
        WHEN p_canales IS NULL OR btrim(p_canales) = '' THEN NULL
        ELSE ARRAY(
            SELECT lower(btrim(value))
            FROM regexp_split_to_table(p_canales, ',') AS value
            WHERE btrim(value) <> ''
        )::text[]
    END AS canales
),
eligible AS (
    SELECT
        o.id AS oportunidad_id,
        COALESCE(
            o.contacto_principal_id,
            CASE
                WHEN COALESCE(o.metadata ->> 'legacy_contacto_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                    THEN (o.metadata ->> 'legacy_contacto_id')::uuid
                ELSE NULL
            END
        ) AS contacto_id,
        lower(
            NULLIF(
                COALESCE(o.metadata ->> 'canal', conv.canal, ''),
                ''
            )
        ) AS raw_canal,
        o.creado_en,
        ct.contacto_datos
    FROM public.oportunidades o
    CROSS JOIN scope s
    CROSS JOIN params p
    LEFT JOIN LATERAL (
        SELECT CASE
            WHEN COALESCE(o.metadata ->> 'conversacion_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (o.metadata ->> 'conversacion_id')::uuid
            ELSE NULL
        END AS conversacion_id
    ) conv_meta ON TRUE
    LEFT JOIN public.conversaciones conv ON conv.id = conv_meta.conversacion_id
    LEFT JOIN public.contactos ct ON ct.id = COALESCE(
        o.contacto_principal_id,
        CASE
            WHEN COALESCE(o.metadata ->> 'legacy_contacto_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (o.metadata ->> 'legacy_contacto_id')::uuid
            ELSE NULL
        END
    )
    WHERE
        (s.is_service_role OR s.es_admin OR (s.organizacion_id IS NOT NULL AND o.organizacion_id = s.organizacion_id))
        AND (p_from IS NULL OR o.creado_en >= p_from)
        AND (p_to IS NULL OR o.creado_en <= p_to)
        AND (
            p.canales IS NULL
            OR array_length(p.canales, 1) = 0
            OR lower(
                NULLIF(
                    COALESCE(o.metadata ->> 'canal', conv.canal, ''),
                    ''
                )
            ) = ANY (p.canales)
        )
),
normalized AS (
    SELECT
        e.contacto_id,
        CASE WHEN e.raw_canal IS NULL OR e.raw_canal = '' THEN 'desconocido' ELSE e.raw_canal END AS canal,
        e.contacto_datos
    FROM eligible e
)
SELECT
    n.contacto_id,
    n.canal,
    loc.cve_ent,
    loc.nom_ent,
    loc.cve_mun,
    loc.nom_mun,
    loc.cvegeo
FROM normalized n
LEFT JOIN LATERAL (
    WITH raw AS (
        SELECT
            NULLIF(n.contacto_datos #>> '{ubicacion,cve_ent}', '') AS u_cve_ent,
            NULLIF(n.contacto_datos #>> '{ubicacion,nom_ent}', '') AS u_nom_ent,
            NULLIF(n.contacto_datos #>> '{ubicacion,cve_mun}', '') AS u_cve_mun,
            NULLIF(n.contacto_datos #>> '{ubicacion,nom_mun}', '') AS u_nom_mun,
            NULLIF(n.contacto_datos #>> '{ubicacion,cvegeo}', '') AS u_cvegeo,
            NULLIF(n.contacto_datos #>> '{cve_ent}', '') AS d_cve_ent,
            NULLIF(n.contacto_datos #>> '{nom_ent}', '') AS d_nom_ent,
            NULLIF(n.contacto_datos #>> '{cve_mun}', '') AS d_cve_mun,
            NULLIF(n.contacto_datos #>> '{nom_mun}', '') AS d_nom_mun,
            NULLIF(n.contacto_datos #>> '{cvegeo}', '') AS d_cvegeo
    )
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
                THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0') || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
            ELSE NULL
        END AS cvegeo
    FROM (
        SELECT
            COALESCE(u_cve_ent, d_cve_ent) AS val_cve_ent,
            COALESCE(u_nom_ent, d_nom_ent) AS val_nom_ent,
            COALESCE(u_cve_mun, d_cve_mun) AS val_cve_mun,
            COALESCE(u_nom_mun, d_nom_mun) AS val_nom_mun,
            COALESCE(u_cvegeo, d_cvegeo) AS val_cvegeo
        FROM raw
    ) merged
) AS loc ON TRUE;
$$;

CREATE OR REPLACE FUNCTION public.panel_leads_geo_base_ext(
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
    etapa_orden integer,
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
WITH scope AS (
    SELECT
        auth.uid() AS uid,
        public.usuario_organizacion_id(auth.uid()) AS organizacion_id,
        public.es_admin(auth.uid()) AS es_admin,
        lower(COALESCE(current_setting('request.jwt.claim.role', true), '')) = 'service_role' AS is_service_role
),
params AS (
    SELECT CASE
        WHEN p_canales IS NULL OR btrim(p_canales) = '' THEN NULL
        ELSE ARRAY(
            SELECT lower(btrim(value))
            FROM regexp_split_to_table(p_canales, ',') AS value
            WHERE btrim(value) <> ''
        )::text[]
    END AS canales
),
eligible AS (
    SELECT
        o.id AS lead_id,
        COALESCE(
            o.contacto_principal_id,
            CASE
                WHEN COALESCE(o.metadata ->> 'legacy_contacto_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                    THEN (o.metadata ->> 'legacy_contacto_id')::uuid
                ELSE NULL
            END
        ) AS contacto_id,
        lower(
            NULLIF(
                COALESCE(o.metadata ->> 'canal', conv.canal, ''),
                ''
            )
        ) AS raw_canal,
        o.etapa_id,
        ep.codigo AS etapa_codigo,
        ep.nombre AS etapa_nombre,
        CASE
            WHEN lower(COALESCE(ep.categoria, '')) IN ('ganada', 'ganado', 'cerrado_ganado') THEN 'ganada'::public.lead_categoria
            WHEN lower(COALESCE(ep.categoria, '')) IN ('perdida', 'perdido', 'cerrado_perdido') THEN 'perdida'::public.lead_categoria
            ELSE 'abierta'::public.lead_categoria
        END AS etapa_categoria,
        ep.orden AS etapa_orden,
        ct.contacto_datos,
        ct.telefono_e164
    FROM public.oportunidades o
    JOIN public.etapas_pipeline ep ON ep.id = o.etapa_id
    CROSS JOIN scope s
    CROSS JOIN params p
    LEFT JOIN LATERAL (
        SELECT CASE
            WHEN COALESCE(o.metadata ->> 'conversacion_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (o.metadata ->> 'conversacion_id')::uuid
            ELSE NULL
        END AS conversacion_id
    ) conv_meta ON TRUE
    LEFT JOIN public.conversaciones conv ON conv.id = conv_meta.conversacion_id
    LEFT JOIN public.contactos ct ON ct.id = COALESCE(
        o.contacto_principal_id,
        CASE
            WHEN COALESCE(o.metadata ->> 'legacy_contacto_id', '') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN (o.metadata ->> 'legacy_contacto_id')::uuid
            ELSE NULL
        END
    )
    WHERE
        (s.is_service_role OR s.es_admin OR (s.organizacion_id IS NOT NULL AND o.organizacion_id = s.organizacion_id))
        AND (p_from IS NULL OR o.creado_en >= p_from)
        AND (p_to IS NULL OR o.creado_en <= p_to)
        AND (
            p.canales IS NULL
            OR array_length(p.canales, 1) = 0
            OR lower(
                NULLIF(
                    COALESCE(o.metadata ->> 'canal', conv.canal, ''),
                    ''
                )
            ) = ANY (p.canales)
        )
),
geo AS (
    SELECT
        e.*,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,country_code}', ''),
            NULLIF(e.contacto_datos #>> '{country_code}', ''),
            NULLIF(e.contacto_datos #>> '{ubicacion,pais_codigo}', ''),
            NULLIF(e.contacto_datos #>> '{pais_codigo}', '')
        ) AS raw_country_code,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,country_name}', ''),
            NULLIF(e.contacto_datos #>> '{country_name}', ''),
            NULLIF(e.contacto_datos #>> '{ubicacion,pais_nombre}', ''),
            NULLIF(e.contacto_datos #>> '{pais_nombre}', ''),
            NULLIF(e.contacto_datos #>> '{ubicacion,pais}', ''),
            NULLIF(e.contacto_datos #>> '{pais}', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,cve_ent}', ''),
            NULLIF(e.contacto_datos #>> '{cve_ent}', '')
        ) AS raw_cve_ent,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,nom_ent}', ''),
            NULLIF(e.contacto_datos #>> '{nom_ent}', '')
        ) AS raw_nom_ent,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,cve_mun}', ''),
            NULLIF(e.contacto_datos #>> '{cve_mun}', '')
        ) AS raw_cve_mun,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,nom_mun}', ''),
            NULLIF(e.contacto_datos #>> '{nom_mun}', '')
        ) AS raw_nom_mun,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,cvegeo}', ''),
            NULLIF(e.contacto_datos #>> '{cvegeo}', '')
        ) AS raw_cvegeo,
        COALESCE(
            NULLIF(e.contacto_datos #>> '{ubicacion,session_id}', ''),
            NULLIF(e.contacto_datos #>> '{session_id}', ''),
            NULLIF(e.contacto_datos #>> '{trazabilidad,session_id}', '')
        ) AS raw_session_id
    FROM eligible e
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
        CASE WHEN g.raw_canal IS NULL OR g.raw_canal = '' THEN 'desconocido' ELSE g.raw_canal END AS canal,
        g.etapa_id,
        lower(COALESCE(g.etapa_codigo, '')) AS etapa_codigo,
        g.etapa_nombre,
        COALESCE(g.etapa_categoria, 'abierta'::public.lead_categoria) AS etapa_categoria,
        COALESCE(g.etapa_orden, 0) AS etapa_orden,
        CASE
            WHEN COALESCE(g.raw_country_code, g.visitor_country_code) IS NULL
                 OR COALESCE(g.raw_country_code, g.visitor_country_code) = '' THEN
                CASE
                    WHEN lower(COALESCE(g.raw_canal, '')) IN ('whatsapp', 'voz') THEN 'MX'
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
                 AND lower(COALESCE(g.raw_canal, '')) IN ('whatsapp', 'voz') THEN 'México'
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
    n.etapa_orden,
    n.pais_codigo,
    n.pais_nombre,
    n.cve_ent,
    n.nom_ent,
    n.cve_mun,
    n.nom_mun,
    n.cvegeo
FROM normalized n;
$$;

CREATE OR REPLACE FUNCTION public.panel_leads_geo_resumen_ext(
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
base AS (
    SELECT
        n.nivel,
        COALESCE(NULLIF(g.canal, ''), 'desconocido') AS canal,
        lower(COALESCE(g.etapa_codigo, '')) AS etapa_codigo,
        COALESCE(g.etapa_categoria, 'abierta'::public.lead_categoria) AS etapa_categoria,
        COALESCE(g.etapa_orden, 0) AS etapa_orden,
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
),
bounds AS (
    SELECT COALESCE(MIN(b.etapa_orden) FILTER (WHERE b.etapa_codigo = 'captado'), 1) AS captado_orden
    FROM base b
),
filtered AS (
    SELECT
        b.*,
        bd.captado_orden
    FROM base b
    CROSS JOIN stage_param sp
    CROSS JOIN bounds bd
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
                AND b.etapa_orden >= bd.captado_orden
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

COMMIT;
