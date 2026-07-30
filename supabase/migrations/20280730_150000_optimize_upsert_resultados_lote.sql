BEGIN;

-- La versión desplegada recorría el JSON fila por fila. Con miles de resultados
-- cada INSERT ejecutaba por separado índices, RLS y triggers, agotando el
-- statement_timeout de PostgREST. Esta versión conserva el contrato pero hace
-- un único INSERT ... SELECT por chunk.
CREATE OR REPLACE FUNCTION public.upsert_resultados_lote(
    p_busqueda_id uuid,
    p_fuente public.fuente_resultado,
    p_items jsonb,
    p_organizacion_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_count integer := 0;
    v_organizacion uuid := p_organizacion_id;
    v_header text;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN 0;
    END IF;

    IF v_organizacion IS NULL THEN
        BEGIN
            v_header := nullif(
                current_setting('request.headers.x-organizacion-id', true),
                ''
            );
            IF v_header IS NOT NULL THEN
                v_organizacion := v_header::uuid;
            END IF;
        EXCEPTION WHEN others THEN
            v_organizacion := NULL;
        END;
    END IF;

    IF v_organizacion IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'organizacion_id_required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.busquedas AS busqueda
        WHERE busqueda.id = p_busqueda_id
          AND busqueda.organizacion_id = v_organizacion
          AND busqueda.fuente = p_fuente
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'busqueda_tenant_mismatch';
    END IF;

    WITH raw_items AS (
        SELECT
            item,
            ord,
            nullif(
                btrim(coalesce(item ->> 'external_id', item ->> 'id')),
                ''
            ) AS external_id
        FROM jsonb_array_elements(p_items) WITH ORDINALITY AS source(item, ord)
    ),
    deduplicated AS (
        SELECT item, external_id
        FROM (
            SELECT
                raw_items.*,
                row_number() OVER (
                    PARTITION BY coalesce(external_id, '__row__' || ord::text)
                    ORDER BY ord DESC
                ) AS row_rank
            FROM raw_items
        ) AS ranked
        WHERE row_rank = 1
    )
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
    SELECT
        p_busqueda_id,
        p_fuente,
        source.external_id,
        source.item ->> 'clee',
        source.item ->> 'name',
        source.item ->> 'razon_social',
        source.item ->> 'actividad',
        source.item ->> 'estrato',
        source.item ->> 'phone',
        coalesce(
            source.item ->> 'phone_e164',
            source.item ->> 'telefono_principal_e164',
            source.item ->> 'telefono_movil_1_e164'
        ),
        coalesce(source.item ->> 'correo_principal', source.item ->> 'email'),
        source.item ->> 'correo_secundario',
        coalesce(
            source.item ->> 'telefono_principal_e164',
            source.item ->> 'phone_e164',
            source.item ->> 'phone',
            source.item ->> 'telefono_movil_1_e164'
        ),
        source.item ->> 'telefono_principal_tipo_linea',
        source.item ->> 'telefono_principal_extension',
        coalesce(
            source.item ->> 'telefono_movil_1_e164',
            source.item ->> 'phone_e164',
            source.item ->> 'phone',
            source.item ->> 'telefono_principal_e164'
        ),
        source.item ->> 'telefono_movil_1_tipo_linea',
        coalesce(source.item ->> 'email', source.item ->> 'correo_principal'),
        source.item ->> 'website',
        source.item ->> 'address',
        nullif(source.item ->> 'lat', '')::double precision,
        nullif(source.item ->> 'lng', '')::double precision,
        nullif(source.item ->> 'rating', '')::numeric,
        nullif(source.item ->> 'reviews', '')::integer,
        coalesce(source.item ->> 'maps_url', source.item ->> 'maps'),
        v_organizacion,
        source.item
    FROM deduplicated AS source
    ON CONFLICT (busqueda_id, fuente, external_id)
    DO UPDATE SET
        clee = EXCLUDED.clee,
        name = EXCLUDED.name,
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

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_resultados_lote(
    uuid,
    public.fuente_resultado,
    jsonb,
    uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_resultados_lote(
    uuid,
    public.fuente_resultado,
    jsonb,
    uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.upsert_resultados_lote(
    uuid,
    public.fuente_resultado,
    jsonb,
    uuid
) IS
    'Upsert set-based y tenant-scoped de chunks de resultados de prospeccion.';

COMMIT;
