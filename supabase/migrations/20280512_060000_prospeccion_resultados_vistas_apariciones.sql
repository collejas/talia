BEGIN;

CREATE OR REPLACE VIEW public.v_denue_contactables
WITH (security_invoker = true) AS
SELECT *
FROM (
    SELECT
        r.id AS resultado_id,
        a.busqueda_id,
        r.fuente AS fuente_resultado,
        b.fuente AS fuente_busqueda,
        r.external_id,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
        r.name,
        r.razon_social,
        r.actividad,
        r.estrato,
        COALESCE(
            NULLIF(r.phone, ''::text),
            NULLIF((r.raw #>> '{Telefono}'::text[]), ''::text)
        ) AS phone,
        COALESCE(
            NULLIF(r.email, ''::text),
            NULLIF((r.raw #>> '{Correo_e}'::text[]), ''::text)
        ) AS email,
        COALESCE(
            NULLIF(r.website, ''::text),
            NULLIF((r.raw #>> '{Sitio_internet}'::text[]), ''::text)
        ) AS website,
        NULLIF(r.address, ''::text) AS address,
        r.lat,
        r.lng,
        r.geom,
        r.maps_url,
        a.first_seen_at AS resultado_creado_en,
        b.query AS busqueda_query,
        b.radio_m AS busqueda_radio_m,
        b.lat AS busqueda_lat,
        b.lng AS busqueda_lng,
        b.centro AS busqueda_centro,
        b.total_encontrados AS busqueda_total_encontrados,
        b.meta AS busqueda_meta,
        b.creado_en AS busqueda_creado_en,
        b.creado_por AS busqueda_creado_por,
        CASE
            WHEN b.centro IS NOT NULL AND r.geom IS NOT NULL THEN public.st_distance(b.centro, r.geom)
            ELSE NULL::double precision
        END AS distancia_m
    FROM public.prospeccion_resultado_apariciones a
    JOIN public.resultados r ON r.id = a.resultado_id
    JOIN public.busquedas b ON b.id = a.busqueda_id
    WHERE r.fuente = 'denue'::public.fuente_resultado

    UNION ALL

    SELECT
        r.id AS resultado_id,
        r.busqueda_id,
        r.fuente AS fuente_resultado,
        b.fuente AS fuente_busqueda,
        r.external_id,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
        r.name,
        r.razon_social,
        r.actividad,
        r.estrato,
        COALESCE(
            NULLIF(r.phone, ''::text),
            NULLIF((r.raw #>> '{Telefono}'::text[]), ''::text)
        ) AS phone,
        COALESCE(
            NULLIF(r.email, ''::text),
            NULLIF((r.raw #>> '{Correo_e}'::text[]), ''::text)
        ) AS email,
        COALESCE(
            NULLIF(r.website, ''::text),
            NULLIF((r.raw #>> '{Sitio_internet}'::text[]), ''::text)
        ) AS website,
        NULLIF(r.address, ''::text) AS address,
        r.lat,
        r.lng,
        r.geom,
        r.maps_url,
        r.creado_en AS resultado_creado_en,
        b.query AS busqueda_query,
        b.radio_m AS busqueda_radio_m,
        b.lat AS busqueda_lat,
        b.lng AS busqueda_lng,
        b.centro AS busqueda_centro,
        b.total_encontrados AS busqueda_total_encontrados,
        b.meta AS busqueda_meta,
        b.creado_en AS busqueda_creado_en,
        b.creado_por AS busqueda_creado_por,
        CASE
            WHEN b.centro IS NOT NULL AND r.geom IS NOT NULL THEN public.st_distance(b.centro, r.geom)
            ELSE NULL::double precision
        END AS distancia_m
    FROM public.resultados r
    JOIN public.busquedas b ON b.id = r.busqueda_id
    WHERE r.fuente = 'denue'::public.fuente_resultado
      AND NOT EXISTS (
          SELECT 1
          FROM public.prospeccion_resultado_apariciones a
          WHERE a.resultado_id = r.id
            AND a.busqueda_id = r.busqueda_id
      )
) denue_contactables;

COMMENT ON VIEW public.v_denue_contactables IS
    'Resultados de búsquedas DENUE listos para contactabilidad y mapa.';

GRANT SELECT ON public.v_denue_contactables TO postgres, service_role, authenticated;

CREATE OR REPLACE VIEW public.v_google_places_contactables
WITH (security_invoker = true) AS
SELECT *
FROM (
    SELECT
        r.id AS resultado_id,
        a.busqueda_id,
        r.fuente AS fuente_resultado,
        b.fuente AS fuente_busqueda,
        r.external_id,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
        r.name,
        r.razon_social,
        r.actividad,
        r.estrato,
        (r.raw ->> 'primaryType') AS google_primary_type,
        (r.raw ->> 'primaryTypeDisplayName') AS google_primary_type_display_name,
        COALESCE(types.google_types, ARRAY[]::text[]) AS google_types,
        COALESCE(
            NULLIF(r.phone, ''::text),
            NULLIF((r.raw #>> '{internationalPhoneNumber}'::text[]), ''::text),
            NULLIF((r.raw #>> '{nationalPhoneNumber}'::text[]), ''::text)
        ) AS phone,
        COALESCE(
            NULLIF(r.email, ''::text),
            NULLIF((r.raw #>> '{email}'::text[]), ''::text)
        ) AS email,
        COALESCE(
            NULLIF(r.website, ''::text),
            NULLIF((r.raw #>> '{websiteUri}'::text[]), ''::text),
            NULLIF((r.raw #>> '{googleMapsUri}'::text[]), ''::text)
        ) AS website,
        NULLIF(r.address, ''::text) AS address,
        r.lat,
        r.lng,
        r.geom,
        r.rating,
        r.reviews,
        r.maps_url,
        a.first_seen_at AS resultado_creado_en,
        b.query AS busqueda_query,
        b.radio_m AS busqueda_radio_m,
        b.lat AS busqueda_lat,
        b.lng AS busqueda_lng,
        b.centro AS busqueda_centro,
        b.total_encontrados AS busqueda_total_encontrados,
        b.meta AS busqueda_meta,
        b.creado_en AS busqueda_creado_en,
        b.creado_por AS busqueda_creado_por,
        CASE
            WHEN b.centro IS NOT NULL AND r.geom IS NOT NULL THEN public.st_distance(b.centro, r.geom)
            ELSE NULL::double precision
        END AS distancia_m
    FROM public.prospeccion_resultado_apariciones a
    JOIN public.resultados r ON r.id = a.resultado_id
    JOIN public.busquedas b ON b.id = a.busqueda_id
    LEFT JOIN LATERAL (
        SELECT COALESCE(array_agg(value.value), ARRAY[]::text[]) AS google_types
        FROM jsonb_array_elements_text(COALESCE(r.raw -> 'types', '[]'::jsonb)) value(value)
    ) types ON TRUE
    WHERE r.fuente = 'google_places'::public.fuente_resultado

    UNION ALL

    SELECT
        r.id AS resultado_id,
        r.busqueda_id,
        r.fuente AS fuente_resultado,
        b.fuente AS fuente_busqueda,
        r.external_id,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
        r.name,
        r.razon_social,
        r.actividad,
        r.estrato,
        (r.raw ->> 'primaryType') AS google_primary_type,
        (r.raw ->> 'primaryTypeDisplayName') AS google_primary_type_display_name,
        COALESCE(types.google_types, ARRAY[]::text[]) AS google_types,
        COALESCE(
            NULLIF(r.phone, ''::text),
            NULLIF((r.raw #>> '{internationalPhoneNumber}'::text[]), ''::text),
            NULLIF((r.raw #>> '{nationalPhoneNumber}'::text[]), ''::text)
        ) AS phone,
        COALESCE(
            NULLIF(r.email, ''::text),
            NULLIF((r.raw #>> '{email}'::text[]), ''::text)
        ) AS email,
        COALESCE(
            NULLIF(r.website, ''::text),
            NULLIF((r.raw #>> '{websiteUri}'::text[]), ''::text),
            NULLIF((r.raw #>> '{googleMapsUri}'::text[]), ''::text)
        ) AS website,
        NULLIF(r.address, ''::text) AS address,
        r.lat,
        r.lng,
        r.geom,
        r.rating,
        r.reviews,
        r.maps_url,
        r.creado_en AS resultado_creado_en,
        b.query AS busqueda_query,
        b.radio_m AS busqueda_radio_m,
        b.lat AS busqueda_lat,
        b.lng AS busqueda_lng,
        b.centro AS busqueda_centro,
        b.total_encontrados AS busqueda_total_encontrados,
        b.meta AS busqueda_meta,
        b.creado_en AS busqueda_creado_en,
        b.creado_por AS busqueda_creado_por,
        CASE
            WHEN b.centro IS NOT NULL AND r.geom IS NOT NULL THEN public.st_distance(b.centro, r.geom)
            ELSE NULL::double precision
        END AS distancia_m
    FROM public.resultados r
    JOIN public.busquedas b ON b.id = r.busqueda_id
    LEFT JOIN LATERAL (
        SELECT COALESCE(array_agg(value.value), ARRAY[]::text[]) AS google_types
        FROM jsonb_array_elements_text(COALESCE(r.raw -> 'types', '[]'::jsonb)) value(value)
    ) types ON TRUE
    WHERE r.fuente = 'google_places'::public.fuente_resultado
      AND NOT EXISTS (
          SELECT 1
          FROM public.prospeccion_resultado_apariciones a
          WHERE a.resultado_id = r.id
            AND a.busqueda_id = r.busqueda_id
      )
) google_contactables;

COMMENT ON VIEW public.v_google_places_contactables IS
    'Resultados de búsquedas Google Places listos para contactabilidad (teléfono, web, tipo, radio y distancia al centro).';

GRANT SELECT ON public.v_google_places_contactables TO postgres, service_role, authenticated;

CREATE OR REPLACE VIEW public.v_resultados_unificados
WITH (security_invoker = true) AS
SELECT *
FROM (
    SELECT
        r.id,
        a.busqueda_id,
        b.fuente AS fuente_busqueda,
        r.fuente AS fuente_resultado,
        r.external_id,
        r.clee,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
        r.name,
        r.razon_social,
        r.actividad,
        r.estrato,
        r.phone,
        r.email,
        r.website,
        r.address,
        r.lat,
        r.lng,
        r.rating,
        r.reviews,
        r.maps_url,
        a.first_seen_at AS creado_en
    FROM public.prospeccion_resultado_apariciones a
    JOIN public.resultados r ON r.id = a.resultado_id
    JOIN public.busquedas b ON b.id = a.busqueda_id

    UNION ALL

    SELECT
        r.id,
        r.busqueda_id,
        b.fuente AS fuente_busqueda,
        r.fuente AS fuente_resultado,
        r.external_id,
        r.clee,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS display_name,
        r.name,
        r.razon_social,
        r.actividad,
        r.estrato,
        r.phone,
        r.email,
        r.website,
        r.address,
        r.lat,
        r.lng,
        r.rating,
        r.reviews,
        r.maps_url,
        r.creado_en AS creado_en
    FROM public.resultados r
    JOIN public.busquedas b ON b.id = r.busqueda_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.prospeccion_resultado_apariciones a
        WHERE a.resultado_id = r.id
          AND a.busqueda_id = r.busqueda_id
    )
) resultados_unificados;

COMMENT ON VIEW public.v_resultados_unificados IS
    'Resultados unificados por busqueda, leyendo la tabla puente de apariciones cuando existe.';

GRANT SELECT ON public.v_resultados_unificados TO postgres, service_role, authenticated;

COMMIT;
