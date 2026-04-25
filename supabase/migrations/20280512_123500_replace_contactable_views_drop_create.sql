BEGIN;

DROP VIEW IF EXISTS public.v_denue_contactables CASCADE;
DROP VIEW IF EXISTS public.v_google_places_contactables CASCADE;

CREATE VIEW public.v_denue_contactables
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
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial,
        r.actividad,
        r.estrato,
        NULLIF(r.phone, ''::text) AS phone,
        NULLIF(r.email, ''::text) AS email,
        NULLIF(r.website, ''::text) AS website,
        NULLIF(r.address, ''::text) AS address,
        NULLIF(r.address_full, ''::text) AS address_full,
        r.tipo_vialidad,
        r.nombre_vialidad,
        r.numero_exterior,
        r.numero_interior,
        r.colonia,
        r.codigo_postal,
        r.estado_cve,
        r.estado_nombre,
        r.municipio_cve,
        r.municipio_nombre,
        r.localidad_cve,
        r.localidad,
        r.cvegeo,
        r.asentamiento,
        r.entre_calles,
        r.referencia,
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
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial,
        r.actividad,
        r.estrato,
        NULLIF(r.phone, ''::text) AS phone,
        NULLIF(r.email, ''::text) AS email,
        NULLIF(r.website, ''::text) AS website,
        NULLIF(r.address, ''::text) AS address,
        NULLIF(r.address_full, ''::text) AS address_full,
        r.tipo_vialidad,
        r.nombre_vialidad,
        r.numero_exterior,
        r.numero_interior,
        r.colonia,
        r.codigo_postal,
        r.estado_cve,
        r.estado_nombre,
        r.municipio_cve,
        r.municipio_nombre,
        r.localidad_cve,
        r.localidad,
        r.cvegeo,
        r.asentamiento,
        r.entre_calles,
        r.referencia,
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

CREATE VIEW public.v_google_places_contactables
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
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial,
        r.actividad,
        r.estrato,
        r.google_primary_type,
        r.google_primary_type_display_name,
        COALESCE(r.google_types, ARRAY[]::text[]) AS google_types,
        NULLIF(r.phone, ''::text) AS phone,
        NULLIF(r.email, ''::text) AS email,
        NULLIF(r.website, ''::text) AS website,
        NULLIF(r.address, ''::text) AS address,
        NULLIF(r.address_full, ''::text) AS address_full,
        r.tipo_vialidad,
        r.nombre_vialidad,
        r.numero_exterior,
        r.numero_interior,
        r.colonia,
        r.codigo_postal,
        r.estado_cve,
        r.estado_nombre,
        r.municipio_cve,
        r.municipio_nombre,
        r.localidad_cve,
        r.localidad,
        r.cvegeo,
        r.asentamiento,
        r.entre_calles,
        r.referencia,
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
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial,
        r.actividad,
        r.estrato,
        r.google_primary_type,
        r.google_primary_type_display_name,
        COALESCE(r.google_types, ARRAY[]::text[]) AS google_types,
        NULLIF(r.phone, ''::text) AS phone,
        NULLIF(r.email, ''::text) AS email,
        NULLIF(r.website, ''::text) AS website,
        NULLIF(r.address, ''::text) AS address,
        NULLIF(r.address_full, ''::text) AS address_full,
        r.tipo_vialidad,
        r.nombre_vialidad,
        r.numero_exterior,
        r.numero_interior,
        r.colonia,
        r.codigo_postal,
        r.estado_cve,
        r.estado_nombre,
        r.municipio_cve,
        r.municipio_nombre,
        r.localidad_cve,
        r.localidad,
        r.cvegeo,
        r.asentamiento,
        r.entre_calles,
        r.referencia,
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
    WHERE r.fuente = 'google_places'::public.fuente_resultado
      AND NOT EXISTS (
          SELECT 1
          FROM public.prospeccion_resultado_apariciones a
          WHERE a.resultado_id = r.id
            AND a.busqueda_id = r.busqueda_id
      )
) google_contactables;

GRANT SELECT ON public.v_denue_contactables TO postgres, service_role, authenticated;
GRANT SELECT ON public.v_google_places_contactables TO postgres, service_role, authenticated;

COMMIT;"}]
