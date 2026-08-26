BEGIN;

-- Cola Postmark: el contenido usado por el envío queda preservado en columnas
-- explícitas para reintentos y auditoría. No modifica ninguna tabla de Brevo.
ALTER TABLE public.tenant_email_messages
    ADD COLUMN IF NOT EXISTS html_body text,
    ADD COLUMN IF NOT EXISTS text_body text,
    ADD COLUMN IF NOT EXISTS tag text;

ALTER TABLE public.tenant_email_messages
    ADD CONSTRAINT tenant_email_messages_content_check
    CHECK (html_body IS NOT NULL OR text_body IS NOT NULL);

CREATE OR REPLACE FUNCTION public.tenant_email_queue_message(
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
    p_max_attempts integer DEFAULT 3
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
    v_existing public.tenant_email_messages%ROWTYPE;
    v_migration public.tenant_email_migrations%ROWTYPE;
    v_domain public.tenant_email_domains%ROWTYPE;
    v_plan public.tenant_email_plans%ROWTYPE;
    v_period public.tenant_email_usage_periods%ROWTYPE;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_reserved_today integer;
    v_in_use integer;
BEGIN
    IF p_organizacion_id IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'email_queue_invalid_input' USING ERRCODE = '22023';
    END IF;
    IF p_message_kind NOT IN ('transactional', 'broadcast') THEN
        RAISE EXCEPTION 'email_queue_invalid_kind' USING ERRCODE = '22023';
    END IF;
    IF p_message_kind = 'broadcast' AND (p_tag IS NULL OR btrim(p_tag) = '') THEN
        RAISE EXCEPTION 'email_queue_broadcast_tag_required' USING ERRCODE = '22023';
    END IF;
    IF p_max_attempts < 0 OR p_max_attempts > 20 THEN
        RAISE EXCEPTION 'email_queue_invalid_attempts' USING ERRCODE = '22023';
    END IF;
    IF p_html_body IS NULL AND p_text_body IS NULL THEN
        RAISE EXCEPTION 'email_queue_body_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
    FROM public.tenant_email_messages
    WHERE organizacion_id = p_organizacion_id
      AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN QUERY SELECT v_existing.id, v_existing.usage_period_id, false, v_existing.status;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_organizacion_id::text, 0));

    -- Revalidar después del lock: dos solicitudes concurrentes con la misma
    -- clave deben reutilizar el primer mensaje y no reservar cuota dos veces.
    SELECT * INTO v_existing
    FROM public.tenant_email_messages
    WHERE organizacion_id = p_organizacion_id
      AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN QUERY SELECT v_existing.id, v_existing.usage_period_id, false, v_existing.status;
        RETURN;
    END IF;

    SELECT * INTO v_migration
    FROM public.tenant_email_migrations
    WHERE organizacion_id = p_organizacion_id
      AND id = p_migration_id
      AND feature_enabled = true
      AND status IN ('active', 'validated', 'migrated');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'email_queue_migration_not_enabled' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_domain
    FROM public.tenant_email_domains
    WHERE organizacion_id = p_organizacion_id
      AND id = p_domain_id
      AND status = 'verified';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'email_queue_domain_not_verified' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_plan
    FROM public.tenant_email_plans
    WHERE organizacion_id = p_organizacion_id
      AND id = p_plan_id
      AND status = 'active'
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at > now());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'email_queue_plan_not_active' USING ERRCODE = '42501';
    END IF;

    v_period_start := CASE v_plan.period_unit
        WHEN 'day' THEN date_trunc('day', now())
        ELSE date_trunc('month', now())
    END;
    v_period_end := CASE v_plan.period_unit
        WHEN 'day' THEN v_period_start + interval '1 day'
        ELSE v_period_start + interval '1 month'
    END;

    INSERT INTO public.tenant_email_usage_periods (
        organizacion_id, plan_id, period_start, period_end
    ) VALUES (
        p_organizacion_id, p_plan_id, v_period_start, v_period_end
    )
    ON CONFLICT (organizacion_id, period_start, period_end)
    DO UPDATE SET updated_at = now()
    RETURNING * INTO v_period;

    v_in_use := v_period.reserved_recipients - v_period.released_recipients;
    IF v_in_use + 1 > v_plan.period_limit THEN
        RAISE EXCEPTION 'email_queue_period_limit_reached' USING ERRCODE = '54000';
    END IF;

    IF v_plan.daily_limit IS NOT NULL THEN
        SELECT COALESCE(SUM(
            CASE WHEN event_type = 'reserved' THEN recipient_count
                 WHEN event_type = 'released' THEN -recipient_count
                 ELSE 0 END
        ), 0)::integer INTO v_reserved_today
        FROM public.tenant_email_usage_events
        WHERE organizacion_id = p_organizacion_id
          AND usage_period_id = v_period.id
          AND created_at >= date_trunc('day', now());
        IF v_reserved_today + 1 > v_plan.daily_limit THEN
            RAISE EXCEPTION 'email_queue_daily_limit_reached' USING ERRCODE = '54000';
        END IF;
    END IF;

    INSERT INTO public.tenant_email_usage_events (
        organizacion_id, usage_period_id, event_type, recipient_count, reason
    ) VALUES (
        p_organizacion_id, v_period.id, 'reserved', 1, 'message_queued'
    );
    UPDATE public.tenant_email_usage_periods
    SET reserved_recipients = reserved_recipients + 1, updated_at = now()
    WHERE id = v_period.id AND organizacion_id = p_organizacion_id;

    INSERT INTO public.tenant_email_messages (
        organizacion_id, migration_id, domain_id, plan_id, usage_period_id,
        template_id, template_version, message_kind, stream_name, idempotency_key,
        from_email, from_name, reply_to_email, to_email, subject,
        html_body, text_body, tag, max_attempts
    ) VALUES (
        p_organizacion_id, p_migration_id, p_domain_id, p_plan_id, v_period.id,
        p_template_id, p_template_version, p_message_kind, p_stream_name, p_idempotency_key,
        lower(btrim(p_from_email)), p_from_name, lower(btrim(p_reply_to_email)),
        lower(btrim(p_to_email)), p_subject, p_html_body, p_text_body, p_tag, p_max_attempts
    )
    RETURNING id, status, tenant_email_messages.usage_period_id
    INTO message_id, message_status, usage_period_id;

    created := true;
    RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_queue_message(
    uuid, uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
    text, text, text, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_queue_message(
    uuid, uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
    text, text, text, text, text, integer
) TO service_role;

COMMENT ON FUNCTION public.tenant_email_queue_message IS
    'Reserva una unidad de cuota y encola un mensaje Postmark con idempotencia por tenant.';

COMMIT;
