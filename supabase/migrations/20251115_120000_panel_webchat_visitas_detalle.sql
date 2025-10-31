BEGIN;

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
    registrado_en timestamptz,
    ultimo_evento_en timestamptz,
    closed_at timestamptz,
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
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text,
    ubicacion_cache jsonb,
    ip text,
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
        w.landing_url
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
)
SELECT
    b.session_id,
    b.registrado_en,
    b.ultimo_evento_en,
    b.closed_at,
    COALESCE(b.visit_count, 0) AS visit_count,
    COALESCE(m.entrantes, 0) > 0 AS tuvo_chat,
    COALESCE(m.entrantes, 0) AS mensajes_entrantes,
    COALESCE(m.salientes, 0) AS mensajes_salientes,
    m.primer_mensaje_en,
    m.ultimo_mensaje_en AS ultimo_mensaje_conversacion,
    ct.id AS contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.correo AS contacto_correo,
    ct.telefono_e164 AS contacto_telefono,
    ct.company_name AS contacto_empresa,
    ct.estado AS contacto_estado,
    ct.captura_estado AS contacto_captura,
    ct.creado_en AS contacto_creado_en,
    COALESCE(b.cve_ent,
        NULLIF(ct.contacto_datos #>> '{ubicacion,cve_ent}', ''),
        NULLIF(ct.contacto_datos #>> '{cve_ent}', '')
    ) AS cve_ent,
    COALESCE(b.nom_ent,
        NULLIF(ct.contacto_datos #>> '{ubicacion,nom_ent}', ''),
        NULLIF(ct.contacto_datos #>> '{nom_ent}', '')
    ) AS nom_ent,
    COALESCE(b.cve_mun,
        NULLIF(ct.contacto_datos #>> '{ubicacion,cve_mun}', ''),
        NULLIF(ct.contacto_datos #>> '{cve_mun}', '')
    ) AS cve_mun,
    COALESCE(b.nom_mun,
        NULLIF(ct.contacto_datos #>> '{ubicacion,nom_mun}', ''),
        NULLIF(ct.contacto_datos #>> '{nom_mun}', '')
    ) AS nom_mun,
    COALESCE(b.cvegeo,
        NULLIF(ct.contacto_datos #>> '{ubicacion,cvegeo}', ''),
        NULLIF(ct.contacto_datos #>> '{cvegeo}', '')
    ) AS cvegeo,
    ct.contacto_datos -> 'ubicacion' AS ubicacion_cache,
    b.ip,
    b.device_type,
    ct.contacto_datos -> 'dispositivo' AS dispositivo_cache,
    (ct.contacto_datos -> 'dispositivo' -> 'pantalla') AS pantalla_cache,
    NULLIF(ct.contacto_datos #>> '{dispositivo,plataforma}', '') AS sistema_operativo,
    NULLIF(ct.contacto_datos #>> '{dispositivo,idioma}', '') AS idioma,
    NULLIF(ct.contacto_datos #>> '{dispositivo,timezone}', '') AS timezone,
    CASE
        WHEN (ct.contacto_datos #>> '{dispositivo,prefiere_modo_oscuro}') IN ('true', '1') THEN true
        WHEN (ct.contacto_datos #>> '{dispositivo,prefiere_modo_oscuro}') IN ('false', '0') THEN false
        ELSE NULL
    END AS prefiere_modo_oscuro,
    COALESCE(b.referrer, NULLIF(ct.contacto_datos #>> '{trazabilidad,referrer}', '')) AS referrer,
    COALESCE(b.landing_url, NULLIF(ct.contacto_datos #>> '{trazabilidad,landing}', '')) AS landing_url,
    ct.contacto_datos -> 'trazabilidad' AS trazabilidad_cache,
    b.geo,
    COUNT(*) OVER () AS total_rows,
    COUNT(*) FILTER (WHERE COALESCE(m.entrantes, 0) > 0) OVER () AS total_chat_rows,
    COUNT(*) FILTER (WHERE COALESCE(m.entrantes, 0) = 0) OVER () AS total_no_chat_rows
FROM base b
LEFT JOIN messages m ON m.session_id = b.session_id
LEFT JOIN contacts ct ON ct.id = b.contacto_id
CROSS JOIN state_param sp
WHERE (p_from IS NULL OR COALESCE(b.ultimo_evento_en, b.registrado_en) >= p_from)
  AND (p_to IS NULL OR COALESCE(b.ultimo_evento_en, b.registrado_en) <= p_to)
  AND (
        sp.code IS NULL
        OR COALESCE(b.cve_ent,
                    NULLIF(ct.contacto_datos #>> '{ubicacion,cve_ent}', ''),
                    NULLIF(ct.contacto_datos #>> '{cve_ent}', '')
           ) = sp.code
      )
  AND (
        p_has_chat IS NULL
        OR (p_has_chat IS TRUE AND COALESCE(m.entrantes, 0) > 0)
        OR (p_has_chat IS FALSE AND COALESCE(m.entrantes, 0) = 0)
      )
  AND (
        p_search IS NULL OR btrim(p_search) = '' OR
        (
            b.session_id ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(ct.nombre_completo, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(ct.correo, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(ct.telefono_e164, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(b.referrer, '') ILIKE '%' || btrim(p_search) || '%' OR
            COALESCE(b.landing_url, '') ILIKE '%' || btrim(p_search) || '%'
        )
      )
ORDER BY COALESCE(b.ultimo_evento_en, b.registrado_en) DESC, b.session_id
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
