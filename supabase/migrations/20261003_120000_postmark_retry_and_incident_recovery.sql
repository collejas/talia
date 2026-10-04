-- Reanuda preparacion Postmark despues de fallos transitorios y evita que un
-- error de red de un bloque convierta irrevocablemente sus targets en fallido.

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_batch_canal_estado_idx
    ON public.prospeccion_contacto_envio (organizacion_id, batch_id, canal, estado, id);

CREATE OR REPLACE FUNCTION public.tenant_finish_postmark_campaign_targets(
    p_organizacion_id uuid,
    p_batch_id uuid,
    p_target_ids uuid[],
    p_success boolean,
    p_error text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_count integer;
BEGIN
    IF p_organizacion_id IS NULL OR p_batch_id IS NULL OR p_target_ids IS NULL
       OR cardinality(p_target_ids) = 0 THEN
        RAISE EXCEPTION 'postmark_campaign_targets_finish_invalid_input' USING ERRCODE = '22023';
    END IF;

    UPDATE public.prospeccion_postmark_campaign_targets AS t
    SET status = CASE
            WHEN p_success THEN 'preparado'
            WHEN t.intento_actual < t.max_reintentos THEN 'pendiente'
            ELSE 'fallido'
        END,
        prepared_at = CASE WHEN p_success THEN now() ELSE t.prepared_at END,
        claimed_at = CASE WHEN p_success THEN t.claimed_at ELSE NULL END,
        last_error = CASE
            WHEN p_success THEN NULL
            ELSE left(p_error, 2000)
        END,
        updated_at = now()
    WHERE t.organizacion_id = p_organizacion_id
      AND t.batch_id = p_batch_id
      AND t.id = ANY(p_target_ids)
      AND t.status = 'procesando';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_finish_postmark_campaign_targets(uuid, uuid, uuid[], boolean, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_finish_postmark_campaign_targets(uuid, uuid, uuid[], boolean, text)
    TO service_role;

-- Los targets con error transitorio se reencolan; los pendientes se mantienen.
-- La insercion del job es unica por batch y no crea targets nuevos.
UPDATE public.prospeccion_postmark_campaign_targets
SET status = 'pendiente',
    claimed_at = NULL,
    last_error = NULL,
    updated_at = now()
WHERE status = 'fallido'
AND EXISTS (
    SELECT 1
    FROM public.prospeccion_contacto_batch b
    WHERE b.id = prospeccion_postmark_campaign_targets.batch_id
      AND b.organizacion_id = prospeccion_postmark_campaign_targets.organizacion_id
      AND b.preparacion_estado NOT IN ('completada', 'no_requerida')
)
AND (
    lower(coalesce(last_error, '')) LIKE '%red%'
    OR lower(coalesce(last_error, '')) LIKE '%network%'
    OR lower(coalesce(last_error, '')) LIKE '%timeout%'
    OR lower(coalesce(last_error, '')) LIKE '%rpc%'
);

INSERT INTO public.prospeccion_postmark_campaign_preparation_jobs (
    organizacion_id,
    batch_id,
    total,
    manifest,
    status
)
SELECT
    t.organizacion_id,
    t.batch_id,
    count(*)::integer,
    jsonb_agg(
        jsonb_build_object(
            'batch_id', t.batch_id,
            'prospecto_id', t.prospecto_id,
            'canal', t.canal,
            'ordinal', t.ordinal,
            'numero_lote', t.numero_lote,
            'lote_programado_en', t.lote_programado_en,
            'programado_en', t.programado_en,
            'plantilla_id', t.plantilla_id,
            'version_id', t.version_id,
            'payload', t.payload,
            'detalle', t.detalle
        ) ORDER BY t.ordinal, t.id
    ),
    'pendiente'
FROM public.prospeccion_postmark_campaign_targets t
WHERE t.status IN ('pendiente', 'procesando', 'fallido')
  AND EXISTS (
      SELECT 1
      FROM public.prospeccion_contacto_batch b
      WHERE b.id = t.batch_id
        AND b.organizacion_id = t.organizacion_id
        AND b.preparacion_estado NOT IN ('completada', 'no_requerida')
  )
GROUP BY t.organizacion_id, t.batch_id
ON CONFLICT (batch_id) DO NOTHING;

UPDATE public.prospeccion_contacto_batch b
SET preparacion_estado = 'pendiente',
    preparacion_error = NULL,
    preparacion_finalizada_en = NULL,
    estado = CASE WHEN b.estado IN ('pendiente', 'en_proceso') THEN 'en_proceso' ELSE b.estado END
WHERE b.preparacion_estado NOT IN ('completada', 'no_requerida')
AND EXISTS (
    SELECT 1
    FROM public.prospeccion_postmark_campaign_preparation_jobs j
    WHERE j.batch_id = b.id
      AND j.status IN ('pendiente', 'procesando')
);

COMMENT ON FUNCTION public.tenant_finish_postmark_campaign_targets(uuid, uuid, uuid[], boolean, text)
    IS 'Finaliza targets Postmark; errores transitorios permanecen reintentables hasta max_reintentos.';
