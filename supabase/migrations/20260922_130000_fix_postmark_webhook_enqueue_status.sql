BEGIN;

-- Corrección idempotente: los nombres de salida de la función también se
-- llaman status/created, por lo que deben calificarse para no colisionar con
-- las columnas de tenant_email_webhook_jobs.
CREATE OR REPLACE FUNCTION public.tenant_email_enqueue_webhook_job(
    p_organizacion_id uuid,
    p_server_id uuid,
    p_message_stream text,
    p_event_type text,
    p_event_key text,
    p_external_message_id text,
    p_webhook_trace_id text,
    p_payload jsonb
)
RETURNS TABLE (job_id uuid, created boolean, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF p_organizacion_id IS NULL OR p_server_id IS NULL OR btrim(p_event_key) = '' OR p_payload IS NULL THEN
        RAISE EXCEPTION 'postmark_webhook_job_invalid_input' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH inserted AS (
        INSERT INTO public.tenant_email_webhook_jobs (
            organizacion_id, server_id, message_stream, event_type, event_key,
            external_message_id, webhook_trace_id, payload
        ) VALUES (
            p_organizacion_id, p_server_id, p_message_stream, p_event_type, p_event_key,
            p_external_message_id, p_webhook_trace_id, p_payload
        )
        ON CONFLICT (organizacion_id, server_id, message_stream, event_type, event_key)
        DO NOTHING
        RETURNING
            tenant_email_webhook_jobs.id AS job_id,
            true AS was_created,
            tenant_email_webhook_jobs.status AS job_status
    )
    SELECT i.job_id, i.was_created, i.job_status
    FROM inserted AS i
    UNION ALL
    SELECT j.id, false, j.status
    FROM public.tenant_email_webhook_jobs AS j
    WHERE j.organizacion_id = p_organizacion_id
      AND j.server_id = p_server_id
      AND j.message_stream = p_message_stream
      AND j.event_type = p_event_type
      AND j.event_key = p_event_key
      AND NOT EXISTS (SELECT 1 FROM inserted AS i2);
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_enqueue_webhook_job(uuid, uuid, text, text, text, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_enqueue_webhook_job(uuid, uuid, text, text, text, text, text, jsonb)
    TO service_role;

COMMIT;
