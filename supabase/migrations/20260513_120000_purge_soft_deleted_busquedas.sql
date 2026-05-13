BEGIN;

CREATE INDEX IF NOT EXISTS busquedas_deleted_at_idx
    ON public.busquedas (deleted_at ASC, creado_en ASC)
    WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.purge_soft_deleted_busquedas(
    p_batch_size integer DEFAULT 1,
    p_row_chunk_size integer DEFAULT 500,
    p_purge_after_days integer DEFAULT 7
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO public, pg_temp
AS $$
DECLARE
    v_target_busquedas uuid[] := ARRAY[]::uuid[];
    v_deleted_apariciones integer := 0;
    v_deleted_prospectos integer := 0;
    v_deleted_resultados integer := 0;
    v_deleted_busquedas integer := 0;
    v_purge_before timestamptz := now() - make_interval(days => GREATEST(p_purge_after_days, 1));
BEGIN
    IF p_batch_size IS NULL OR p_batch_size <= 0 THEN
        RAISE EXCEPTION 'p_batch_size must be greater than zero';
    END IF;
    IF p_row_chunk_size IS NULL OR p_row_chunk_size <= 0 THEN
        RAISE EXCEPTION 'p_row_chunk_size must be greater than zero';
    END IF;
    IF p_purge_after_days IS NULL OR p_purge_after_days <= 0 THEN
        RAISE EXCEPTION 'p_purge_after_days must be greater than zero';
    END IF;

    SELECT COALESCE(array_agg(id ORDER BY deleted_at ASC, creado_en ASC), ARRAY[]::uuid[])
    INTO v_target_busquedas
    FROM (
        SELECT id, deleted_at, creado_en
        FROM public.busquedas
        WHERE deleted_at IS NOT NULL
          AND deleted_at <= v_purge_before
        ORDER BY deleted_at ASC, creado_en ASC
        LIMIT p_batch_size
    ) candidates;

    IF array_length(v_target_busquedas, 1) IS NULL THEN
        RETURN jsonb_build_object(
            'archived_now', 0,
            'deleted_now', 0,
            'busquedas_deleted_now', 0,
            'batch_size', p_batch_size,
            'row_chunk_size', p_row_chunk_size,
            'purge_after_days', p_purge_after_days
        );
    END IF;

    WITH deleted AS (
        DELETE FROM public.prospeccion_resultado_apariciones a
        WHERE a.ctid IN (
            SELECT a2.ctid
            FROM public.prospeccion_resultado_apariciones a2
            WHERE a2.busqueda_id = ANY (v_target_busquedas)
            ORDER BY a2.last_seen_at ASC, a2.id ASC
            LIMIT p_row_chunk_size
        )
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted_apariciones FROM deleted;

    WITH deleted AS (
        DELETE FROM public.prospeccion_prospectos p
        WHERE p.ctid IN (
            SELECT p2.ctid
            FROM public.prospeccion_prospectos p2
            WHERE p2.busqueda_id = ANY (v_target_busquedas)
            ORDER BY p2.creado_en ASC, p2.id ASC
            LIMIT p_row_chunk_size
        )
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted_prospectos FROM deleted;

    WITH deleted AS (
        DELETE FROM public.resultados r
        WHERE r.ctid IN (
            SELECT r2.ctid
            FROM public.resultados r2
            WHERE r2.busqueda_id = ANY (v_target_busquedas)
            ORDER BY r2.last_seen_at ASC, r2.id ASC
            LIMIT p_row_chunk_size
        )
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted_resultados FROM deleted;

    WITH deleted AS (
        DELETE FROM public.busquedas b
        WHERE b.id = ANY (v_target_busquedas)
          AND NOT EXISTS (
              SELECT 1
              FROM public.prospeccion_resultado_apariciones a
              WHERE a.busqueda_id = b.id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.prospeccion_prospectos p
              WHERE p.busqueda_id = b.id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.resultados r
              WHERE r.busqueda_id = b.id
          )
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted_busquedas FROM deleted;

    RETURN jsonb_build_object(
        'archived_now', 0,
        'deleted_now', v_deleted_resultados + v_deleted_apariciones + v_deleted_prospectos,
        'busquedas_deleted_now', v_deleted_busquedas,
        'batch_size', p_batch_size,
        'row_chunk_size', p_row_chunk_size,
        'purge_after_days', p_purge_after_days
    );
END;
$$;

COMMENT ON FUNCTION public.purge_soft_deleted_busquedas(integer, integer, integer) IS
    'Purge incremental de búsquedas borradas lógicamente y sus dependencias por lotes pequeños.';

GRANT EXECUTE ON FUNCTION public.purge_soft_deleted_busquedas(integer, integer, integer) TO authenticated, service_role, postgres;

COMMIT;
