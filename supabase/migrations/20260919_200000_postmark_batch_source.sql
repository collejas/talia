BEGIN;

-- Relaciona cada mensaje durable de Postmark con el lote operativo de
-- prospección que lo originó. El vínculo permite esperar a que Talia termine
-- de preparar el lote antes de construir el payload de /email/batch.
ALTER TABLE public.tenant_email_messages
    ADD COLUMN IF NOT EXISTS source_batch_id uuid;

CREATE INDEX IF NOT EXISTS tenant_email_messages_source_batch_idx
    ON public.tenant_email_messages (organizacion_id, source_batch_id, status, queued_at, id)
    WHERE source_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tenant_email_queue_message_with_batch(
    p_organizacion_id uuid,
    p_migration_id uuid,
    p_domain_id uuid,
    p_plan_id uuid,
    p_template_id uuid,
    p_template_version integer,
    p_message_kind text,
    p_stream_name text,
    p_idempotency_key text,
    p_from_email text,
    p_from_name text,
    p_reply_to_email text,
    p_to_email text,
    p_subject text,
    p_html_body text,
    p_text_body text,
    p_tag text,
    p_max_attempts integer DEFAULT 3,
    p_source_batch_id uuid DEFAULT NULL
)
RETURNS TABLE (
    message_id uuid,
    usage_period_id uuid,
    created boolean,
    message_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_message_id uuid;
    v_usage_period_id uuid;
    v_created boolean;
    v_message_status text;
BEGIN
    SELECT q.message_id, q.usage_period_id, q.created, q.message_status
    INTO v_message_id, v_usage_period_id, v_created, v_message_status
    FROM public.tenant_email_queue_message(
        p_organizacion_id,
        p_migration_id,
        p_domain_id,
        p_plan_id,
        p_template_id,
        p_template_version,
        p_message_kind,
        p_stream_name,
        p_idempotency_key,
        p_from_email,
        p_from_name,
        p_reply_to_email,
        p_to_email,
        p_subject,
        p_html_body,
        p_text_body,
        p_tag,
        p_max_attempts
    ) q;

    IF p_source_batch_id IS NOT NULL THEN
        UPDATE public.tenant_email_messages
        SET source_batch_id = p_source_batch_id,
            updated_at = now()
        WHERE id = v_message_id
          AND organizacion_id = p_organizacion_id
          AND source_batch_id IS DISTINCT FROM p_source_batch_id;
    END IF;

    RETURN QUERY SELECT v_message_id, v_usage_period_id, v_created, v_message_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_queue_message_with_batch(
    uuid, uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
    text, text, text, text, text, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_queue_message_with_batch(
    uuid, uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
    text, text, text, text, text, integer, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.tenant_email_claim_messages_for_batch(
    p_organizacion_id uuid,
    p_source_batch_id uuid,
    p_limit integer DEFAULT 500,
    p_stale_after_seconds integer DEFAULT 600
)
RETURNS TABLE (message_id uuid, organizacion_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF p_organizacion_id IS NULL OR p_source_batch_id IS NULL OR p_limit < 1 OR p_limit > 500 THEN
        RAISE EXCEPTION 'email_batch_claim_invalid_input' USING ERRCODE = '22023';
    END IF;
    IF p_stale_after_seconds < 60 OR p_stale_after_seconds > 86400 THEN
        RAISE EXCEPTION 'email_batch_claim_invalid_stale_window' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT m.id
        FROM public.tenant_email_messages AS m
        WHERE m.organizacion_id = p_organizacion_id
          AND m.source_batch_id = p_source_batch_id
          AND (
              m.status = 'queued'
              OR (
                  m.status = 'processing'
                  AND m.updated_at < now() - make_interval(secs => p_stale_after_seconds)
              )
          )
        ORDER BY m.queued_at, m.id
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.tenant_email_messages AS m
    SET status = 'processing', updated_at = now()
    FROM candidates
    WHERE m.id = candidates.id
    RETURNING m.id, m.organizacion_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_claim_messages_for_batch(uuid, uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_claim_messages_for_batch(uuid, uuid, integer, integer)
    TO service_role;

-- Los mensajes asociados a un lote no deben salir por el claim genérico antes
-- de que el lote de Talia termine de prepararse.
CREATE OR REPLACE FUNCTION public.tenant_email_claim_messages(
    p_organizacion_id uuid,
    p_limit integer DEFAULT 25,
    p_stale_after_seconds integer DEFAULT 600
)
RETURNS TABLE (message_id uuid, organizacion_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF p_organizacion_id IS NULL OR p_limit < 1 OR p_limit > 500 THEN
        RAISE EXCEPTION 'email_claim_invalid_input' USING ERRCODE = '22023';
    END IF;
    IF p_stale_after_seconds < 60 OR p_stale_after_seconds > 86400 THEN
        RAISE EXCEPTION 'email_claim_invalid_stale_window' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT m.id
        FROM public.tenant_email_messages AS m
        WHERE m.organizacion_id = p_organizacion_id
          AND m.source_batch_id IS NULL
          AND (
              m.status = 'queued'
              OR (
                  m.status = 'processing'
                  AND m.updated_at < now() - make_interval(secs => p_stale_after_seconds)
              )
          )
        ORDER BY m.queued_at, m.id
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.tenant_email_messages AS m
    SET status = 'processing', updated_at = now()
    FROM candidates
    WHERE m.id = candidates.id
    RETURNING m.id, m.organizacion_id;
END;
$function$;

COMMIT;
