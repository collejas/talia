BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_email_start_attempt(
    p_organizacion_id uuid,
    p_message_id uuid
)
RETURNS TABLE (
    attempt_id uuid,
    attempt_number integer,
    from_email text,
    from_name text,
    reply_to_email text,
    to_email text,
    subject text,
    html_body text,
    text_body text,
    tag text,
    message_kind text,
    stream_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_message public.tenant_email_messages%ROWTYPE;
    v_attempt_id uuid;
    v_attempt_number integer;
BEGIN
    SELECT * INTO v_message
    FROM public.tenant_email_messages
    WHERE id = p_message_id AND organizacion_id = p_organizacion_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'email_attempt_message_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_message.status IN ('submitted', 'delivered', 'opened', 'clicked') THEN
        RAISE EXCEPTION 'email_attempt_already_submitted' USING ERRCODE = '55000';
    END IF;
    IF v_message.status = 'cancelled' OR v_message.attempt_count >= v_message.max_attempts THEN
        RAISE EXCEPTION 'email_attempt_not_retryable' USING ERRCODE = '55000';
    END IF;

    v_attempt_number := v_message.attempt_count + 1;
    UPDATE public.tenant_email_messages
    SET attempt_count = v_attempt_number,
        status = 'submitted',
        submitted_at = COALESCE(submitted_at, now()),
        updated_at = now()
    WHERE id = v_message.id AND organizacion_id = p_organizacion_id;

    INSERT INTO public.tenant_email_message_attempts (
        organizacion_id, message_id, attempt_number, status
    ) VALUES (
        p_organizacion_id, v_message.id, v_attempt_number, 'started'
    )
    RETURNING id INTO v_attempt_id;

    RETURN QUERY SELECT
        v_attempt_id,
        v_attempt_number,
        v_message.from_email,
        v_message.from_name,
        v_message.reply_to_email,
        v_message.to_email,
        v_message.subject,
        v_message.html_body,
        v_message.text_body,
        v_message.tag,
        v_message.message_kind,
        v_message.stream_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tenant_email_finish_attempt(
    p_organizacion_id uuid,
    p_message_id uuid,
    p_attempt_id uuid,
    p_accepted boolean,
    p_external_message_id uuid DEFAULT NULL,
    p_error_code text DEFAULT NULL,
    p_error_message text DEFAULT NULL
)
RETURNS TABLE (
    message_status text,
    updated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_attempt public.tenant_email_message_attempts%ROWTYPE;
    v_message public.tenant_email_messages%ROWTYPE;
BEGIN
    SELECT * INTO v_attempt
    FROM public.tenant_email_message_attempts
    WHERE id = p_attempt_id
      AND message_id = p_message_id
      AND organizacion_id = p_organizacion_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'email_finish_attempt_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_attempt.status <> 'started' THEN
        SELECT * INTO v_message
        FROM public.tenant_email_messages
        WHERE id = p_message_id AND organizacion_id = p_organizacion_id;
        RETURN QUERY SELECT v_message.status, false;
        RETURN;
    END IF;

    SELECT * INTO v_message
    FROM public.tenant_email_messages
    WHERE id = p_message_id AND organizacion_id = p_organizacion_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'email_finish_message_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF p_accepted THEN
        UPDATE public.tenant_email_message_attempts
        SET status = 'accepted', external_message_id = p_external_message_id,
            finished_at = now(), error_code = NULL, error_message = NULL
        WHERE id = p_attempt_id;
        UPDATE public.tenant_email_messages
        SET status = 'submitted', external_message_id = p_external_message_id,
            last_error_code = NULL, last_error_message = NULL, updated_at = now()
        WHERE id = p_message_id AND organizacion_id = p_organizacion_id;
        UPDATE public.tenant_email_usage_periods
        SET accepted_recipients = accepted_recipients + 1, updated_at = now()
        WHERE id = v_message.usage_period_id AND organizacion_id = p_organizacion_id;
        INSERT INTO public.tenant_email_usage_events (
            organizacion_id, usage_period_id, message_id, event_type, recipient_count, reason
        ) VALUES (
            p_organizacion_id, v_message.usage_period_id, p_message_id, 'accepted', 1, 'provider_accepted'
        );
    ELSE
        UPDATE public.tenant_email_message_attempts
        SET status = 'failed', finished_at = now(),
            error_code = p_error_code, error_message = p_error_message
        WHERE id = p_attempt_id;
        UPDATE public.tenant_email_messages
        SET status = 'failed', failed_at = now(),
            last_error_code = p_error_code, last_error_message = p_error_message, updated_at = now()
        WHERE id = p_message_id AND organizacion_id = p_organizacion_id;
        UPDATE public.tenant_email_usage_periods
        SET failed_recipients = failed_recipients + 1,
            released_recipients = released_recipients + 1,
            updated_at = now()
        WHERE id = v_message.usage_period_id AND organizacion_id = p_organizacion_id;
        INSERT INTO public.tenant_email_usage_events (
            organizacion_id, usage_period_id, message_id, event_type, recipient_count, reason
        ) VALUES
            (p_organizacion_id, v_message.usage_period_id, p_message_id, 'failed', 1, 'provider_rejected'),
            (p_organizacion_id, v_message.usage_period_id, p_message_id, 'released', 1, 'provider_rejected');
    END IF;

    RETURN QUERY SELECT CASE WHEN p_accepted THEN 'submitted' ELSE 'failed' END, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_start_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_email_finish_attempt(uuid, uuid, uuid, boolean, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_start_attempt(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_email_finish_attempt(uuid, uuid, uuid, boolean, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.tenant_email_start_attempt IS
    'Reclama un mensaje propio de Postmark y crea su intento de entrega.';
COMMENT ON FUNCTION public.tenant_email_finish_attempt IS
    'Cierra idempotentemente un intento propio de Postmark y actualiza cuota.';

COMMIT;
