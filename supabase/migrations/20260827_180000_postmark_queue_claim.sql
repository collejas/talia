BEGIN;

-- Estado intermedio para evitar que dos workers procesen el mismo mensaje.
ALTER TABLE public.tenant_email_messages
    DROP CONSTRAINT IF EXISTS tenant_email_messages_status_check;

ALTER TABLE public.tenant_email_messages
    ADD CONSTRAINT tenant_email_messages_status_check CHECK (
        status IN ('queued', 'processing', 'submitted', 'delivered', 'failed',
                   'bounced', 'complained', 'suppressed', 'opened', 'clicked', 'cancelled')
    );

CREATE INDEX IF NOT EXISTS tenant_email_messages_queue_claim_idx
    ON public.tenant_email_messages (organizacion_id, queued_at, id)
    WHERE status IN ('queued', 'processing');

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

REVOKE ALL ON FUNCTION public.tenant_email_claim_messages(uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_claim_messages(uuid, integer, integer)
    TO service_role;

COMMENT ON FUNCTION public.tenant_email_claim_messages IS
    'Reclama mensajes Postmark por tenant con SKIP LOCKED y recupera claims obsoletos.';

COMMIT;
