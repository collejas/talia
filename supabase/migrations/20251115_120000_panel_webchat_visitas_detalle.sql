BEGIN;

DROP FUNCTION IF EXISTS public.panel_webchat_visitas_detalle(
    timestamptz,
    timestamptz,
    boolean,
    text,
    text,
    integer,
    integer
);

CREATE OR REPLACE FUNCTION public.panel_webchat_visitas_detalle(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_has_chat boolean DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT NULL,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    session_id text,
    ip text,
    registrado_en timestamptz,
    ultimo_evento_en timestamptz,
    closed_at timestamptz,
    stay_seconds double precision,
    avg_stay_seconds double precision,
    visit_count integer,
    tuvo_chat boolean,
    mensajes_entrantes integer,
    mensajes_salientes integer,
    primer_mensaje_en timestamptz,
    ultimo_mensaje_conversacion timestamptz,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    contacto_empresa text,
    contacto_estado text,
    contacto_captura text,
    contacto_creado_en timestamptz,
    country_code text,
    country_name text,
    state_name text,
    state_code text,
    city_name text,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text,
    ubicacion_cache jsonb,
    device_type text,
    dispositivo_cache jsonb,
    pantalla_cache jsonb,
    sistema_operativo text,
    idioma text,
    timezone text,
    prefiere_modo_oscuro boolean,
    referrer text,
    landing_url text,
    trazabilidad_cache jsonb,
    geo jsonb,
    total_rows bigint,
    total_chat_rows bigint,
    total_no_chat_rows bigint
) LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH state_param AS (
    SELECT CASE
        WHEN p_state IS NULL OR btrim(p_state) = '' THEN NULL
        ELSE LPAD(REGEXP_REPLACE(p_state, '\D', '', 'g'), 2, '0')
    END AS code
),
base AS (
    SELECT
        w.session_id,
        COALESCE(w.contacto_id, ic.contacto_id) AS contacto_id,
        w.registrado_en,
        w.ultimo_evento_en,
        sc.closed_at,
        w.visit_count,
        w.cve_ent,
        w.nom_ent,
        w.cve_mun,
        w.nom_mun,
        w.cvegeo,
        w.ip,
        w.device_type,
        w.geo,
        w.referrer,
        w.landing_url,
        GREATEST(
            EXTRACT(
                EPOCH FROM (
                    COALESCE(sc.closed_at, w.ultimo_evento_en, w.registrado_en) - w.registrado_en
                )
            ),
            0
        ) AS duration_seconds
    FROM public.webchat_visitantes w
    LEFT JOIN public.identidades_canal ic
        ON ic.canal = 'webchat' AND ic.id_externo = w.session_id
    LEFT JOIN public.webchat_session_closures sc
        ON sc.session_id = w.session_id
),
messages AS (
    SELECT
        datos ->> 'session_id' AS session_id,
        COUNT(*) FILTER (WHERE direccion = 'entrante') AS entrantes,
        COUNT(*) FILTER (WHERE direccion = 'saliente') AS salientes,
        MIN(creado_en) FILTER (WHERE direccion = 'entrante') AS primer_mensaje_en,
        MAX(creado_en) AS ultimo_mensaje_en
    FROM public.mensajes
    WHERE datos ? 'session_id'
    GROUP BY datos ->> 'session_id'
),
contacts AS (
    SELECT
        c.id,
        c.nombre_completo,
        c.correo,
        c.telefono_e164,
        c.company_name,
        c.estado,
        c.captura_estado,
        c.creado_en,
        c.contacto_datos
    FROM public.contactos c
),
geo_unified AS (
    SELECT
        b.*,
        m.entrantes,
        m.salientes,
        m.primer_mensaje_en,
        m.ultimo_mensaje_en,
        ct.id AS contacto_ref,
        ct.nombre_completo,
        ct.correo,
        ct.telefono_e164,
        ct.company_name,
        ct.estado,
        ct.captura_estado,
        ct.creado_en,
        ct.contacto_datos,
        CASE
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'country_code'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'country_code', '')
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'country'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'country', '')
            WHEN (b.geo -> 'client') ? 'country_code'
                THEN NULLIF((b.geo -> 'client') ->> 'country_code', '')
            WHEN (b.geo -> 'client') ? 'country'
                THEN NULLIF((b.geo -> 'client') ->> 'country', '')
            ELSE NULL
        END AS geo_country_code,
        CASE
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'country_name'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'country_name', '')
            WHEN (b.geo -> 'client') ? 'country_name'
                THEN NULLIF((b.geo -> 'client') ->> 'country_name', '')
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'country'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'country', '')
            WHEN (b.geo -> 'client') ? 'country'
                THEN NULLIF((b.geo -> 'client') ->> 'country', '')
            ELSE NULL
        END AS geo_country_name,
        CASE
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'region'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'region', '')
            WHEN (b.geo -> 'client') ? 'region'
                THEN NULLIF((b.geo -> 'client') ->> 'region', '')
            WHEN (b.geo -> 'client') ? 'state'
                THEN NULLIF((b.geo -> 'client') ->> 'state', '')
            ELSE NULL
        END AS geo_region,
        CASE
            WHEN b.geo ? 'ip_lookup' AND (b.geo -> 'ip_lookup') ? 'city'
                THEN NULLIF((b.geo -> 'ip_lookup') ->> 'city', '')
            WHEN (b.geo -> 'client') ? 'city'
                THEN NULLIF((b.geo -> 'client') ->> 'city', '')
            ELSE NULL
        END AS geo_city
    FROM base b
    LEFT JOIN messages m ON m.session_id = b.session_id
    LEFT JOIN contacts ct ON ct.id = b.contacto_id
)
SELECT
    g.session_id,
    g.ip,
    g.registrado_en,
    g.ultimo_evento_en,
    g.closed_at,
    g.duration_seconds AS stay_seconds,
    CASE
        WHEN COALESCE(g.visit_count, 0) > 1
            THEN g.duration_seconds / NULLIF(g.visit_count, 0)
        ELSE NULL
    END AS avg_stay_seconds,
    COALESCE(g.visit_count, 0) AS visit_count,
    COALESCE(g.entrantes, 0) > 0 AS tuvo_chat,
    COALESCE(g.entrantes, 0) AS mensajes_entrantes,
    COALESCE(g.salientes, 0) AS mensajes_salientes,
    g.primer_mensaje_en,
    g.ultimo_mensaje_en AS ultimo_mensaje_conversacion,
    g.contacto_ref AS contacto_id,
    g.nombre_completo AS contacto_nombre,
    g.correo AS contacto_correo,
    g.telefono_e164 AS contacto_telefono,
    g.company_name AS contacto_empresa,
    g.estado AS contacto_estado,
    g.captura_estado AS contacto_captura,
    g.creado_en AS contacto_creado_en,
    UPPER(
        COALESCE(
            NULLIF(g.geo_country_code, ''),
            NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
            NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
        )
    ) AS country_code,
    COALESCE(
        g.geo_country_name,
        g.contacto_datos #>> '{ubicacion,country}',
        g.contacto_datos #>> '{ubicacion,nom_ent}',
        g.contacto_datos #>> '{ubicacion,nom_pais}'
    ) AS country_name,
    CASE
        WHEN UPPER(
            COALESCE(
                NULLIF(g.geo_country_code, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
            )
        ) = 'MX'
        THEN COALESCE(
            g.nom_ent,
            g.contacto_datos #>> '{ubicacion,nom_ent}',
            g.geo_region
        )
        ELSE COALESCE(
            g.geo_region,
            g.contacto_datos #>> '{ubicacion,region}',
            g.contacto_datos #>> '{ubicacion,nom_ent}'
        )
    END AS state_name,
    CASE
        WHEN UPPER(
            COALESCE(
                NULLIF(g.geo_country_code, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
            )
        ) = 'MX'
        THEN LPAD(
            COALESCE(
                NULLIF(g.cve_ent, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,cve_ent}', '')
            ),
            2,
            '0'
        )
        ELSE NULL
    END AS state_code,
    CASE
        WHEN UPPER(
            COALESCE(
                NULLIF(g.geo_country_code, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
            )
        ) = 'MX'
        THEN COALESCE(
            g.nom_mun,
            g.contacto_datos #>> '{ubicacion,nom_mun}',
            g.geo_city
        )
        ELSE COALESCE(
            g.geo_city,
            g.contacto_datos #>> '{ubicacion,city}',
            g.contacto_datos #>> '{ubicacion,nom_mun}'
        )
    END AS city_name,
    COALESCE(
        LPAD(NULLIF(g.cve_ent, ''), 2, '0'),
        LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cve_ent}', ''), 2, '0'),
        NULLIF(g.contacto_datos #>> '{cve_ent}', '')
    ) AS cve_ent,
    COALESCE(
        g.nom_ent,
        g.contacto_datos #>> '{ubicacion,nom_ent}',
        g.contacto_datos #>> '{nom_ent}'
    ) AS nom_ent,
    COALESCE(
        LPAD(NULLIF(g.cve_mun, ''), 3, '0'),
        LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cve_mun}', ''), 3, '0'),
        g.contacto_datos #>> '{cve_mun}'
    ) AS cve_mun,
    COALESCE(
        g.nom_mun,
        g.contacto_datos #>> '{ubicacion,nom_mun}',
        g.contacto_datos #>> '{nom_mun}'
    ) AS nom_mun,
    COALESCE(
        LPAD(NULLIF(g.cvegeo, ''), 5, '0'),
        LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cvegeo}', ''), 5, '0'),
        g.contacto_datos #>> '{cvegeo}'
    ) AS cvegeo,
    g.contacto_datos -> 'ubicacion' AS ubicacion_cache,
    g.device_type,
    g.contacto_datos -> 'dispositivo' AS dispositivo_cache,
    (g.contacto_datos -> 'dispositivo' -> 'pantalla') AS pantalla_cache,
    NULLIF(g.contacto_datos #>> '{dispositivo,plataforma}', '') AS sistema_operativo,
    NULLIF(g.contacto_datos #>> '{dispositivo,idioma}', '') AS idioma,
    NULLIF(g.contacto_datos #>> '{dispositivo,timezone}', '') AS timezone,
    CASE
        WHEN (g.contacto_datos #>> '{dispositivo,prefiere_modo_oscuro}') IN ('true', '1') THEN true
        WHEN (g.contacto_datos #>> '{dispositivo,prefiere_modo_oscuro}') IN ('false', '0') THEN false
        ELSE NULL
    END AS prefiere_modo_oscuro,
    COALESCE(g.referrer, NULLIF(g.contacto_datos #>> '{trazabilidad,referrer}', '')) AS referrer,
    COALESCE(g.landing_url, NULLIF(g.contacto_datos #>> '{trazabilidad,landing}', '')) AS landing_url,
    g.contacto_datos -> 'trazabilidad' AS trazabilidad_cache,
    g.geo,
    COUNT(*) OVER () AS total_rows,
    COUNT(*) FILTER (WHERE COALESCE(g.entrantes, 0) > 0) OVER () AS total_chat_rows,
    COUNT(*) FILTER (WHERE COALESCE(g.entrantes, 0) = 0) OVER () AS total_no_chat_rows
FROM geo_unified g
CROSS JOIN state_param sp
WHERE (p_from IS NULL OR COALESCE(g.ultimo_evento_en, g.registrado_en) >= p_from)
  AND (p_to IS NULL OR COALESCE(g.ultimo_evento_en, g.registrado_en) <= p_to)
  AND (
        sp.code IS NULL
        OR COALESCE(
            LPAD(NULLIF(g.cve_ent, ''), 2, '0'),
            LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cve_ent}', ''), 2, '0'),
            NULLIF(g.contacto_datos #>> '{cve_ent}', '')
        ) = sp.code
      )
  AND (
        p_has_chat IS NULL
        OR (p_has_chat IS TRUE AND COALESCE(g.entrantes, 0) > 0)
        OR (p_has_chat IS FALSE AND COALESCE(g.entrantes, 0) = 0)
      )
  AND (
        p_search IS NULL OR btrim(p_search) = '' OR
        (
            g.session_id ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.nombre_completo, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.correo, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.telefono_e164, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.referrer, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.landing_url, '') ILIKE '%' || btrim(p_search) || '%'
        )
      )
ORDER BY COALESCE(g.ultimo_evento_en, g.registrado_en) DESC, g.session_id
LIMIT COALESCE(NULLIF(p_limit, 0), 500)
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.panel_webchat_visitas_detalle(
    timestamptz,
    timestamptz,
    boolean,
    text,
    text,
    integer,
    integer
)
    TO postgres, service_role;

COMMIT;
