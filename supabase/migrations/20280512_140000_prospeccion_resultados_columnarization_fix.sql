BEGIN;

-- Repara el flujo vivo de prospeccion para que los resultados y prospectos
-- escriban en columnas hot en lugar de depender solo de metadata.

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

    IF v_organizacion IS NULL THEN
        RAISE EXCEPTION 'organizacion_id_required';
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
                COALESCE(r.retention_until, now() + interval '90 days'),
                now() + interval '90 days'
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
            now() + interval '90 days'
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
                COALESCE(public.resultados.retention_until, now() + interval '90 days'),
                now() + interval '90 days'
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

WITH denue_src AS (
    SELECT
        r.id,
        NULLIF(COALESCE(r.raw ->> 'Tipo_vialidad', r.raw -> 'raw' ->> 'Tipo_vialidad'), '') AS tipo_vialidad,
        NULLIF(COALESCE(r.raw ->> 'Calle', r.raw -> 'raw' ->> 'Calle', r.raw ->> 'Nombre_vialidad', r.raw -> 'raw' ->> 'Nombre_vialidad'), '') AS nombre_vialidad,
        NULLIF(COALESCE(r.raw ->> 'Num_Exterior', r.raw -> 'raw' ->> 'Num_Exterior', r.raw ->> 'Numero_exterior', r.raw -> 'raw' ->> 'Numero_exterior'), '') AS numero_exterior,
        NULLIF(COALESCE(r.raw ->> 'Num_Interior', r.raw -> 'raw' ->> 'Num_Interior', r.raw ->> 'Numero_interior', r.raw -> 'raw' ->> 'Numero_interior'), '') AS numero_interior,
        NULLIF(COALESCE(r.raw ->> 'Colonia', r.raw -> 'raw' ->> 'Colonia'), '') AS colonia,
        NULLIF(COALESCE(r.raw ->> 'CP', r.raw -> 'raw' ->> 'CP', r.raw ->> 'Codigo_postal', r.raw -> 'raw' ->> 'Codigo_postal'), '') AS codigo_postal,
        NULLIF(COALESCE(r.raw ->> 'Cve_ent', r.raw -> 'raw' ->> 'Cve_ent', r.raw ->> 'estado_cve'), '') AS estado_cve,
        NULLIF(COALESCE(r.raw ->> 'Entidad', r.raw -> 'raw' ->> 'Entidad', r.raw ->> 'Nom_ent', r.raw -> 'raw' ->> 'Nom_ent', r.raw ->> 'estado_nombre'), '') AS estado_nombre,
        NULLIF(COALESCE(r.raw ->> 'Cve_mun', r.raw -> 'raw' ->> 'Cve_mun', r.raw ->> 'municipio_cve'), '') AS municipio_cve,
        NULLIF(COALESCE(r.raw ->> 'Municipio', r.raw -> 'raw' ->> 'Municipio', r.raw ->> 'Nom_mun', r.raw -> 'raw' ->> 'Nom_mun', r.raw ->> 'municipio_nombre'), '') AS municipio_nombre,
        NULLIF(COALESCE(r.raw ->> 'Cve_loc', r.raw -> 'raw' ->> 'Cve_loc', r.raw ->> 'localidad_cve'), '') AS localidad_cve,
        NULLIF(COALESCE(r.raw ->> 'Localidad', r.raw -> 'raw' ->> 'Localidad', r.raw ->> 'Nom_loc', r.raw -> 'raw' ->> 'Nom_loc', r.raw ->> 'localidad'), '') AS localidad,
        NULLIF(COALESCE(r.raw ->> 'AreaGeo', r.raw -> 'raw' ->> 'AreaGeo', r.raw ->> 'Cvegeo', r.raw -> 'raw' ->> 'Cvegeo', r.raw ->> 'cvegeo', r.raw ->> 'CVEGEO'), '') AS cvegeo,
        NULLIF(COALESCE(r.raw ->> 'Tipo_Asentamiento', r.raw -> 'raw' ->> 'Tipo_Asentamiento', r.raw ->> 'Asentamiento'), '') AS asentamiento,
        NULLIF(COALESCE(r.raw ->> 'Entre_calles', r.raw -> 'raw' ->> 'Entre_calles', r.raw ->> 'EntreCalles'), '') AS entre_calles,
        NULLIF(COALESCE(r.raw ->> 'Referencia', r.raw -> 'raw' ->> 'Referencia'), '') AS referencia
    FROM public.resultados r
    WHERE r.fuente = 'denue'::public.fuente_resultado
)
UPDATE public.resultados r
SET
    address_full = COALESCE(
        NULLIF(CONCAT_WS(
            ', ',
            NULLIF(CONCAT_WS(' ', NULLIF(src.tipo_vialidad, ''), NULLIF(src.nombre_vialidad, '')), ''),
            NULLIF(CONCAT_WS(' ', NULLIF(src.numero_exterior, ''), NULLIF(src.numero_interior, '')), ''),
            NULLIF(src.colonia, ''),
            NULLIF(src.codigo_postal, ''),
            NULLIF(src.municipio_nombre, ''),
            NULLIF(src.estado_nombre, '')
        ), ''),
        r.address_full,
        r.address
    ),
    address = COALESCE(
        NULLIF(CONCAT_WS(
            ', ',
            NULLIF(CONCAT_WS(' ', NULLIF(src.tipo_vialidad, ''), NULLIF(src.nombre_vialidad, '')), ''),
            NULLIF(CONCAT_WS(' ', NULLIF(src.numero_exterior, ''), NULLIF(src.numero_interior, '')), ''),
            NULLIF(src.colonia, ''),
            NULLIF(src.codigo_postal, '')
        ), ''),
        r.address
    ),
    tipo_vialidad = COALESCE(src.tipo_vialidad, r.tipo_vialidad),
    nombre_vialidad = COALESCE(src.nombre_vialidad, r.nombre_vialidad),
    numero_exterior = COALESCE(src.numero_exterior, r.numero_exterior),
    numero_interior = COALESCE(src.numero_interior, r.numero_interior),
    colonia = COALESCE(src.colonia, r.colonia),
    codigo_postal = COALESCE(src.codigo_postal, r.codigo_postal),
    estado_cve = COALESCE(src.estado_cve, r.estado_cve),
    estado_nombre = COALESCE(src.estado_nombre, r.estado_nombre),
    municipio_cve = COALESCE(src.municipio_cve, r.municipio_cve),
    municipio_nombre = COALESCE(src.municipio_nombre, r.municipio_nombre),
    localidad_cve = COALESCE(src.localidad_cve, r.localidad_cve),
    localidad = COALESCE(src.localidad, r.localidad),
    cvegeo = COALESCE(src.cvegeo, r.cvegeo),
    asentamiento = COALESCE(src.asentamiento, r.asentamiento),
    entre_calles = COALESCE(src.entre_calles, r.entre_calles),
    referencia = COALESCE(src.referencia, r.referencia)
FROM denue_src src
WHERE r.id = src.id
  AND (
      r.address_full IS NULL
      OR r.address IS NULL
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
  );

WITH google_src AS (
    SELECT
        r.id,
        NULLIF(COALESCE(r.raw ->> 'primaryType', r.raw -> 'raw' ->> 'primaryType'), '') AS google_primary_type,
        NULLIF(COALESCE(
            r.raw ->> 'primaryTypeDisplayName',
            r.raw -> 'raw' ->> 'primaryTypeDisplayName',
            r.raw -> 'raw' #>> '{primaryTypeDisplayName,text}'
        ), '') AS google_primary_type_display_name,
        CASE
            WHEN jsonb_typeof(COALESCE(r.raw -> 'types', r.raw -> 'raw' -> 'types')) = 'array' THEN (
                SELECT array_agg(value)
                FROM jsonb_array_elements_text(COALESCE(r.raw -> 'types', r.raw -> 'raw' -> 'types')) AS value
            )
            ELSE NULL
        END AS google_types
    FROM public.resultados r
    WHERE r.fuente = 'google_places'::public.fuente_resultado
)
UPDATE public.resultados r
SET
    address_full = COALESCE(r.address_full, NULLIF(r.address, ''), NULLIF(r.raw ->> 'formattedAddress', ''), NULLIF(r.raw -> 'raw' ->> 'formattedAddress', '')),
    google_primary_type = COALESCE(r.google_primary_type, g.google_primary_type),
    google_primary_type_display_name = COALESCE(r.google_primary_type_display_name, g.google_primary_type_display_name),
    google_types = COALESCE(r.google_types, g.google_types)
FROM google_src g
WHERE r.id = g.id
  AND (
      r.address_full IS NULL
      OR r.google_primary_type IS NULL
      OR r.google_primary_type_display_name IS NULL
      OR r.google_types IS NULL
  );

UPDATE public.prospeccion_prospectos p
SET
    nombre_comercial = COALESCE(p.nombre_comercial, NULLIF(p.display_name, ''), NULLIF(p.name, '')),
    address = COALESCE(p.address, r.address, p.address_full, r.address_full),
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
    google_types = COALESCE(p.google_types, r.google_types),
    busqueda_ref = COALESCE(
        p.busqueda_ref,
        NULLIF(BTRIM(COALESCE(
            p.busqueda_id::text,
            p.metadata ->> 'busqueda_id',
            p.metadata ->> 'busqueda_query',
            p.metadata ->> 'query',
            p.metadata -> 'busqueda_meta' ->> 'query'
        )), '')
    ),
    query_sort = COALESCE(
        p.query_sort,
        NULLIF(BTRIM(COALESCE(
            p.metadata ->> 'query',
            p.metadata ->> 'busqueda_query',
            p.metadata -> 'busqueda_meta' ->> 'query',
            p.metadata ->> 'busqueda_id',
            p.busqueda_id::text
        )), '')
    )
FROM public.resultados r
WHERE p.resultado_id = r.id
  AND (
      p.nombre_comercial IS NULL
      OR p.address IS NULL
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
      OR p.busqueda_ref IS NULL
      OR p.query_sort IS NULL
  );

COMMIT;
