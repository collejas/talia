BEGIN;

CREATE OR REPLACE FUNCTION public.purge_expired_resultados(
    p_batch_size integer DEFAULT 1000,
    p_purge_after interval DEFAULT interval '180 days'
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO public, pg_temp
AS $$
declare
    v_archived integer := 0;
    v_deleted integer := 0;
begin
    IF p_batch_size IS NULL OR p_batch_size <= 0 THEN
        RAISE EXCEPTION 'p_batch_size must be greater than zero';
    END IF;
    IF p_purge_after IS NULL OR p_purge_after <= interval '0 days' THEN
        RAISE EXCEPTION 'p_purge_after must be greater than zero';
    END IF;

    WITH to_archive AS (
        SELECT id
        FROM public.resultados
        WHERE fuente = 'denue'::public.fuente_resultado
          AND archived_at IS NULL
          AND retention_until IS NOT NULL
          AND retention_until <= now()
        ORDER BY retention_until ASC, creado_en ASC
        LIMIT p_batch_size
    ), archived AS (
        UPDATE public.resultados r
        SET archived_at = COALESCE(r.archived_at, now())
        FROM to_archive t
        WHERE r.id = t.id
        RETURNING 1
    )
    SELECT count(*) INTO v_archived FROM archived;

    WITH to_delete AS (
        SELECT id
        FROM public.resultados
        WHERE fuente = 'denue'::public.fuente_resultado
          AND archived_at IS NOT NULL
          AND archived_at <= now() - p_purge_after
        ORDER BY archived_at ASC, creado_en ASC
        LIMIT p_batch_size
    ), deleted AS (
        DELETE FROM public.resultados r
        USING to_delete t
        WHERE r.id = t.id
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM deleted;

    RETURN jsonb_build_object(
        'archived_now', v_archived,
        'deleted_now', v_deleted,
        'batch_size', p_batch_size,
        'purge_after', p_purge_after,
        'scope', 'denue'
    );
END;
$$;

COMMENT ON FUNCTION public.purge_expired_resultados IS
    'Archiva y purga solo resultados DENUE vencidos por lotes. Google Places queda excluido del mantenimiento automático.';

COMMIT;
