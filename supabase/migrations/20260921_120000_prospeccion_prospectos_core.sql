BEGIN;

CREATE TABLE IF NOT EXISTS public.prospeccion_prospectos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    busqueda_id uuid REFERENCES public.busquedas(id) ON DELETE CASCADE,
    resultado_id uuid UNIQUE REFERENCES public.resultados(id) ON DELETE SET NULL,
    fuente public.fuente_resultado NOT NULL,
    fuente_busqueda text,
    display_name text NOT NULL,
    name text,
    razon_social text,
    actividad text,
    estrato text,
    phone text,
    phone_e164 text,
    phone_national text,
    carrier_name text,
    carrier_type text,
    email text,
    website text,
    address text,
    lat double precision,
    lng double precision,
    rating numeric,
    distancia_m double precision,
    whatsapp_permitido boolean,
    llamada_permitida boolean,
    lookup_status text DEFAULT 'pendiente',
    lookup_error text,
    segmento text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_busqueda_idx
    ON public.prospeccion_prospectos (busqueda_id, fuente);
CREATE INDEX IF NOT EXISTS prospeccion_prospectos_fuente_idx
    ON public.prospeccion_prospectos (fuente, resultado_id);

ALTER TABLE public.prospeccion_prospectos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_prospectos'
          AND policyname = 'p_select_prospeccion_prospectos'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY p_select_prospeccion_prospectos
                ON public.prospeccion_prospectos
                FOR SELECT
                TO authenticated
                USING (true)
        $policy$;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_prospectos'
          AND policyname = 'p_insert_prospeccion_prospectos'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY p_insert_prospeccion_prospectos
                ON public.prospeccion_prospectos
                FOR INSERT
                TO authenticated
                WITH CHECK (true)
        $policy$;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_prospectos'
          AND policyname = 'p_update_prospeccion_prospectos'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY p_update_prospeccion_prospectos
                ON public.prospeccion_prospectos
                FOR UPDATE
                TO authenticated
                USING (true)
                WITH CHECK (true)
        $policy$;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 't_prospeccion_prospectos_touch'
    ) THEN
        EXECUTE $trigger$
            CREATE TRIGGER t_prospeccion_prospectos_touch
                BEFORE UPDATE ON public.prospeccion_prospectos
                FOR EACH ROW
                EXECUTE FUNCTION public.tg_touch_updated_at()
        $trigger$;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.prospeccion_contactos_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prospecto_id uuid NOT NULL REFERENCES public.prospeccion_prospectos(id) ON DELETE CASCADE,
    canal text NOT NULL,
    accion text,
    estado text NOT NULL DEFAULT 'pendiente',
    detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
    error text,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospeccion_contactos_log_prospecto_idx
    ON public.prospeccion_contactos_log (prospecto_id, canal);

ALTER TABLE public.prospeccion_contactos_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_contactos_log'
          AND policyname = 'p_select_prospeccion_contactos_log'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY p_select_prospeccion_contactos_log
                ON public.prospeccion_contactos_log
                FOR SELECT
                TO authenticated
                USING (true)
        $policy$;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_contactos_log'
          AND policyname = 'p_insert_prospeccion_contactos_log'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY p_insert_prospeccion_contactos_log
                ON public.prospeccion_contactos_log
                FOR INSERT
                TO authenticated
                WITH CHECK (true)
        $policy$;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.crear_busqueda(
    p_fuente public.fuente_resultado,
    p_query text,
    p_radio_m integer,
    p_lat double precision,
    p_lng double precision,
    p_total integer,
    p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO 'public, pg_temp'
AS $$
declare
    v_id uuid;
begin
    INSERT INTO public.busquedas (fuente, query, radio_m, lat, lng, total_encontrados, meta)
    VALUES (p_fuente, p_query, p_radio_m, p_lat, p_lng, p_total, COALESCE(p_meta, '{}'::jsonb))
    RETURNING id INTO v_id;
    RETURN v_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.upsert_resultados_lote(
    p_busqueda_id uuid,
    p_fuente public.fuente_resultado,
    p_items jsonb
) RETURNS integer
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO 'public, pg_temp'
AS $$
declare
    v_count int := 0;
    v_it jsonb;
begin
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN 0;
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
            email,
            website,
            address,
            lat,
            lng,
            rating,
            reviews,
            maps_url,
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
            v_it ->> 'email',
            v_it ->> 'website',
            v_it ->> 'address',
            NULLIF(v_it ->> 'lat', '')::double precision,
            NULLIF(v_it ->> 'lng', '')::double precision,
            NULLIF(v_it ->> 'rating', '')::numeric,
            NULLIF(v_it ->> 'reviews', '')::int,
            COALESCE(v_it ->> 'maps_url', v_it ->> 'maps'),
            v_it
        )
        ON CONFLICT (busqueda_id, fuente, external_id) DO UPDATE
        SET name = EXCLUDED.name,
            razon_social = EXCLUDED.razon_social,
            actividad = EXCLUDED.actividad,
            estrato = EXCLUDED.estrato,
            phone = EXCLUDED.phone,
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

CREATE OR REPLACE VIEW public.v_denue_contactables
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
WHERE r.fuente = 'denue'::public.fuente_resultado;

COMMENT ON VIEW public.v_denue_contactables IS
    'Resultados de búsquedas DENUE listos para contactabilidad y mapa.';

GRANT SELECT ON public.v_denue_contactables TO postgres, service_role, authenticated;

CREATE OR REPLACE VIEW public.v_google_places_contactables
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
WHERE r.fuente = 'google_places'::public.fuente_resultado;

COMMENT ON VIEW public.v_google_places_contactables IS
    'Resultados de búsquedas Google Places listos para contactabilidad (teléfono, web, tipo, radio y distancia al centro).';

GRANT SELECT ON public.v_google_places_contactables TO postgres, service_role, authenticated;

COMMIT;
