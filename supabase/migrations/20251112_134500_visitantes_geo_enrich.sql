BEGIN;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_base(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    session_id text,
    closed_at timestamptz,
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
    WITH closures AS (
        SELECT sc.session_id, sc.closed_at
        FROM public.webchat_session_closures sc
        WHERE (p_from IS NULL OR sc.closed_at >= p_from)
          AND (p_to IS NULL OR sc.closed_at <= p_to)
    ),
    filtered AS (
        SELECT c.session_id, c.closed_at
        FROM closures c
        LEFT JOIN public.mensajes m
          ON m.datos ->> 'session_id' = c.session_id
         AND m.direccion = 'entrante'
        WHERE m.id IS NULL
    )
    SELECT
        f.session_id,
        f.closed_at,
        COALESCE(
            NULLIF(v.cve_ent, ''),
            NULLIF(c.cve_ent, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 2
                    THEN substr(v.cvegeo_digits, 1, 2)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 2
                    THEN substr(c.cvegeo_digits, 1, 2)
                ELSE NULL
            END
        ) AS cve_ent,
        COALESCE(NULLIF(v.nom_ent, ''), NULLIF(c.nom_ent, '')) AS nom_ent,
        COALESCE(
            NULLIF(v.cve_mun, ''),
            NULLIF(c.cve_mun, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 5
                    THEN substr(v.cvegeo_digits, 3, 3)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 5
                    THEN substr(c.cvegeo_digits, 3, 3)
                ELSE NULL
            END
        ) AS cve_mun,
        COALESCE(NULLIF(v.nom_mun, ''), NULLIF(c.nom_mun, '')) AS nom_mun,
        COALESCE(
            NULLIF(v.cvegeo, ''),
            NULLIF(c.cvegeo, ''),
            CASE
                WHEN v.cvegeo_digits IS NOT NULL AND length(v.cvegeo_digits) >= 5
                    THEN substr(v.cvegeo_digits, 1, 5)
                WHEN c.cvegeo_digits IS NOT NULL AND length(c.cvegeo_digits) >= 5
                    THEN substr(c.cvegeo_digits, 1, 5)
                WHEN v.cve_ent IS NOT NULL AND v.cve_mun IS NOT NULL
                    THEN v.cve_ent || v.cve_mun
                WHEN c.cve_ent IS NOT NULL AND c.cve_mun IS NOT NULL
                    THEN c.cve_ent || c.cve_mun
                ELSE NULL
            END
        ) AS cvegeo
    FROM filtered f
    LEFT JOIN LATERAL (
        SELECT
            w.contacto_id,
            w.cve_ent,
            w.nom_ent,
            w.cve_mun,
            w.nom_mun,
            w.cvegeo,
            REGEXP_REPLACE(COALESCE(w.cvegeo, ''), '\\D', '', 'g') AS cvegeo_digits
        FROM public.webchat_visitantes w
        WHERE w.session_id = f.session_id
        LIMIT 1
    ) v ON TRUE
    LEFT JOIN LATERAL (
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
                    THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
                        || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
                ELSE NULL
            END AS cvegeo,
            REGEXP_REPLACE(
                COALESCE(val_cvegeo,
                    CASE
                        WHEN val_cve_ent IS NOT NULL AND val_cve_mun IS NOT NULL
                            THEN LPAD(REGEXP_REPLACE(val_cve_ent, '\\D', '', 'g'), 2, '0')
                                || LPAD(REGEXP_REPLACE(val_cve_mun, '\\D', '', 'g'), 3, '0')
                        ELSE NULL
                    END
                ),
                '\\D',
                '',
                'g'
            ) AS cvegeo_digits
        FROM (
            SELECT
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,cve_ent}', ''),
                    NULLIF(cd #>> '{cve_ent}', '')
                ) AS val_cve_ent,
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,nom_ent}', ''),
                    NULLIF(cd #>> '{nom_ent}', '')
                ) AS val_nom_ent,
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,cve_mun}', ''),
                    NULLIF(cd #>> '{cve_mun}', '')
                ) AS val_cve_mun,
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,nom_mun}', ''),
                    NULLIF(cd #>> '{nom_mun}', '')
                ) AS val_nom_mun,
                COALESCE(
                    NULLIF(cd #>> '{ubicacion,cvegeo}', ''),
                    NULLIF(cd #>> '{cvegeo}', '')
                ) AS val_cvegeo
            FROM (
                SELECT contacto_datos AS cd
                FROM public.contactos
                WHERE id = v.contacto_id
                LIMIT 1
            ) raw
        ) merged
    ) c ON TRUE;
$$;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_estados(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH base AS (
        SELECT * FROM public.panel_visitantes_sin_chat_base(p_from, p_to)
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cve_ent IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cve_ent IS NULL) AS sin_ubicacion
        FROM base
    ),
    grouped AS (
        SELECT
            cve_ent,
            MAX(nom_ent) AS nombre,
            COUNT(*) AS total
        FROM base
        WHERE cve_ent IS NOT NULL
        GROUP BY cve_ent
    )
    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'total', COALESCE(summary.total, 0),
            'ubicados', COALESCE(summary.ubicados, 0),
            'sin_ubicacion', COALESCE(summary.sin_ubicacion, 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cve_ent', grouped.cve_ent,
                        'nombre', grouped.nombre,
                        'total', grouped.total,
                        'por_canal', jsonb_build_object('visitantes', grouped.total)
                    )
                    ORDER BY grouped.cve_ent
                ),
                '[]'::jsonb
            )
            FROM grouped
        )
    )
    FROM summary;
$$;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_municipios(
    p_estado text,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH state_code AS (
        SELECT LPAD(REGEXP_REPLACE(COALESCE(p_estado, ''), '\\D', '', 'g'), 2, '0') AS code
    ),
    base AS (
        SELECT b.*
        FROM public.panel_visitantes_sin_chat_base(p_from, p_to) b
        JOIN state_code s ON b.cve_ent = s.code
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cvegeo IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cvegeo IS NULL) AS sin_ubicacion
        FROM base
    ),
    grouped AS (
        SELECT
            cvegeo,
            MAX(nom_mun) AS nombre,
            COUNT(*) AS total
        FROM base
        WHERE cvegeo IS NOT NULL
        GROUP BY cvegeo
    ),
    estado_info AS (
        SELECT MAX(cve_ent) AS cve_ent, MAX(nom_ent) AS nombre FROM base
    )
    SELECT jsonb_build_object(
        'estado', jsonb_build_object(
            'cve_ent', COALESCE((SELECT cve_ent FROM estado_info), (SELECT code FROM state_code)),
            'nombre', (SELECT nombre FROM estado_info)
        ),
        'totals', jsonb_build_object(
            'total', COALESCE(summary.total, 0),
            'ubicados', COALESCE(summary.ubicados, 0),
            'sin_ubicacion', COALESCE(summary.sin_ubicacion, 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cvegeo', grouped.cvegeo,
                        'nombre', grouped.nombre,
                        'total', grouped.total,
                        'por_canal', jsonb_build_object('visitantes', grouped.total)
                    )
                    ORDER BY grouped.cvegeo
                ),
                '[]'::jsonb
            )
            FROM grouped
        )
    )
    FROM summary, state_code;
$$;

COMMIT;
