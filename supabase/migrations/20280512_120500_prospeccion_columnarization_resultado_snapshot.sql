BEGIN;

-- Columnarización del flujo resultado -> prospecto.
-- Objetivo: reducir dependencia de raw en lecturas y conservar dirección/nombre
-- desglosados como campos hot en resultados y prospectos.

ALTER TABLE public.resultados
    ADD COLUMN IF NOT EXISTS address_full text,
    ADD COLUMN IF NOT EXISTS tipo_vialidad text,
    ADD COLUMN IF NOT EXISTS nombre_vialidad text,
    ADD COLUMN IF NOT EXISTS numero_exterior text,
    ADD COLUMN IF NOT EXISTS numero_interior text,
    ADD COLUMN IF NOT EXISTS colonia text,
    ADD COLUMN IF NOT EXISTS codigo_postal text,
    ADD COLUMN IF NOT EXISTS estado_cve text,
    ADD COLUMN IF NOT EXISTS estado_nombre text,
    ADD COLUMN IF NOT EXISTS municipio_cve text,
    ADD COLUMN IF NOT EXISTS municipio_nombre text,
    ADD COLUMN IF NOT EXISTS localidad_cve text,
    ADD COLUMN IF NOT EXISTS localidad text,
    ADD COLUMN IF NOT EXISTS cvegeo text,
    ADD COLUMN IF NOT EXISTS asentamiento text,
    ADD COLUMN IF NOT EXISTS entre_calles text,
    ADD COLUMN IF NOT EXISTS referencia text,
    ADD COLUMN IF NOT EXISTS google_primary_type text,
    ADD COLUMN IF NOT EXISTS google_primary_type_display_name text,
    ADD COLUMN IF NOT EXISTS google_types text[];

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS nombre_comercial text,
    ADD COLUMN IF NOT EXISTS address_full text,
    ADD COLUMN IF NOT EXISTS tipo_vialidad text,
    ADD COLUMN IF NOT EXISTS nombre_vialidad text,
    ADD COLUMN IF NOT EXISTS numero_exterior text,
    ADD COLUMN IF NOT EXISTS numero_interior text,
    ADD COLUMN IF NOT EXISTS colonia text,
    ADD COLUMN IF NOT EXISTS codigo_postal text,
    ADD COLUMN IF NOT EXISTS estado_cve text,
    ADD COLUMN IF NOT EXISTS estado_nombre text,
    ADD COLUMN IF NOT EXISTS municipio_cve text,
    ADD COLUMN IF NOT EXISTS municipio_nombre text,
    ADD COLUMN IF NOT EXISTS localidad_cve text,
    ADD COLUMN IF NOT EXISTS localidad text,
    ADD COLUMN IF NOT EXISTS cvegeo text,
    ADD COLUMN IF NOT EXISTS asentamiento text,
    ADD COLUMN IF NOT EXISTS entre_calles text,
    ADD COLUMN IF NOT EXISTS referencia text,
    ADD COLUMN IF NOT EXISTS google_primary_type text,
    ADD COLUMN IF NOT EXISTS google_primary_type_display_name text,
    ADD COLUMN IF NOT EXISTS google_types text[];

CREATE INDEX IF NOT EXISTS resultados_org_estado_municipio_idx
    ON public.resultados (organizacion_id, estado_cve, municipio_cve)
    WHERE estado_cve IS NOT NULL OR municipio_cve IS NOT NULL;

CREATE INDEX IF NOT EXISTS resultados_org_codigo_postal_idx
    ON public.resultados (organizacion_id, codigo_postal)
    WHERE codigo_postal IS NOT NULL;

CREATE INDEX IF NOT EXISTS resultados_org_google_primary_type_idx
    ON public.resultados (organizacion_id, google_primary_type)
    WHERE google_primary_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS resultados_org_cvegeo_idx
    ON public.resultados (organizacion_id, cvegeo)
    WHERE cvegeo IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_estado_municipio_idx
    ON public.prospeccion_prospectos (organizacion_id, estado_cve, municipio_cve)
    WHERE estado_cve IS NOT NULL OR municipio_cve IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_codigo_postal_idx
    ON public.prospeccion_prospectos (organizacion_id, codigo_postal)
    WHERE codigo_postal IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_google_primary_type_idx
    ON public.prospeccion_prospectos (organizacion_id, google_primary_type)
    WHERE google_primary_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_cvegeo_idx
    ON public.prospeccion_prospectos (organizacion_id, cvegeo)
    WHERE cvegeo IS NOT NULL;

UPDATE public.resultados r
SET
    address_full = COALESCE(
        r.address_full,
        NULLIF(r.address, '')
    ),
    tipo_vialidad = COALESCE(r.tipo_vialidad, NULLIF(r.raw ->> 'Tipo_vialidad', '')),
    nombre_vialidad = COALESCE(r.nombre_vialidad, NULLIF(r.raw ->> 'Nombre_vialidad', '')),
    numero_exterior = COALESCE(r.numero_exterior, NULLIF(r.raw ->> 'Numero_exterior', '')),
    numero_interior = COALESCE(r.numero_interior, NULLIF(r.raw ->> 'Numero_interior', '')),
    colonia = COALESCE(r.colonia, NULLIF(r.raw ->> 'Colonia', '')),
    codigo_postal = COALESCE(
        r.codigo_postal,
        NULLIF(r.raw ->> 'CP', ''),
        NULLIF(r.raw ->> 'Codigo_postal', '')
    ),
    estado_cve = COALESCE(
        r.estado_cve,
        NULLIF(r.raw ->> 'Cve_ent', ''),
        NULLIF(r.raw ->> 'cve_ent', ''),
        NULLIF(r.raw ->> 'estado_cve', '')
    ),
    estado_nombre = COALESCE(
        r.estado_nombre,
        NULLIF(r.raw ->> 'Entidad', ''),
        NULLIF(r.raw ->> 'Nom_ent', ''),
        NULLIF(r.raw ->> 'estado_nombre', '')
    ),
    municipio_cve = COALESCE(
        r.municipio_cve,
        NULLIF(r.raw ->> 'Cve_mun', ''),
        NULLIF(r.raw ->> 'cve_mun', ''),
        NULLIF(r.raw ->> 'municipio_cve', '')
    ),
    municipio_nombre = COALESCE(
        r.municipio_nombre,
        NULLIF(r.raw ->> 'Municipio', ''),
        NULLIF(r.raw ->> 'Nom_mun', ''),
        NULLIF(r.raw ->> 'municipio_nombre', '')
    ),
    localidad_cve = COALESCE(
        r.localidad_cve,
        NULLIF(r.raw ->> 'Cve_loc', ''),
        NULLIF(r.raw ->> 'cve_loc', ''),
        NULLIF(r.raw ->> 'localidad_cve', '')
    ),
    localidad = COALESCE(
        r.localidad,
        NULLIF(r.raw ->> 'Localidad', ''),
        NULLIF(r.raw ->> 'Nom_loc', ''),
        NULLIF(r.raw ->> 'localidad', '')
    ),
    cvegeo = COALESCE(
        r.cvegeo,
        NULLIF(r.raw ->> 'Cvegeo', ''),
        NULLIF(r.raw ->> 'cvegeo', ''),
        NULLIF(r.raw ->> 'CVEGEO', '')
    ),
    asentamiento = COALESCE(r.asentamiento, NULLIF(r.raw ->> 'Asentamiento', '')),
    entre_calles = COALESCE(
        r.entre_calles,
        NULLIF(r.raw ->> 'Entre_calles', ''),
        NULLIF(r.raw ->> 'EntreCalles', '')
    ),
    referencia = COALESCE(r.referencia, NULLIF(r.raw ->> 'Referencia', '')),
    google_primary_type = COALESCE(
        r.google_primary_type,
        NULLIF(r.raw ->> 'primaryType', '')
    ),
    google_primary_type_display_name = COALESCE(
        r.google_primary_type_display_name,
        NULLIF(r.raw ->> 'primaryTypeDisplayName', ''),
        NULLIF(r.raw #>> '{primaryTypeDisplayName,text}'::text[], '')
    ),
    google_types = COALESCE(
        r.google_types,
        CASE
            WHEN jsonb_typeof(r.raw -> 'types') = 'array' THEN (
                SELECT array_agg(value)
                FROM jsonb_array_elements_text(r.raw -> 'types') AS value
            )
            ELSE NULL
        END
    )
WHERE r.address_full IS NULL
   OR r.tipo_vialidad IS NULL
   OR r.nombre_vialidad IS NULL
   OR r.numero_exterior IS NULL
   OR r.numero_interior IS NULL
   OR r.colonia IS NULL
   OR r.codigo_postal IS NULL
   OR r.estado_cve IS NULL
   OR r.estado_nombre IS NULL
   OR r.municipio_cve IS NULL
   OR r.municipio_nombre IS NULL
   OR r.localidad_cve IS NULL
   OR r.localidad IS NULL
   OR r.cvegeo IS NULL
   OR r.asentamiento IS NULL
   OR r.entre_calles IS NULL
   OR r.referencia IS NULL
   OR r.google_primary_type IS NULL
   OR r.google_primary_type_display_name IS NULL
   OR r.google_types IS NULL;

UPDATE public.prospeccion_prospectos p
SET
    nombre_comercial = COALESCE(p.nombre_comercial, NULLIF(p.display_name, ''), NULLIF(p.name, '')),
    address_full = COALESCE(p.address_full, r.address_full, NULLIF(p.address, ''), r.address),
    tipo_vialidad = COALESCE(p.tipo_vialidad, r.tipo_vialidad),
    nombre_vialidad = COALESCE(p.nombre_vialidad, r.nombre_vialidad),
    numero_exterior = COALESCE(p.numero_exterior, r.numero_exterior),
    numero_interior = COALESCE(p.numero_interior, r.numero_interior),
    colonia = COALESCE(p.colonia, r.colonia),
    codigo_postal = COALESCE(p.codigo_postal, r.codigo_postal),
    estado_cve = COALESCE(p.estado_cve, r.estado_cve),
    estado_nombre = COALESCE(p.estado_nombre, r.estado_nombre),
    municipio_cve = COALESCE(p.municipio_cve, r.municipio_cve),
    municipio_nombre = COALESCE(p.municipio_nombre, r.municipio_nombre),
    localidad_cve = COALESCE(p.localidad_cve, r.localidad_cve),
    localidad = COALESCE(p.localidad, r.localidad),
    cvegeo = COALESCE(p.cvegeo, r.cvegeo),
    asentamiento = COALESCE(p.asentamiento, r.asentamiento),
    entre_calles = COALESCE(p.entre_calles, r.entre_calles),
    referencia = COALESCE(p.referencia, r.referencia),
    google_primary_type = COALESCE(p.google_primary_type, r.google_primary_type),
    google_primary_type_display_name = COALESCE(p.google_primary_type_display_name, r.google_primary_type_display_name),
    google_types = COALESCE(p.google_types, r.google_types)
FROM public.resultados r
WHERE p.resultado_id = r.id
  AND (
      p.nombre_comercial IS NULL
      OR p.address_full IS NULL
      OR p.tipo_vialidad IS NULL
      OR p.nombre_vialidad IS NULL
      OR p.numero_exterior IS NULL
      OR p.numero_interior IS NULL
      OR p.colonia IS NULL
      OR p.codigo_postal IS NULL
      OR p.estado_cve IS NULL
      OR p.estado_nombre IS NULL
      OR p.municipio_cve IS NULL
      OR p.municipio_nombre IS NULL
      OR p.localidad_cve IS NULL
      OR p.localidad IS NULL
      OR p.cvegeo IS NULL
      OR p.asentamiento IS NULL
      OR p.entre_calles IS NULL
      OR p.referencia IS NULL
      OR p.google_primary_type IS NULL
      OR p.google_primary_type_display_name IS NULL
      OR p.google_types IS NULL
  );

CREATE OR REPLACE FUNCTION public.upsert_resultados_lote(
    p_busqueda_id uuid,
    p_fuente public.fuente_resultado,
    p_items jsonb,
    p_organizacion_id uuid DEFAULT NULL
) RETURNS integer
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO public, pg_temp
AS $$
declare
    v_count int := 0;
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

    WITH raw_items AS (
        SELECT it, ord
        FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(it, ord)
    ),
    items AS (
        SELECT
            COALESCE(it ->> 'external_id', it ->> 'id') AS external_id,
            it ->> 'clee' AS clee,
            it ->> 'name' AS name,
            it ->> 'razon_social' AS razon_social,
            it ->> 'actividad' AS actividad,
            it ->> 'estrato' AS estrato,
            it ->> 'phone' AS phone,
            it ->> 'email' AS email,
            it ->> 'website' AS website,
            it ->> 'address' AS address,
            COALESCE(it ->> 'address_full', it ->> 'formattedAddress', it ->> 'address') AS address_full,
            it ->> 'tipo_vialidad' AS tipo_vialidad,
            it ->> 'nombre_vialidad' AS nombre_vialidad,
            it ->> 'numero_exterior' AS numero_exterior,
            it ->> 'numero_interior' AS numero_interior,
            it ->> 'colonia' AS colonia,
            it ->> 'codigo_postal' AS codigo_postal,
            it ->> 'estado_cve' AS estado_cve,
            it ->> 'estado_nombre' AS estado_nombre,
            it ->> 'municipio_cve' AS municipio_cve,
            it ->> 'municipio_nombre' AS municipio_nombre,
            it ->> 'localidad_cve' AS localidad_cve,
            it ->> 'localidad' AS localidad,
            it ->> 'cvegeo' AS cvegeo,
            it ->> 'asentamiento' AS asentamiento,
            it ->> 'entre_calles' AS entre_calles,
            it ->> 'referencia' AS referencia,
            it ->> 'google_primary_type' AS google_primary_type,
            it ->> 'google_primary_type_display_name' AS google_primary_type_display_name,
            CASE
                WHEN jsonb_typeof(it -> 'google_types') = 'array' THEN ARRAY(
                    SELECT jsonb_array_elements_text(it -> 'google_types')
                )
                ELSE NULL
            END AS google_types,
            NULLIF(it ->> 'lat', '')::double precision AS lat,
            NULLIF(it ->> 'lng', '')::double precision AS lng,
            NULLIF(it ->> 'rating', '')::numeric AS rating,
            NULLIF(it ->> 'reviews', '')::int AS reviews,
            COALESCE(it ->> 'maps_url', it ->> 'maps') AS maps_url,
            it AS raw,
            ord,
            CASE
                WHEN COALESCE(it ->> 'external_id', it ->> 'id') IS NOT NULL THEN
                    lower(p_fuente::text) || ':ext:' || lower(
                        regexp_replace(
                            COALESCE(NULLIF(it ->> 'external_id', ''), NULLIF(it ->> 'id', '')),
                            '\s+',
                            '',
                            'g'
                        )
                    )
                ELSE
                    lower(p_fuente::text) || ':md5:' || md5(
                        lower(concat_ws(
                            '|',
                            COALESCE(it ->> 'name', ''),
                            COALESCE(it ->> 'razon_social', ''),
                            COALESCE(it ->> 'address', ''),
                            COALESCE(it ->> 'phone', ''),
                            COALESCE(it ->> 'email', ''),
                            COALESCE(it ->> 'website', ''),
                            COALESCE(it ->> 'actividad', ''),
                            COALESCE(it ->> 'estrato', '')
                        ))
                    )
            END AS dedupe_key
        FROM raw_items
    ),
    dedup AS (
        SELECT *
        FROM (
            SELECT
                *,
                row_number() OVER (PARTITION BY dedupe_key ORDER BY ord DESC) AS rn
            FROM items
        ) s
        WHERE rn = 1
    ),
    chosen AS (
        SELECT
            d.*,
            r.id AS resultado_id
        FROM dedup d
        LEFT JOIN LATERAL (
            SELECT r.*
            FROM public.resultados r
            WHERE r.organizacion_id = v_organizacion
              AND r.fuente = p_fuente
              AND (
                    (d.external_id IS NOT NULL AND r.external_id = d.external_id)
                    OR (r.dedupe_key IS NOT NULL AND r.dedupe_key = d.dedupe_key)
                  )
            ORDER BY
                CASE WHEN r.dedupe_key = d.dedupe_key THEN 0 ELSE 1 END,
                r.last_seen_at DESC NULLS LAST,
                r.creado_en DESC,
                r.id DESC
            LIMIT 1
        ) r ON TRUE
    ),
    updated_existing AS (
        UPDATE public.resultados r
        SET
            clee = c.clee,
            name = c.name,
            razon_social = c.razon_social,
            actividad = c.actividad,
            estrato = c.estrato,
            phone = c.phone,
            email = c.email,
            website = c.website,
            address = c.address,
            address_full = c.address_full,
            tipo_vialidad = c.tipo_vialidad,
            nombre_vialidad = c.nombre_vialidad,
            numero_exterior = c.numero_exterior,
            numero_interior = c.numero_interior,
            colonia = c.colonia,
            codigo_postal = c.codigo_postal,
            estado_cve = c.estado_cve,
            estado_nombre = c.estado_nombre,
            municipio_cve = c.municipio_cve,
            municipio_nombre = c.municipio_nombre,
            localidad_cve = c.localidad_cve,
            localidad = c.localidad,
            cvegeo = c.cvegeo,
            asentamiento = c.asentamiento,
            entre_calles = c.entre_calles,
            referencia = c.referencia,
            google_primary_type = c.google_primary_type,
            google_primary_type_display_name = c.google_primary_type_display_name,
            google_types = c.google_types,
            lat = c.lat,
            lng = c.lng,
            rating = c.rating,
            reviews = c.reviews,
            maps_url = c.maps_url,
            raw = c.raw,
            dedupe_key = COALESCE(r.dedupe_key, c.dedupe_key),
            last_seen_at = now(),
            appearances_count = COALESCE(r.appearances_count, 1) + 1,
            retention_until = GREATEST(
                COALESCE(r.retention_until, now() + interval '5 days'),
                now() + interval '5 days'
            )
        FROM chosen c
        WHERE r.id = c.resultado_id
        RETURNING
            r.id AS id,
            r.external_id AS external_id,
            r.dedupe_key AS dedupe_key,
            r.first_seen_at AS first_seen_at,
            r.last_seen_at AS last_seen_at,
            r.appearances_count AS appearances_count,
            r.raw AS raw
    ),
    inserted_new AS (
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
            address_full,
            tipo_vialidad,
            nombre_vialidad,
            numero_exterior,
            numero_interior,
            colonia,
            codigo_postal,
            estado_cve,
            estado_nombre,
            municipio_cve,
            municipio_nombre,
            localidad_cve,
            localidad,
            cvegeo,
            asentamiento,
            entre_calles,
            referencia,
            google_primary_type,
            google_primary_type_display_name,
            google_types,
            lat,
            lng,
            rating,
            reviews,
            maps_url,
            organizacion_id,
            raw,
            dedupe_key,
            first_seen_at,
            last_seen_at,
            appearances_count,
            archived_at,
            retention_until
        )
        SELECT
            p_busqueda_id,
            p_fuente,
            c.external_id,
            c.clee,
            c.name,
            c.razon_social,
            c.actividad,
            c.estrato,
            c.phone,
            c.email,
            c.website,
            c.address,
            c.address_full,
            c.tipo_vialidad,
            c.nombre_vialidad,
            c.numero_exterior,
            c.numero_interior,
            c.colonia,
            c.codigo_postal,
            c.estado_cve,
            c.estado_nombre,
            c.municipio_cve,
            c.municipio_nombre,
            c.localidad_cve,
            c.localidad,
            c.cvegeo,
            c.asentamiento,
            c.entre_calles,
            c.referencia,
            c.google_primary_type,
            c.google_primary_type_display_name,
            c.google_types,
            c.lat,
            c.lng,
            c.rating,
            c.reviews,
            c.maps_url,
            v_organizacion,
            c.raw,
            c.dedupe_key,
            now(),
            now(),
            1,
            NULL,
            now() + interval '5 days'
        FROM chosen c
        WHERE c.resultado_id IS NULL
        ON CONFLICT (organizacion_id, fuente, dedupe_key)
        WHERE dedupe_key IS NOT NULL
        DO UPDATE
        SET
            external_id = EXCLUDED.external_id,
            clee = EXCLUDED.clee,
            name = EXCLUDED.name,
            razon_social = EXCLUDED.razon_social,
            actividad = EXCLUDED.actividad,
            estrato = EXCLUDED.estrato,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            website = EXCLUDED.website,
            address = EXCLUDED.address,
            address_full = EXCLUDED.address_full,
            tipo_vialidad = EXCLUDED.tipo_vialidad,
            nombre_vialidad = EXCLUDED.nombre_vialidad,
            numero_exterior = EXCLUDED.numero_exterior,
            numero_interior = EXCLUDED.numero_interior,
            colonia = EXCLUDED.colonia,
            codigo_postal = EXCLUDED.codigo_postal,
            estado_cve = EXCLUDED.estado_cve,
            estado_nombre = EXCLUDED.estado_nombre,
            municipio_cve = EXCLUDED.municipio_cve,
            municipio_nombre = EXCLUDED.municipio_nombre,
            localidad_cve = EXCLUDED.localidad_cve,
            localidad = EXCLUDED.localidad,
            cvegeo = EXCLUDED.cvegeo,
            asentamiento = EXCLUDED.asentamiento,
            entre_calles = EXCLUDED.entre_calles,
            referencia = EXCLUDED.referencia,
            google_primary_type = EXCLUDED.google_primary_type,
            google_primary_type_display_name = EXCLUDED.google_primary_type_display_name,
            google_types = EXCLUDED.google_types,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            rating = EXCLUDED.rating,
            reviews = EXCLUDED.reviews,
            maps_url = EXCLUDED.maps_url,
            raw = EXCLUDED.raw,
            dedupe_key = COALESCE(public.resultados.dedupe_key, EXCLUDED.dedupe_key),
            last_seen_at = now(),
            appearances_count = COALESCE(public.resultados.appearances_count, 1) + 1,
            retention_until = GREATEST(
                COALESCE(public.resultados.retention_until, now() + interval '5 days'),
                now() + interval '5 days'
            )
        RETURNING
            id,
            external_id,
            dedupe_key,
            first_seen_at,
            last_seen_at,
            appearances_count,
            raw
    ),
    touched AS (
        SELECT id, external_id, dedupe_key, first_seen_at, last_seen_at, appearances_count, raw
        FROM updated_existing
        UNION ALL
        SELECT id, external_id, dedupe_key, first_seen_at, last_seen_at, appearances_count, raw
        FROM inserted_new
    ),
    appearances AS (
        INSERT INTO public.prospeccion_resultado_apariciones (
            organizacion_id,
            busqueda_id,
            resultado_id,
            prospecto_id,
            fuente,
            external_id,
            dedupe_key,
            first_seen_at,
            last_seen_at,
            appearances_count,
            metadata
        )
        SELECT
            v_organizacion,
            p_busqueda_id,
            t.id,
            p.id,
            p_fuente,
            t.external_id,
            t.dedupe_key,
            t.first_seen_at,
            t.last_seen_at,
            t.appearances_count,
            t.raw
        FROM touched t
        LEFT JOIN public.prospeccion_prospectos p
            ON p.organizacion_id = v_organizacion
           AND p.resultado_id = t.id
        ON CONFLICT (organizacion_id, busqueda_id, resultado_id) WHERE resultado_id IS NOT NULL DO UPDATE
        SET prospecto_id = COALESCE(public.prospeccion_resultado_apariciones.prospecto_id, EXCLUDED.prospecto_id),
            dedupe_key = COALESCE(EXCLUDED.dedupe_key, public.prospeccion_resultado_apariciones.dedupe_key),
            last_seen_at = GREATEST(public.prospeccion_resultado_apariciones.last_seen_at, EXCLUDED.last_seen_at),
            appearances_count = GREATEST(public.prospeccion_resultado_apariciones.appearances_count, EXCLUDED.appearances_count),
            metadata = EXCLUDED.metadata,
            actualizado_en = now()
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM appearances;

    RETURN COALESCE(v_count, 0);
end;
$$;

DROP VIEW IF EXISTS public.v_denue_contactables CASCADE;
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
        ,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial
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
        ,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial
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

DROP VIEW IF EXISTS public.v_google_places_contactables CASCADE;
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
        r.actividad,
        r.estrato,
        r.google_primary_type,
        r.google_primary_type_display_name,
        COALESCE(r.google_types, ARRAY[]::text[]) AS google_types,
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
        ,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial
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
        r.actividad,
        r.estrato,
        r.google_primary_type,
        r.google_primary_type_display_name,
        COALESCE(r.google_types, ARRAY[]::text[]) AS google_types,
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
        ,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial
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

DROP VIEW IF EXISTS public.v_resultados_unificados CASCADE;
CREATE VIEW public.v_resultados_unificados
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
        r.address_full,
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
        r.rating,
        r.reviews,
        r.maps_url,
        r.google_primary_type,
        r.google_primary_type_display_name,
        r.google_types,
        a.first_seen_at AS creado_en,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial
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
        r.address_full,
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
        r.rating,
        r.reviews,
        r.maps_url,
        r.google_primary_type,
        r.google_primary_type_display_name,
        r.google_types,
        r.creado_en AS creado_en,
        COALESCE(NULLIF(r.name, ''::text), NULLIF(r.razon_social, ''::text)) AS nombre_comercial
    FROM public.resultados r
    JOIN public.busquedas b ON b.id = r.busqueda_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.prospeccion_resultado_apariciones a
        WHERE a.resultado_id = r.id
          AND a.busqueda_id = r.busqueda_id
    )
) resultados_unificados;

COMMIT;
