BEGIN;

CREATE OR REPLACE VIEW public.v_google_places_contactables
WITH (security_invoker = true)
AS
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
    COALESCE(
        NULLIF(r.google_primary_type, ''),
        NULLIF(r.raw ->> 'google_primary_type', ''),
        NULLIF(r.raw #>> '{raw,primaryType}', ''),
        NULLIF(r.raw ->> 'primaryType', '')
    ) AS google_primary_type,
    COALESCE(
        NULLIF(r.google_primary_type_display_name, ''),
        NULLIF(r.raw ->> 'google_primary_type_display_name', ''),
        NULLIF(r.raw #>> '{raw,primaryTypeDisplayName,text}', ''),
        NULLIF(r.raw #>> '{raw,primaryTypeDisplayName}', ''),
        NULLIF(r.raw ->> 'primaryTypeDisplayName', '')
    ) AS google_primary_type_display_name,
    COALESCE(
        NULLIF(r.google_types, '{}'),
        CASE WHEN jsonb_typeof(r.raw -> 'google_types') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(r.raw -> 'google_types')) END,
        CASE WHEN jsonb_typeof(r.raw #> '{raw,types}') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(r.raw #> '{raw,types}')) END,
        CASE WHEN jsonb_typeof(r.raw -> 'types') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(r.raw -> 'types')) END,
        '{}'::text[]
    ) AS google_types,
    COALESCE(
        NULLIF(r.telefono_principal_e164, ''),
        NULLIF(r.phone_e164, ''),
        NULLIF(r.phone, ''),
        NULLIF(r.raw #>> '{internationalPhoneNumber}', ''),
        NULLIF(r.raw #>> '{nationalPhoneNumber}', '')
    ) AS phone,
    COALESCE(
        NULLIF(r.correo_principal, ''),
        NULLIF(r.email, ''),
        NULLIF(r.raw #>> '{email}', '')
    ) AS email,
    r.correo_principal,
    r.correo_secundario,
    r.telefono_principal_e164,
    r.telefono_principal_tipo_linea,
    r.telefono_principal_extension,
    r.telefono_movil_1_e164,
    r.telefono_movil_1_tipo_linea,
    COALESCE(
        NULLIF(r.website, ''),
        NULLIF(r.raw #>> '{websiteUri}', ''),
        NULLIF(r.raw #>> '{googleMapsUri}', '')
    ) AS website,
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
        WHEN b.centro IS NOT NULL AND r.geom IS NOT NULL
            THEN public.st_distance(b.centro, r.geom)
        ELSE NULL::double precision
    END AS distancia_m
FROM public.resultados r
JOIN public.busquedas b ON b.id = r.busqueda_id
WHERE r.fuente = 'google_places'::public.fuente_resultado;

REVOKE ALL ON public.v_google_places_contactables FROM anon, authenticated, service_role;
GRANT SELECT ON public.v_google_places_contactables TO authenticated, service_role;

COMMIT;
