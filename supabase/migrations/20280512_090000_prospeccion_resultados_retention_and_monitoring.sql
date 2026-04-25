BEGIN;

-- Soporte operativo para:
-- 1) monitorear búsquedas recientes sin abrir la tabla completa,
-- 2) archivar/purgar resultados vencidos por lotes controlados.

CREATE INDEX IF NOT EXISTS resultados_archived_at_idx
    ON public.resultados (archived_at)
    WHERE archived_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prospeccion_resultados_monitoring_summary(
    p_organizacion_id uuid DEFAULT NULL,
    p_fuente public.fuente_resultado DEFAULT NULL,
    p_limit integer DEFAULT 10
) RETURNS TABLE (
    busqueda_id uuid,
    fuente public.fuente_resultado,
    creado_en timestamptz,
    total_resultados bigint,
    unique_external_ids bigint,
    duplicate_rows bigint,
    prospectos bigint,
    archived_resultados bigint
) 
    LANGUAGE sql
    SECURITY INVOKER
    STABLE
    SET search_path TO public, pg_temp
AS $$
    WITH recent_busquedas AS (
        SELECT
            b.id AS busqueda_id,
            b.fuente,
            b.creado_en
        FROM public.busquedas b
        WHERE (p_organizacion_id IS NULL OR b.organizacion_id = p_organizacion_id)
          AND (p_fuente IS NULL OR b.fuente = p_fuente)
        ORDER BY b.creado_en DESC
        LIMIT p_limit
    )
    SELECT
        rb.busqueda_id,
        rb.fuente,
        rb.creado_en,
        COALESCE(r_counts.total_resultados, 0)::bigint AS total_resultados,
        COALESCE(r_counts.unique_external_ids, 0)::bigint AS unique_external_ids,
        GREATEST(
            COALESCE(r_counts.total_resultados, 0) - COALESCE(r_counts.unique_external_ids, 0),
            0
        )::bigint AS duplicate_rows,
        COALESCE(r_counts.prospectos, 0)::bigint AS prospectos,
        COALESCE(r_counts.archived_resultados, 0)::bigint AS archived_resultados
    FROM recent_busquedas rb
    LEFT JOIN LATERAL (
        SELECT
            count(*)::bigint AS total_resultados,
            count(DISTINCT r.external_id)::bigint AS unique_external_ids,
            count(*) FILTER (WHERE r.archived_at IS NOT NULL)::bigint AS archived_resultados,
            count(p.id)::bigint AS prospectos
        FROM public.resultados r
        LEFT JOIN public.prospeccion_prospectos p
            ON p.resultado_id = r.id
        WHERE r.busqueda_id = rb.busqueda_id
          AND (p_fuente IS NULL OR r.fuente = p_fuente)
    ) r_counts ON TRUE
    ORDER BY rb.creado_en DESC;
$$;

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
        WHERE archived_at IS NULL
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
        WHERE archived_at IS NOT NULL
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
        'purge_after', p_purge_after
    );
END;
$$;

COMMENT ON FUNCTION public.prospeccion_resultados_monitoring_summary IS
    'Resumen ligero para monitorear resultados recientes, duplicados y estado de archivo por busqueda.';

COMMENT ON FUNCTION public.purge_expired_resultados IS
    'Archiva y purga resultados vencidos por lotes. Los prospectos sobreviven por ON DELETE SET NULL y las apariciones por ON DELETE CASCADE.';

GRANT EXECUTE ON FUNCTION public.prospeccion_resultados_monitoring_summary(uuid, public.fuente_resultado, integer) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.purge_expired_resultados(integer, interval) TO authenticated, service_role, postgres;

COMMIT;
