BEGIN;

CREATE OR REPLACE VIEW public.v_google_places_contactables AS
SELECT
    r.id AS resultado_id,
    r.busqueda_id,
    r.fuente AS fuente_resultado,
    b.fuente AS fuente_busqueda,
    r.external_id,
    COALESCE(NULLIF(r.name, ''), NULLIF(r.razon_social, '')) AS display_name,
    r.name,
    r.razon_social,
    r.actividad,
    r.estrato,
    r.raw ->> 'primaryType' AS google_primary_type,
    r.raw ->> 'primaryTypeDisplayName' AS google_primary_type_display_name,
    COALESCE(types.google_types, ARRAY[]::text[]) AS google_types,
    COALESCE(NULLIF(r.phone, ''),
             NULLIF(r.raw #>> '{internationalPhoneNumber}', ''),
             NULLIF(r.raw #>> '{nationalPhoneNumber}', '')) AS phone,
    COALESCE(NULLIF(r.email, ''), NULLIF(r.raw #>> '{email}', '')) AS email,
    COALESCE(NULLIF(r.website, ''),
             NULLIF(r.raw #>> '{websiteUri}', ''),
             NULLIF(r.raw #>> '{googleMapsUri}', '')) AS website,
    NULLIF(r.address, '') AS address,
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
        WHEN b.centro IS NOT NULL AND r.geom IS NOT NULL THEN ST_Distance(b.centro, r.geom)
        ELSE NULL
    END AS distancia_m
FROM public.resultados r
JOIN public.busquedas b ON b.id = r.busqueda_id
LEFT JOIN LATERAL (
    SELECT COALESCE(array_agg(value), ARRAY[]::text[]) AS google_types
    FROM jsonb_array_elements_text(COALESCE(r.raw->'types', '[]'::jsonb)) AS value
) AS types ON TRUE
WHERE r.fuente = 'google_places';

COMMENT ON VIEW public.v_google_places_contactables IS 'Resultados de búsquedas Google Places listos para contactabilidad (teléfono, web, tipo, radio y distancia al centro).';

GRANT SELECT ON public.v_google_places_contactables TO postgres, service_role, authenticated;

COMMIT;
