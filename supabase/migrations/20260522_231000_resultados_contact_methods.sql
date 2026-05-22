BEGIN;

ALTER TABLE public.resultados
    ADD COLUMN IF NOT EXISTS correo_principal text,
    ADD COLUMN IF NOT EXISTS correo_secundario text,
    ADD COLUMN IF NOT EXISTS phone_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_principal_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_principal_tipo_linea text,
    ADD COLUMN IF NOT EXISTS telefono_principal_extension text,
    ADD COLUMN IF NOT EXISTS telefono_movil_1_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_movil_1_tipo_linea text;

UPDATE public.resultados
SET
    correo_principal = COALESCE(NULLIF(btrim(correo_principal), ''), NULLIF(btrim(email), ''), NULLIF(btrim(raw ->> 'email'), '')),
    correo_secundario = NULLIF(btrim(correo_secundario), ''),
    telefono_principal_e164 = COALESCE(
        NULLIF(btrim(telefono_principal_e164), ''),
        NULLIF(btrim(phone_e164), ''),
        NULLIF(btrim(phone), ''),
        NULLIF(btrim(raw ->> 'internationalPhoneNumber'), ''),
        NULLIF(btrim(raw ->> 'nationalPhoneNumber'), ''),
        NULLIF(btrim(raw ->> 'Telefono'), '')
    ),
    telefono_principal_tipo_linea = NULLIF(btrim(telefono_principal_tipo_linea), ''),
    telefono_principal_extension = NULLIF(btrim(telefono_principal_extension), ''),
    telefono_movil_1_e164 = COALESCE(
        NULLIF(btrim(telefono_movil_1_e164), ''),
        NULLIF(btrim(telefono_principal_e164), ''),
        NULLIF(btrim(phone_e164), ''),
        NULLIF(btrim(phone), ''),
        NULLIF(btrim(raw ->> 'internationalPhoneNumber'), ''),
        NULLIF(btrim(raw ->> 'nationalPhoneNumber'), ''),
        NULLIF(btrim(raw ->> 'Telefono'), '')
    ),
    telefono_movil_1_tipo_linea = NULLIF(btrim(telefono_movil_1_tipo_linea), ''),
    email = COALESCE(NULLIF(btrim(email), ''), NULLIF(btrim(correo_principal), ''), NULLIF(btrim(raw ->> 'email'), '')),
    phone_e164 = COALESCE(NULLIF(btrim(phone_e164), ''), NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono_movil_1_e164), ''), NULLIF(btrim(raw ->> 'internationalPhoneNumber'), ''), NULLIF(btrim(raw ->> 'nationalPhoneNumber'), ''), NULLIF(btrim(raw ->> 'Telefono'), '')),
    phone = COALESCE(NULLIF(btrim(phone), ''), NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono_movil_1_e164), ''), NULLIF(btrim(raw ->> 'internationalPhoneNumber'), ''), NULLIF(btrim(raw ->> 'nationalPhoneNumber'), ''), NULLIF(btrim(raw ->> 'Telefono'), ''));

CREATE INDEX IF NOT EXISTS resultados_org_correo_principal_idx
    ON public.resultados (organizacion_id, lower(correo_principal))
    WHERE correo_principal IS NOT NULL AND btrim(correo_principal) <> '';

CREATE INDEX IF NOT EXISTS resultados_org_correo_secundario_idx
    ON public.resultados (organizacion_id, lower(correo_secundario))
    WHERE correo_secundario IS NOT NULL AND btrim(correo_secundario) <> '';

CREATE INDEX IF NOT EXISTS resultados_org_phone_e164_idx
    ON public.resultados (organizacion_id, phone_e164)
    WHERE phone_e164 IS NOT NULL AND btrim(phone_e164) <> '';

CREATE INDEX IF NOT EXISTS resultados_org_telefono_principal_e164_idx
    ON public.resultados (organizacion_id, telefono_principal_e164)
    WHERE telefono_principal_e164 IS NOT NULL AND btrim(telefono_principal_e164) <> '';

CREATE INDEX IF NOT EXISTS resultados_org_telefono_movil_1_e164_idx
    ON public.resultados (organizacion_id, telefono_movil_1_e164)
    WHERE telefono_movil_1_e164 IS NOT NULL AND btrim(telefono_movil_1_e164) <> '';

CREATE OR REPLACE FUNCTION public.upsert_resultados_lote(
    p_busqueda_id uuid,
    p_fuente public.fuente_resultado,
    p_items jsonb,
    p_organizacion_id uuid DEFAULT NULL
) RETURNS integer
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO 'public, pg_temp'
AS $$
declare
    v_count int := 0;
    v_it jsonb;
    v_organizacion uuid := p_organizacion_id;
    v_header text;
begin
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN 0;
    END IF;

    IF v_organizacion IS NULL THEN
        BEGIN
            v_header := NULLIF(current_setting('request.headers.x-organizacion-id', true), '');
            IF v_header IS NOT NULL THEN
                v_organizacion := v_header::uuid;
            END IF;
        EXCEPTION WHEN others THEN
            v_organizacion := NULL;
        END;
    END IF;

    FOR v_it IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.resultados (
            busqueda_id,
            fuente,
            external_id,
            clee,
            name,
            razon_social,
            actividad,
            estrato,
            phone,
            phone_e164,
            correo_principal,
            correo_secundario,
            telefono_principal_e164,
            telefono_principal_tipo_linea,
            telefono_principal_extension,
            telefono_movil_1_e164,
            telefono_movil_1_tipo_linea,
            email,
            website,
            address,
            lat,
            lng,
            rating,
            reviews,
            maps_url,
            organizacion_id,
            raw
        )
        VALUES (
            p_busqueda_id,
            p_fuente,
            COALESCE(v_it ->> 'external_id', v_it ->> 'id'),
            v_it ->> 'clee',
            v_it ->> 'name',
            v_it ->> 'razon_social',
            v_it ->> 'actividad',
            v_it ->> 'estrato',
            v_it ->> 'phone',
            COALESCE(v_it ->> 'phone_e164', v_it ->> 'telefono_principal_e164', v_it ->> 'telefono_movil_1_e164'),
            COALESCE(v_it ->> 'correo_principal', v_it ->> 'email'),
            v_it ->> 'correo_secundario',
            COALESCE(v_it ->> 'telefono_principal_e164', v_it ->> 'phone_e164', v_it ->> 'phone', v_it ->> 'telefono_movil_1_e164'),
            v_it ->> 'telefono_principal_tipo_linea',
            v_it ->> 'telefono_principal_extension',
            COALESCE(v_it ->> 'telefono_movil_1_e164', v_it ->> 'phone_e164', v_it ->> 'phone', v_it ->> 'telefono_principal_e164'),
            v_it ->> 'telefono_movil_1_tipo_linea',
            COALESCE(v_it ->> 'email', v_it ->> 'correo_principal'),
            v_it ->> 'website',
            v_it ->> 'address',
            NULLIF(v_it ->> 'lat', '')::double precision,
            NULLIF(v_it ->> 'lng', '')::double precision,
            NULLIF(v_it ->> 'rating', '')::numeric,
            NULLIF(v_it ->> 'reviews', '')::int,
            COALESCE(v_it ->> 'maps_url', v_it ->> 'maps'),
            v_organizacion,
            v_it
        )
        ON CONFLICT (busqueda_id, fuente, external_id) DO UPDATE
        SET name = EXCLUDED.name,
            razon_social = EXCLUDED.razon_social,
            actividad = EXCLUDED.actividad,
            estrato = EXCLUDED.estrato,
            phone = EXCLUDED.phone,
            phone_e164 = EXCLUDED.phone_e164,
            correo_principal = EXCLUDED.correo_principal,
            correo_secundario = EXCLUDED.correo_secundario,
            telefono_principal_e164 = EXCLUDED.telefono_principal_e164,
            telefono_principal_tipo_linea = EXCLUDED.telefono_principal_tipo_linea,
            telefono_principal_extension = EXCLUDED.telefono_principal_extension,
            telefono_movil_1_e164 = EXCLUDED.telefono_movil_1_e164,
            telefono_movil_1_tipo_linea = EXCLUDED.telefono_movil_1_tipo_linea,
            email = EXCLUDED.email,
            website = EXCLUDED.website,
            address = EXCLUDED.address,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            rating = EXCLUDED.rating,
            reviews = EXCLUDED.reviews,
            maps_url = EXCLUDED.maps_url,
            raw = EXCLUDED.raw;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
end;
$$;

DROP VIEW IF EXISTS public.v_denue_contactables CASCADE;

CREATE VIEW public.v_denue_contactables
WITH (security_invoker = true) AS
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
    COALESCE(NULLIF(r.telefono_principal_e164, ''::text), NULLIF(r.phone_e164, ''::text), NULLIF(r.phone, ''::text), NULLIF((r.raw #>> '{Telefono}'::text[]), ''::text)) AS phone,
    COALESCE(NULLIF(r.correo_principal, ''::text), NULLIF(r.email, ''::text), NULLIF((r.raw #>> '{Correo_e}'::text[]), ''::text)) AS email,
    r.correo_principal,
    r.correo_secundario,
    r.telefono_principal_e164,
    r.telefono_principal_tipo_linea,
    r.telefono_principal_extension,
    r.telefono_movil_1_e164,
    r.telefono_movil_1_tipo_linea,
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
WHERE r.fuente = 'denue'::public.fuente_resultado;

COMMENT ON VIEW public.v_denue_contactables IS
    'Resultados de búsquedas DENUE listos para contactabilidad y mapa.';

GRANT SELECT ON public.v_denue_contactables TO postgres, service_role, authenticated;

DROP VIEW IF EXISTS public.v_google_places_contactables CASCADE;

CREATE VIEW public.v_google_places_contactables
WITH (security_invoker = true) AS
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
        NULLIF(r.telefono_principal_e164, ''::text),
        NULLIF(r.phone_e164, ''::text),
        NULLIF(r.phone, ''::text),
        NULLIF((r.raw #>> '{internationalPhoneNumber}'::text[]), ''::text),
        NULLIF((r.raw #>> '{nationalPhoneNumber}'::text[]), ''::text)
    ) AS phone,
    COALESCE(
        NULLIF(r.correo_principal, ''::text),
        NULLIF(r.email, ''::text),
        NULLIF((r.raw #>> '{email}'::text[]), ''::text)
    ) AS email,
    r.correo_principal,
    r.correo_secundario,
    r.telefono_principal_e164,
    r.telefono_principal_tipo_linea,
    r.telefono_principal_extension,
    r.telefono_movil_1_e164,
    r.telefono_movil_1_tipo_linea,
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
WHERE r.fuente = 'google_places'::public.fuente_resultado;

COMMENT ON VIEW public.v_google_places_contactables IS
    'Resultados de búsquedas Google Places listos para contactabilidad (teléfono, web, tipo, radio y distancia al centro).';

GRANT SELECT ON public.v_google_places_contactables TO postgres, service_role, authenticated;

COMMIT;
