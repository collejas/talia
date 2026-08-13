-- WhatsApp: identity/conversation resolution must be serialized per tenant and phone.
-- The active registrar function has been replaced by later migrations over time, so
-- patch its current definition without duplicating the whole function body here.
DO $patch$
DECLARE
    v_oid oid := to_regprocedure(
        'public.registrar_mensaje_whatsapp(text,text,text,text,jsonb,text,text,uuid,uuid,text,integer,integer,jsonb,jsonb,uuid)'
    );
    v_definition text;
    v_lock_block text := $lock$
    -- This lock covers both the persona lookup/creation and the open-conversation
    -- lookup/creation. It is transaction-scoped and tenant-specific.
    IF v_org IS NOT NULL OR v_phone_e164 IS NOT NULL OR NULLIF(p_whatsapp_id, '') IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtext('whatsapp_identity_lock'),
            hashtext(
                concat_ws(
                    '|',
                    COALESCE(v_org::text, 'orgless'),
                    COALESCE(NULLIF(v_phone_e164, ''), NULLIF(p_whatsapp_id, ''))
                )
            )
        );
    END IF;
$lock$;
    v_inactivity_block text := $inactive$
    IF p_direction = 'entrante' THEN
        IF v_conversacion_id IS NULL OR (
            v_last_activity IS NOT NULL AND v_last_activity < (v_now - make_interval(mins => v_minutes))
        ) THEN
            v_conversacion_id := NULL;
        END IF;
    END IF;
$inactive$;
BEGIN
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'registrar_mensaje_whatsapp signature not found';
    END IF;

    SELECT pg_get_functiondef(v_oid) INTO v_definition;

    IF position('whatsapp_identity_lock' IN v_definition) > 0 THEN
        RETURN;
    END IF;

    IF position(v_inactivity_block IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Expected WhatsApp inactivity block not found';
    END IF;

    v_definition := replace(
        v_definition,
        '    IF p_message_sid IS NOT NULL THEN',
        v_lock_block || E'\n\n    IF p_message_sid IS NOT NULL THEN'
    );
    v_definition := replace(
        v_definition,
        v_inactivity_block,
        '    -- An open conversation is reusable regardless of idle time. A new\n'
        '    -- conversation is created only after the previous one is explicitly closed.'
    );

    EXECUTE v_definition;
END;
$patch$;

COMMENT ON FUNCTION public.registrar_mensaje_whatsapp(
    text, text, text, text, jsonb, text, text, uuid, uuid, text, integer, integer, jsonb, jsonb, uuid
) IS 'Registra mensajes WhatsApp con identidad por tenant+teléfono serializada y reutiliza conversaciones no cerradas.';
