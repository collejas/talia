BEGIN;

-- Transporte transitorio del conjunto preparado. Cada campo estructural se
-- materializa en las columnas explícitas de tenant_email_messages mediante la
-- función existente; el JSONB no se conserva como modelo de negocio.
CREATE OR REPLACE FUNCTION public.tenant_email_queue_messages_bulk(
    p_organizacion_id uuid,
    p_items jsonb
)
RETURNS TABLE (
    idempotency_key text,
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
    v_item record;
    v_message_id uuid;
    v_usage_period_id uuid;
    v_created boolean;
    v_message_status text;
BEGIN
    IF p_organizacion_id IS NULL
       OR p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) < 1
       OR jsonb_array_length(p_items) > 500 THEN
        RAISE EXCEPTION 'email_bulk_queue_invalid_input' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_items) AS x(
            idempotency_key text,
            migration_id uuid,
            domain_id uuid,
            plan_id uuid,
            template_id uuid,
            template_version integer,
            message_kind text,
            stream_name text,
            from_email text,
            from_name text,
            reply_to_email text,
            to_email text,
            subject text,
            html_body text,
            text_body text,
            tag text,
            max_attempts integer,
            source_batch_id uuid
        )
    LOOP
        SELECT q.message_id, q.usage_period_id, q.created, q.message_status
        INTO v_message_id, v_usage_period_id, v_created, v_message_status
        FROM public.tenant_email_queue_message_with_batch(
            p_organizacion_id,
            v_item.migration_id,
            v_item.domain_id,
            v_item.plan_id,
            v_item.template_id,
            v_item.template_version,
            v_item.message_kind,
            v_item.stream_name,
            v_item.idempotency_key,
            v_item.from_email,
            v_item.from_name,
            v_item.reply_to_email,
            v_item.to_email,
            v_item.subject,
            v_item.html_body,
            v_item.text_body,
            v_item.tag,
            COALESCE(v_item.max_attempts, 3),
            v_item.source_batch_id
        ) q;

        idempotency_key := v_item.idempotency_key;
        message_id := v_message_id;
        usage_period_id := v_usage_period_id;
        created := v_created;
        message_status := v_message_status;
        RETURN NEXT;
    END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_queue_messages_bulk(uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_queue_messages_bulk(uuid, jsonb)
    TO service_role;

COMMIT;
