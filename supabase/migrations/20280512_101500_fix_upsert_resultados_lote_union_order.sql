BEGIN;

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

COMMIT;
