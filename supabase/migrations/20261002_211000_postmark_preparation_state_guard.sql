-- Evita que los RPC de finalizacion de envios marquen completado un lote cuyo
-- manifiesto Postmark aun tiene destinatarios por preparar.

CREATE OR REPLACE FUNCTION public.guard_postmark_campaign_batch_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NEW.estado = 'completado'
       AND NEW.preparacion_estado NOT IN ('no_requerida', 'completada') THEN
        NEW.estado := 'en_proceso';
        NEW.finalizado_en := NULL;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prospeccion_postmark_batch_completion_guard
    ON public.prospeccion_contacto_batch;

CREATE TRIGGER prospeccion_postmark_batch_completion_guard
BEFORE UPDATE OF estado, preparacion_estado ON public.prospeccion_contacto_batch
FOR EACH ROW
EXECUTE FUNCTION public.guard_postmark_campaign_batch_completion();

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
        prepared_at = CASE WHEN p_success THEN now() ELSE prepared_at END,
        claimed_at = CASE WHEN p_success THEN claimed_at ELSE NULL END,
        last_error = CASE WHEN p_success THEN NULL ELSE left(p_error, 2000) END,
        updated_at = now()
    WHERE t.organizacion_id = p_organizacion_id
      AND t.batch_id = p_batch_id
      AND t.id = ANY(p_target_ids)
      AND t.status = 'procesando';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_postmark_campaign_batch_completion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_finish_postmark_campaign_targets(uuid, uuid, uuid[], boolean, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_finish_postmark_campaign_targets(uuid, uuid, uuid[], boolean, text)
    TO service_role;
