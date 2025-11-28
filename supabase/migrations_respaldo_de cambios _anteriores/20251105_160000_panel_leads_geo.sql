BEGIN;

CREATE OR REPLACE FUNCTION public.panel_leads_geo_base(
    p_canales text DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE (
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
    leads AS (
        SELECT
            lt.contacto_id,
            lower(COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, ''))) AS canal,
            lt.creado_en,
            ct.contacto_datos
        FROM public.lead_tarjetas lt
        JOIN public.contactos ct ON ct.id = lt.contacto_id
        LEFT JOIN public.conversaciones conv ON conv.id = lt.conversacion_id
        WHERE (p_from IS NULL OR lt.creado_en >= p_from)
          AND (p_to IS NULL OR lt.creado_en <= p_to)
          AND (
            (SELECT canales FROM params) IS NULL
            OR lower(COALESCE(NULLIF(lt.canal, ''), NULLIF(conv.canal, ''))) = ANY (COALESCE((SELECT canales FROM params), ARRAY[]::text[]))
          )
    )
    SELECT
        l.contacto_id,
        CASE WHEN l.canal IS NULL OR l.canal = '' THEN 'desconocido' ELSE l.canal END AS canal,
        loc.cve_ent,
        loc.nom_ent,
        loc.cve_mun,
        loc.nom_mun,
        loc.cvegeo
    FROM leads l
    LEFT JOIN LATERAL (
        WITH raw AS (
            SELECT
                NULLIF(l.contacto_datos #>> '{ubicacion,cve_ent}', '') AS u_cve_ent,
                NULLIF(l.contacto_datos #>> '{ubicacion,nom_ent}', '') AS u_nom_ent,
                NULLIF(l.contacto_datos #>> '{ubicacion,cve_mun}', '') AS u_cve_mun,
                NULLIF(l.contacto_datos #>> '{ubicacion,nom_mun}', '') AS u_nom_mun,
                NULLIF(l.contacto_datos #>> '{ubicacion,cvegeo}', '') AS u_cvegeo,
                NULLIF(l.contacto_datos #>> '{cve_ent}', '') AS d_cve_ent,
                NULLIF(l.contacto_datos #>> '{nom_ent}', '') AS d_nom_ent,
                NULLIF(l.contacto_datos #>> '{cve_mun}', '') AS d_cve_mun,
                NULLIF(l.contacto_datos #>> '{nom_mun}', '') AS d_nom_mun,
                NULLIF(l.contacto_datos #>> '{cvegeo}', '') AS d_cvegeo
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

GRANT EXECUTE ON FUNCTION public.panel_leads_geo_base(text, timestamptz, timestamptz)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.panel_leads_geo_estados(
    p_canales text DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH base AS (
        SELECT * FROM public.panel_leads_geo_base(p_canales, p_from, p_to)
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cve_ent IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cve_ent IS NULL) AS sin_ubicacion
        FROM base
    ),
    per_state AS (
        SELECT
            b.cve_ent,
            MAX(b.nom_ent) AS nombre,
            SUM(b.total_por_canal) AS total,
            jsonb_object_agg(b.canal, b.total_por_canal ORDER BY b.canal) AS por_canal
        FROM (
            SELECT cve_ent, nom_ent, canal, COUNT(*) AS total_por_canal
            FROM base
            WHERE cve_ent IS NOT NULL
            GROUP BY cve_ent, nom_ent, canal
        ) b
        GROUP BY b.cve_ent
    )
    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'total', COALESCE((SELECT total FROM summary), 0),
            'ubicados', COALESCE((SELECT ubicados FROM summary), 0),
            'sin_ubicacion', COALESCE((SELECT sin_ubicacion FROM summary), 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cve_ent', per_state.cve_ent,
                        'nombre', per_state.nombre,
                        'total', per_state.total,
                        'por_canal', per_state.por_canal
                    )
                    ORDER BY per_state.cve_ent
                ),
                '[]'::jsonb
            )
            FROM per_state
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.panel_leads_geo_estados(text, timestamptz, timestamptz)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.panel_leads_geo_municipios(
    p_estado text,
    p_canales text DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH state_code AS (
        SELECT CASE
            WHEN p_estado IS NULL THEN NULL
            ELSE LPAD(REGEXP_REPLACE(p_estado, '\\D', '', 'g'), 2, '0')
        END AS code
    ),
    base AS (
        SELECT b.*
        FROM public.panel_leads_geo_base(p_canales, p_from, p_to) b
        JOIN state_code s ON (s.code IS NOT NULL AND b.cve_ent = s.code)
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cvegeo IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cvegeo IS NULL) AS sin_ubicacion
        FROM base
    ),
    per_municipio AS (
        SELECT
            b.cvegeo,
            MAX(b.nom_mun) AS nombre,
            SUM(b.total_por_canal) AS total,
            jsonb_object_agg(b.canal, b.total_por_canal ORDER BY b.canal) AS por_canal
        FROM (
            SELECT cvegeo, nom_mun, canal, COUNT(*) AS total_por_canal
            FROM base
            WHERE cvegeo IS NOT NULL
            GROUP BY cvegeo, nom_mun, canal
        ) b
        GROUP BY b.cvegeo
    ),
    estado_info AS (
        SELECT
            MAX(cve_ent) AS cve_ent,
            MAX(nom_ent) AS nombre
        FROM base
    )
    SELECT jsonb_build_object(
        'estado', jsonb_build_object(
            'cve_ent', COALESCE((SELECT cve_ent FROM estado_info), (SELECT code FROM state_code)),
            'nombre', (SELECT nombre FROM estado_info)
        ),
        'totals', jsonb_build_object(
            'total', COALESCE((SELECT total FROM summary), 0),
            'ubicados', COALESCE((SELECT ubicados FROM summary), 0),
            'sin_ubicacion', COALESCE((SELECT sin_ubicacion FROM summary), 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cvegeo', per_municipio.cvegeo,
                        'nombre', per_municipio.nombre,
                        'total', per_municipio.total,
                        'por_canal', per_municipio.por_canal
                    )
                    ORDER BY per_municipio.cvegeo
                ),
                '[]'::jsonb
            )
            FROM per_municipio
        )
    )
    FROM state_code;
$$;

GRANT EXECUTE ON FUNCTION public.panel_leads_geo_municipios(text, text, timestamptz, timestamptz)
    TO postgres, service_role;

COMMIT;
