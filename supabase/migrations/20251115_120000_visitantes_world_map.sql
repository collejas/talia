BEGIN;

CREATE OR REPLACE FUNCTION public.panel_visitantes_world_paises(
    p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_to timestamp with time zone DEFAULT NULL::timestamp with time zone
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH base AS (
    SELECT
        w.session_id,
        w.ultimo_evento_en,
        w.geo,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'country_code', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((w.geo -> 'client') ->> 'country_code', ''),
            NULLIF((w.geo -> 'client') ->> 'country', ''),
            NULLIF(w.geo ->> 'country_code', ''),
            NULLIF(w.geo ->> 'country', '')
        ) AS raw_country,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'country_name', ''),
            NULLIF((w.geo -> 'client') ->> 'country_name', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'country', ''),
            NULLIF((w.geo -> 'client') ->> 'country', '')
        ) AS raw_country_name,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'latitude', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'lat', ''),
            NULLIF((w.geo -> 'client') ->> 'latitude', ''),
            NULLIF((w.geo -> 'client') ->> 'lat', ''),
            NULLIF(w.geo ->> 'latitude', ''),
            NULLIF(w.geo ->> 'lat', '')
        ) AS raw_lat,
        COALESCE(
            NULLIF(w.geo -> 'ip_lookup' ->> 'longitude', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'lon', ''),
            NULLIF(w.geo -> 'ip_lookup' ->> 'lng', ''),
            NULLIF((w.geo -> 'client') ->> 'longitude', ''),
            NULLIF((w.geo -> 'client') ->> 'lon', ''),
            NULLIF((w.geo -> 'client') ->> 'lng', ''),
            NULLIF(w.geo ->> 'longitude', ''),
            NULLIF(w.geo ->> 'lon', ''),
            NULLIF(w.geo ->> 'lng', '')
        ) AS raw_lng
    FROM public.webchat_visitantes w
    WHERE (p_from IS NULL OR w.ultimo_evento_en >= p_from)
      AND (p_to IS NULL OR w.ultimo_evento_en <= p_to)
),
normalized AS (
    SELECT
        CASE
            WHEN raw_country IS NULL OR raw_country = '' THEN 'UNK'
            WHEN length(raw_country) = 2 THEN upper(raw_country)
            WHEN length(raw_country) = 3 AND raw_country ~ '^[A-Za-z]{3}$' THEN upper(raw_country)
            ELSE upper(substr(raw_country, 1, 2))
        END AS country_code,
        CASE
            WHEN raw_country_name IS NULL OR raw_country_name = '' THEN NULL
            ELSE raw_country_name
        END AS country_name,
        CASE
            WHEN raw_lat ~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN raw_lat::double precision
            ELSE NULL
        END AS lat,
        CASE
            WHEN raw_lng ~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN raw_lng::double precision
            ELSE NULL
        END AS lng
    FROM base
),
aggregated AS (
    SELECT
        country_code,
        COALESCE(
            MAX(country_name) FILTER (WHERE country_name IS NOT NULL AND country_name <> ''),
            country_code
        ) AS nombre,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL) AS with_coordinates,
        AVG(lat) AS avg_lat,
        AVG(lng) AS avg_lng
    FROM normalized
    GROUP BY country_code
),
summary AS (
    SELECT
        COALESCE(SUM(total), 0) AS total,
        COALESCE(SUM(total) FILTER (WHERE country_code <> 'UNK'), 0) AS ubicados,
        COALESCE(SUM(total) FILTER (WHERE country_code = 'UNK'), 0) AS sin_pais
    FROM aggregated
)
SELECT jsonb_build_object(
    'totals', jsonb_build_object(
        'total', summary.total,
        'ubicados', summary.ubicados,
        'sin_pais', summary.sin_pais
    ),
    'items', COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'country_code', agg.country_code,
                    'nombre', agg.nombre,
                    'total', agg.total,
                    'avg_lat', agg.avg_lat,
                    'avg_lng', agg.avg_lng,
                    'with_coordinates', agg.with_coordinates
                )
                ORDER BY agg.total DESC, agg.country_code
            )
            FROM aggregated agg
        ),
        '[]'::jsonb
    )
)
FROM summary;
$$;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_world_paises(timestamp with time zone, timestamp with time zone)
    TO postgres, service_role;

COMMIT;
