BEGIN;

CREATE OR REPLACE FUNCTION public.merge_duplicate_resultados_bucketed(
    p_organizacion_id uuid,
    p_fuente public.fuente_resultado,
    p_bucket integer,
    p_bucket_count integer
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO public, pg_temp
AS $$
declare
    v_stats jsonb := '{}'::jsonb;
begin
    IF p_bucket_count IS NULL OR p_bucket_count <= 0 THEN
        RAISE EXCEPTION 'bucket_count must be greater than zero';
    END IF;
    IF p_bucket IS NULL OR p_bucket < 0 OR p_bucket >= p_bucket_count THEN
        RAISE EXCEPTION 'bucket must be between 0 and bucket_count - 1';
    END IF;

    WITH normalized AS (
        SELECT
            r.id,
            r.busqueda_id,
            r.organizacion_id,
            r.fuente,
            r.external_id,
            r.creado_en,
            COALESCE(r.last_seen_at, r.creado_en) AS last_seen_at,
            lower(p_fuente::text) || ':ext:' || lower(
                regexp_replace(COALESCE(r.external_id, ''), '\s+', '', 'g')
            ) AS dedupe_key,
            row_number() OVER (
                PARTITION BY lower(p_fuente::text) || ':ext:' || lower(
                    regexp_replace(COALESCE(r.external_id, ''), '\s+', '', 'g')
                )
                ORDER BY
                    EXISTS (
                        SELECT 1
                        FROM public.prospeccion_prospectos p
                        WHERE p.resultado_id = r.id
                    ) DESC,
                    COALESCE(r.last_seen_at, r.creado_en) DESC,
                    r.creado_en DESC,
                    r.id DESC
            ) AS rn,
            first_value(r.id) OVER (
                PARTITION BY lower(p_fuente::text) || ':ext:' || lower(
                    regexp_replace(COALESCE(r.external_id, ''), '\s+', '', 'g')
                )
                ORDER BY
                    EXISTS (
                        SELECT 1
                        FROM public.prospeccion_prospectos p
                        WHERE p.resultado_id = r.id
                    ) DESC,
                    COALESCE(r.last_seen_at, r.creado_en) DESC,
                    r.creado_en DESC,
                    r.id DESC
            ) AS canonical_id,
            min(r.creado_en) OVER (
                PARTITION BY lower(p_fuente::text) || ':ext:' || lower(
                    regexp_replace(COALESCE(r.external_id, ''), '\s+', '', 'g')
                )
            ) AS first_seen_at,
            max(COALESCE(r.last_seen_at, r.creado_en)) OVER (
                PARTITION BY lower(p_fuente::text) || ':ext:' || lower(
                    regexp_replace(COALESCE(r.external_id, ''), '\s+', '', 'g')
                )
            ) AS last_seen_at_group,
            count(*) OVER (
                PARTITION BY lower(p_fuente::text) || ':ext:' || lower(
                    regexp_replace(COALESCE(r.external_id, ''), '\s+', '', 'g')
                )
            ) AS appearances_count
        FROM public.resultados r
        WHERE r.organizacion_id = p_organizacion_id
          AND r.fuente = p_fuente
          AND r.external_id IS NOT NULL
          AND mod(abs(hashtext(r.external_id)), p_bucket_count) = p_bucket
    ),
    canonical AS (
        SELECT DISTINCT ON (dedupe_key)
            dedupe_key,
            canonical_id,
            first_seen_at,
            last_seen_at_group,
            appearances_count
        FROM normalized
        ORDER BY dedupe_key, canonical_id
    ),
    updated_canonical AS (
        UPDATE public.resultados r
        SET
            dedupe_key = c.dedupe_key,
            first_seen_at = c.first_seen_at,
            last_seen_at = c.last_seen_at_group,
            appearances_count = c.appearances_count,
            retention_until = GREATEST(
                COALESCE(r.retention_until, c.first_seen_at + interval '90 days'),
                c.last_seen_at_group + interval '90 days'
            )
        FROM canonical c
        WHERE r.id = c.canonical_id
        RETURNING 1
    ),
    inserted_apparitions AS (
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
            n.organizacion_id,
            n.busqueda_id,
            c.canonical_id,
            p.id,
            n.fuente,
            n.external_id,
            c.dedupe_key,
            n.creado_en,
            n.last_seen_at,
            c.appearances_count,
            to_jsonb(n)
        FROM normalized n
        JOIN canonical c ON c.dedupe_key = n.dedupe_key
        LEFT JOIN public.prospeccion_prospectos p
            ON p.organizacion_id = n.organizacion_id
           AND p.resultado_id = n.id
        ON CONFLICT (organizacion_id, busqueda_id, resultado_id) WHERE resultado_id IS NOT NULL DO UPDATE
        SET prospecto_id = COALESCE(public.prospeccion_resultado_apariciones.prospecto_id, EXCLUDED.prospecto_id),
            dedupe_key = COALESCE(EXCLUDED.dedupe_key, public.prospeccion_resultado_apariciones.dedupe_key),
            last_seen_at = GREATEST(public.prospeccion_resultado_apariciones.last_seen_at, EXCLUDED.last_seen_at),
            appearances_count = GREATEST(public.prospeccion_resultado_apariciones.appearances_count, EXCLUDED.appearances_count),
            metadata = EXCLUDED.metadata,
            actualizado_en = now()
        RETURNING 1
    ),
    prospectos_updated AS (
        UPDATE public.prospeccion_prospectos p
        SET resultado_id = c.canonical_id
        FROM normalized n
        JOIN canonical c ON c.dedupe_key = n.dedupe_key
        WHERE p.resultado_id = n.id
          AND n.id <> c.canonical_id
          AND p.organizacion_id = p_organizacion_id
        RETURNING 1
    ),
    deleted_duplicates AS (
        DELETE FROM public.resultados r
        USING normalized n
        JOIN canonical c ON c.dedupe_key = n.dedupe_key
        WHERE r.id = n.id
          AND r.id <> c.canonical_id
        RETURNING 1
    )
    SELECT jsonb_build_object(
        'organizacion_id', p_organizacion_id,
        'fuente', p_fuente::text,
        'bucket', p_bucket,
        'bucket_count', p_bucket_count,
        'resultados_considerados', (SELECT count(*) FROM normalized),
        'canonicos', (SELECT count(*) FROM canonical),
        'apariciones_upserted', (SELECT count(*) FROM inserted_apparitions),
        'prospectos_reasignados', (SELECT count(*) FROM prospectos_updated),
        'duplicados_eliminados', (SELECT count(*) FROM deleted_duplicates)
    ) INTO v_stats;

    RETURN v_stats;
end;
$$;

COMMIT;
