-- Extiende panel_webchat_visitas_detalle con filtros por columna.
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

DROP FUNCTION IF EXISTS public.panel_webchat_visitas_detalle(
    timestamptz,
    timestamptz,
    boolean,
    text,
    text,
    text,
    text,
    integer,
    integer
);

DROP FUNCTION IF EXISTS public.panel_webchat_visitas_detalle(
    timestamptz,
    timestamptz,
    boolean,
    text,
    text,
    text,
    text,
    text,
    integer,
    integer,
    timestamptz,
    timestamptz,
    timestamptz,
    timestamptz,
    double precision,
    double precision,
    double precision,
    double precision,
    text,
    text[],
    text,
    text,
    text,
    integer,
    integer
);

CREATE OR REPLACE FUNCTION public.panel_webchat_visitas_detalle(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_has_chat boolean DEFAULT NULL,
    p_country text DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_city text DEFAULT NULL,
    p_session text DEFAULT NULL,
    p_ip text DEFAULT NULL,
    p_visit_min integer DEFAULT NULL,
    p_visit_max integer DEFAULT NULL,
    p_first_from timestamptz DEFAULT NULL,
    p_first_to timestamptz DEFAULT NULL,
    p_last_from timestamptz DEFAULT NULL,
    p_last_to timestamptz DEFAULT NULL,
    p_stay_min double precision DEFAULT NULL,
    p_stay_max double precision DEFAULT NULL,
    p_avg_stay_min double precision DEFAULT NULL,
    p_avg_stay_max double precision DEFAULT NULL,
    p_contact_status text DEFAULT NULL,
    p_device_types text[] DEFAULT NULL,
    p_referrer text DEFAULT NULL,
    p_landing text DEFAULT NULL,
    p_order_by text DEFAULT NULL,
    p_order_dir text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT NULL,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    session_id text,
    ip text,
    registrado_en timestamptz,
    primera_visita_en timestamptz,
    ultimo_evento_en timestamptz,
    closed_at timestamptz,
    stay_seconds double precision,
    avg_stay_seconds double precision,
    visit_count integer,
    total_visitas integer,
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
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
WITH params AS (
    SELECT
        CASE
            WHEN p_state IS NULL OR btrim(p_state) = '' THEN NULL
            ELSE LPAD(REGEXP_REPLACE(p_state, '\D', '', 'g'), 2, '0')
        END AS state_code,
        CASE
            WHEN p_country IS NULL OR btrim(p_country) = '' THEN NULL
            ELSE UPPER(btrim(p_country))
        END AS country_code,
        CASE
            WHEN p_country IS NULL OR btrim(p_country) = '' THEN NULL
            ELSE btrim(p_country)
        END AS country_name,
        CASE
            WHEN p_city IS NULL OR btrim(p_city) = '' THEN NULL
            ELSE btrim(p_city)
        END AS city_name,
        CASE
            WHEN p_session IS NULL OR btrim(p_session) = '' THEN NULL
            ELSE btrim(p_session)
        END AS session_filter,
        CASE
            WHEN p_ip IS NULL OR btrim(p_ip) = '' THEN NULL
            ELSE btrim(p_ip)
        END AS ip_filter,
        CASE WHEN p_visit_min IS NULL THEN NULL ELSE p_visit_min END AS visit_min,
        CASE WHEN p_visit_max IS NULL THEN NULL ELSE p_visit_max END AS visit_max,
        p_first_from AS first_from,
        p_first_to AS first_to,
        p_last_from AS last_from,
        p_last_to AS last_to,
        CASE WHEN p_stay_min IS NULL THEN NULL ELSE p_stay_min END AS stay_min,
        CASE WHEN p_stay_max IS NULL THEN NULL ELSE p_stay_max END AS stay_max,
        CASE WHEN p_avg_stay_min IS NULL THEN NULL ELSE p_avg_stay_min END AS avg_stay_min,
        CASE WHEN p_avg_stay_max IS NULL THEN NULL ELSE p_avg_stay_max END AS avg_stay_max,
        CASE
            WHEN p_contact_status IS NULL OR btrim(p_contact_status) = '' THEN NULL
            ELSE lower(btrim(p_contact_status))
        END AS contact_status,
        CASE
            WHEN p_referrer IS NULL OR btrim(p_referrer) = '' THEN NULL
            ELSE btrim(p_referrer)
        END AS referrer_filter,
        CASE
            WHEN p_landing IS NULL OR btrim(p_landing) = '' THEN NULL
            ELSE btrim(p_landing)
        END AS landing_filter,
        CASE
            WHEN p_device_types IS NULL OR array_length(p_device_types, 1) IS NULL THEN NULL
            ELSE ARRAY(
                SELECT DISTINCT UPPER(btrim(value))
                FROM unnest(p_device_types) AS value
                WHERE value IS NOT NULL AND btrim(value) <> ''
            )
        END AS device_values,
        CASE
            WHEN p_order_by IS NULL OR btrim(p_order_by) = '' THEN 'ultimo'
            WHEN lower(btrim(p_order_by)) IN (
                'session', 'ip', 'visitas', 'primera', 'ultimo', 'stay',
                'avg_stay', 'chat', 'country', 'state', 'city', 'device',
                'referrer', 'landing'
            ) THEN lower(btrim(p_order_by))
            ELSE 'ultimo'
        END AS order_by,
        CASE
            WHEN lower(coalesce(p_order_dir, 'desc')) = 'asc' THEN 'asc'
            ELSE 'desc'
        END AS order_dir
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
) ,
result AS (
SELECT
    g.session_id,
    g.ip,
    g.registrado_en,
    g.registrado_en AS primera_visita_en,
    g.ultimo_evento_en,
    g.closed_at,
    g.duration_seconds AS stay_seconds,
    CASE
        WHEN COALESCE(g.visit_count, 0) > 0
            THEN g.duration_seconds / NULLIF(g.visit_count, 0)
        ELSE NULL
    END AS avg_stay_seconds,
    COALESCE(g.visit_count, 0) AS visit_count,
    COALESCE(g.visit_count, 0) AS total_visitas,
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
CROSS JOIN params pr
WHERE (p_from IS NULL OR COALESCE(g.ultimo_evento_en, g.registrado_en) >= p_from)
  AND (p_to IS NULL OR COALESCE(g.ultimo_evento_en, g.registrado_en) <= p_to)
  AND (
        pr.state_code IS NULL
        OR COALESCE(
            LPAD(NULLIF(g.cve_ent, ''), 2, '0'),
            LPAD(NULLIF(g.contacto_datos #>> '{ubicacion,cve_ent}', ''), 2, '0'),
            NULLIF(g.contacto_datos #>> '{cve_ent}', '')
        ) = pr.state_code
      )
  AND (
        pr.country_code IS NULL
        OR UPPER(
            COALESCE(
                NULLIF(g.geo_country_code, ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country_code}', ''),
                NULLIF(g.contacto_datos #>> '{ubicacion,country}', '')
            )
        ) = pr.country_code
        OR (
            pr.country_name IS NOT NULL AND pr.country_name <> '' AND
            COALESCE(
                g.geo_country_name,
                g.contacto_datos #>> '{ubicacion,country}',
                g.contacto_datos #>> '{ubicacion,nom_ent}',
                g.contacto_datos #>> '{ubicacion,nom_pais}'
            ) ILIKE '%' || pr.country_name || '%'
        )
      )
  AND (
        pr.city_name IS NULL
        OR (
            COALESCE(
                g.nom_mun,
                g.contacto_datos #>> '{ubicacion,nom_mun}',
                g.geo_city
            ) ILIKE '%' || pr.city_name || '%'
        )
      )
  AND (
        p_has_chat IS NULL
        OR (p_has_chat IS TRUE AND COALESCE(g.entrantes, 0) > 0)
        OR (p_has_chat IS FALSE AND COALESCE(g.entrantes, 0) = 0)
      )
  AND (
        pr.session_filter IS NULL
        OR g.session_id ILIKE '%' || pr.session_filter || '%'
      )
  AND (
        pr.ip_filter IS NULL
        OR COALESCE(g.ip, '') ILIKE '%' || pr.ip_filter || '%'
      )
  AND (
        pr.visit_min IS NULL
        OR COALESCE(g.visit_count, 0) >= pr.visit_min
      )
  AND (
        pr.visit_max IS NULL
        OR COALESCE(g.visit_count, 0) <= pr.visit_max
      )
  AND (
        pr.first_from IS NULL
        OR g.registrado_en >= pr.first_from
      )
  AND (
        pr.first_to IS NULL
        OR g.registrado_en <= pr.first_to
      )
  AND (
        pr.last_from IS NULL
        OR COALESCE(g.ultimo_evento_en, g.registrado_en) >= pr.last_from
      )
  AND (
        pr.last_to IS NULL
        OR COALESCE(g.ultimo_evento_en, g.registrado_en) <= pr.last_to
      )
  AND (
        pr.stay_min IS NULL
        OR g.duration_seconds >= pr.stay_min
      )
  AND (
        pr.stay_max IS NULL
        OR g.duration_seconds <= pr.stay_max
      )
  AND (
        pr.avg_stay_min IS NULL
        OR (
            CASE
                WHEN COALESCE(g.visit_count, 0) > 0
                    THEN g.duration_seconds / NULLIF(g.visit_count, 0)
                ELSE NULL
            END
        ) >= pr.avg_stay_min
      )
  AND (
        pr.avg_stay_max IS NULL
        OR (
            CASE
                WHEN COALESCE(g.visit_count, 0) > 0
                    THEN g.duration_seconds / NULLIF(g.visit_count, 0)
                ELSE NULL
            END
        ) <= pr.avg_stay_max
      )
  AND (
        pr.contact_status IS NULL
        OR pr.contact_status NOT IN ('completo', 'incompleto', 'sin', 'sin_contacto')
        OR (
            pr.contact_status = 'completo'
            AND (
                COALESCE(lower(g.captura_estado), '') = 'completo'
                OR (
                    COALESCE(btrim(g.correo), '') <> ''
                    AND COALESCE(btrim(g.telefono_e164), '') <> ''
                )
            )
        )
        OR (
            pr.contact_status = 'incompleto'
            AND COALESCE(lower(g.captura_estado), '') = 'incompleto'
        )
        OR (
            pr.contact_status IN ('sin', 'sin_contacto')
            AND g.contacto_ref IS NULL
        )
      )
  AND (
        pr.device_values IS NULL
        OR array_length(pr.device_values, 1) = 0
        OR UPPER(COALESCE(g.device_type, '')) = ANY(pr.device_values)
      )
  AND (
        pr.referrer_filter IS NULL
        OR COALESCE(g.referrer, '') ILIKE '%' || pr.referrer_filter || '%'
      )
  AND (
        pr.landing_filter IS NULL
        OR COALESCE(g.landing_url, '') ILIKE '%' || pr.landing_filter || '%'
      )
  AND (
        p_search IS NULL OR btrim(p_search) = '' OR
        (
            g.session_id ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.nombre_completo, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.correo, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.telefono_e164, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.referrer, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.landing_url, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(g.ip, '') ILIKE '%' || btrim(p_search) || '%'
        )
      )
)
SELECT r.*
FROM result r
CROSS JOIN params pr
ORDER BY
  CASE WHEN pr.order_by = 'session' AND pr.order_dir = 'asc' THEN r.session_id END ASC,
  CASE WHEN pr.order_by = 'session' AND pr.order_dir = 'desc' THEN r.session_id END DESC,
  CASE WHEN pr.order_by = 'ip' AND pr.order_dir = 'asc' THEN COALESCE(r.ip, '') END ASC,
  CASE WHEN pr.order_by = 'ip' AND pr.order_dir = 'desc' THEN COALESCE(r.ip, '') END DESC,
  CASE WHEN pr.order_by = 'visitas' AND pr.order_dir = 'asc' THEN COALESCE(r.total_visitas, 0) END ASC,
  CASE WHEN pr.order_by = 'visitas' AND pr.order_dir = 'desc' THEN COALESCE(r.total_visitas, 0) END DESC,
  CASE WHEN pr.order_by = 'primera' AND pr.order_dir = 'asc' THEN r.primera_visita_en END ASC,
  CASE WHEN pr.order_by = 'primera' AND pr.order_dir = 'desc' THEN r.primera_visita_en END DESC,
  CASE WHEN pr.order_by = 'ultimo' AND pr.order_dir = 'asc' THEN COALESCE(r.ultimo_evento_en, r.registrado_en) END ASC,
  CASE WHEN pr.order_by = 'ultimo' AND pr.order_dir = 'desc' THEN COALESCE(r.ultimo_evento_en, r.registrado_en) END DESC,
  CASE WHEN pr.order_by = 'stay' AND pr.order_dir = 'asc' THEN COALESCE(r.stay_seconds, 0) END ASC,
  CASE WHEN pr.order_by = 'stay' AND pr.order_dir = 'desc' THEN COALESCE(r.stay_seconds, 0) END DESC,
  CASE WHEN pr.order_by = 'avg_stay' AND pr.order_dir = 'asc' THEN COALESCE(r.avg_stay_seconds, 0) END ASC,
  CASE WHEN pr.order_by = 'avg_stay' AND pr.order_dir = 'desc' THEN COALESCE(r.avg_stay_seconds, 0) END DESC,
  CASE WHEN pr.order_by = 'chat' AND pr.order_dir = 'asc' THEN r.tuvo_chat END ASC,
  CASE WHEN pr.order_by = 'chat' AND pr.order_dir = 'desc' THEN r.tuvo_chat END DESC,
  CASE WHEN pr.order_by = 'country' AND pr.order_dir = 'asc' THEN COALESCE(r.country_name, '') END ASC,
  CASE WHEN pr.order_by = 'country' AND pr.order_dir = 'desc' THEN COALESCE(r.country_name, '') END DESC,
  CASE WHEN pr.order_by = 'state' AND pr.order_dir = 'asc' THEN COALESCE(r.state_name, '') END ASC,
  CASE WHEN pr.order_by = 'state' AND pr.order_dir = 'desc' THEN COALESCE(r.state_name, '') END DESC,
  CASE WHEN pr.order_by = 'city' AND pr.order_dir = 'asc' THEN COALESCE(r.city_name, '') END ASC,
  CASE WHEN pr.order_by = 'city' AND pr.order_dir = 'desc' THEN COALESCE(r.city_name, '') END DESC,
  CASE WHEN pr.order_by = 'device' AND pr.order_dir = 'asc' THEN COALESCE(r.device_type, '') END ASC,
  CASE WHEN pr.order_by = 'device' AND pr.order_dir = 'desc' THEN COALESCE(r.device_type, '') END DESC,
  CASE WHEN pr.order_by = 'referrer' AND pr.order_dir = 'asc' THEN COALESCE(r.referrer, '') END ASC,
  CASE WHEN pr.order_by = 'referrer' AND pr.order_dir = 'desc' THEN COALESCE(r.referrer, '') END DESC,
  CASE WHEN pr.order_by = 'landing' AND pr.order_dir = 'asc' THEN COALESCE(r.landing_url, '') END ASC,
  CASE WHEN pr.order_by = 'landing' AND pr.order_dir = 'desc' THEN COALESCE(r.landing_url, '') END DESC,
  COALESCE(r.ultimo_evento_en, r.registrado_en) DESC,
  r.session_id DESC
LIMIT COALESCE(NULLIF(p_limit, 0), 500)
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

GRANT EXECUTE ON FUNCTION public.panel_webchat_visitas_detalle(
    timestamptz,
    timestamptz,
    boolean,
    text,
    text,
    text,
    text,
    text,
    integer,
    integer,
    timestamptz,
    timestamptz,
    timestamptz,
    timestamptz,
    double precision,
    double precision,
    double precision,
    double precision,
    text,
    text[],
    text,
    text,
    text,
    text,
    text,
    integer,
    integer
)
    TO postgres,
       service_role;

COMMIT;
