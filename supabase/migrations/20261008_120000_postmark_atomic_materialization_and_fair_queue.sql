BEGIN;

-- Materializa el manifiesto completo en una sola transacción. Si la operación
-- falla, no deben quedar chunks parciales de 500 targets persistidos.
CREATE OR REPLACE FUNCTION public.worker_materialize_postmark_campaign_targets(
    p_organizacion_id uuid,
    p_batch_id uuid,
    p_manifest jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_inserted integer;
    v_manifest_count integer;
BEGIN
    IF p_organizacion_id IS NULL
       OR p_batch_id IS NULL
       OR p_manifest IS NULL
       OR jsonb_typeof(p_manifest) <> 'array'
       OR jsonb_array_length(p_manifest) = 0
       OR jsonb_array_length(p_manifest) > 10000 THEN
        RAISE EXCEPTION 'postmark_manifest_materialization_invalid_input'
            USING ERRCODE = '22023';
    END IF;

    v_manifest_count := jsonb_array_length(p_manifest);

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_manifest) AS source(item)
        WHERE NULLIF(source.item->>'batch_id', '')::uuid IS DISTINCT FROM p_batch_id
           OR NULLIF(source.item->>'prospecto_id', '') IS NULL
    ) THEN
        RAISE EXCEPTION 'postmark_manifest_materialization_batch_mismatch'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.prospeccion_postmark_campaign_targets (
        organizacion_id,
        batch_id,
        prospecto_id,
        canal,
        ordinal,
        numero_lote,
        lote_programado_en,
        programado_en,
        plantilla_id,
        version_id,
        payload,
        detalle,
        status,
        created_at,
        updated_at
    )
    SELECT
        p_organizacion_id,
        p_batch_id,
        item.prospecto_id,
        COALESCE(NULLIF(item.canal, ''), 'correo'),
        item.ordinal,
        GREATEST(COALESCE(item.numero_lote, 1), 1),
        item.lote_programado_en,
        COALESCE(item.programado_en, now()),
        item.plantilla_id,
        item.version_id,
        COALESCE(item.payload, '{}'::jsonb),
        COALESCE(item.detalle, '{}'::jsonb),
        'pendiente',
        now(),
        now()
    FROM jsonb_to_recordset(p_manifest) AS item(
        batch_id uuid,
        prospecto_id uuid,
        canal text,
        ordinal integer,
        numero_lote integer,
        lote_programado_en timestamptz,
        programado_en timestamptz,
        plantilla_id uuid,
        version_id uuid,
        payload jsonb,
        detalle jsonb
    )
    ON CONFLICT (batch_id, prospecto_id, canal) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- Una repetición idempotente puede insertar cero filas, pero solo es válida
    -- si el manifiesto completo ya existe.
    IF (
        SELECT count(*)
        FROM public.prospeccion_postmark_campaign_targets AS target
        WHERE target.organizacion_id = p_organizacion_id
          AND target.batch_id = p_batch_id
    ) < v_manifest_count THEN
        RAISE EXCEPTION 'postmark_manifest_materialization_incomplete'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_materialize_postmark_campaign_targets(uuid, uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_materialize_postmark_campaign_targets(uuid, uuid, jsonb)
    TO service_role;

COMMENT ON FUNCTION public.worker_materialize_postmark_campaign_targets(uuid, uuid, jsonb)
    IS 'Materializa un manifiesto Postmark completo en una transacción idempotente, sin chunks parciales.';

-- Recuperación más rápida de un job cuyo worker murió o perdió la respuesta
-- después de que la transacción terminó. La reclamación conserva el límite de
-- intentos y no reenvía ningún mensaje al proveedor.
CREATE OR REPLACE FUNCTION public.worker_claim_postmark_preparation_jobs(
    p_limit integer DEFAULT 5,
    p_stale_after_seconds integer DEFAULT 180
)
RETURNS SETOF public.prospeccion_postmark_campaign_preparation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20);
BEGIN
    IF p_stale_after_seconds < 60 OR p_stale_after_seconds > 86400 THEN
        RAISE EXCEPTION 'postmark_preparation_invalid_stale_window' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT j.id
        FROM public.prospeccion_postmark_campaign_preparation_jobs AS j
        WHERE (
            j.status = 'pendiente'
            OR (
                j.status = 'procesando'
                AND (
                    j.claimed_at IS NULL
                    OR j.claimed_at < now() - make_interval(secs => p_stale_after_seconds)
                )
            )
        )
        AND j.attempt_count < j.max_retries
        ORDER BY j.created_at, j.id
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.prospeccion_postmark_campaign_preparation_jobs AS j
    SET status = 'procesando',
        attempt_count = j.attempt_count + 1,
        claimed_at = now(),
        started_at = COALESCE(j.started_at, now()),
        updated_at = now()
    FROM candidates AS c
    WHERE j.id = c.id
    RETURNING j.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_claim_postmark_preparation_jobs(integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_claim_postmark_preparation_jobs(integer, integer)
    TO service_role;

COMMIT;
