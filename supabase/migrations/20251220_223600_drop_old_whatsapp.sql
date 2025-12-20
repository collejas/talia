-- Elimina la versión antigua de registrar_mensaje_whatsapp (sin p_organizacion_id)
-- para evitar que PostgREST la elija cuando el payload incluye el tenant.

DROP FUNCTION IF EXISTS public.registrar_mensaje_whatsapp(
    text,  -- p_direction
    text,  -- p_whatsapp_id
    text,  -- p_phone_e164
    text,  -- p_body
    jsonb, -- p_metadata
    text,  -- p_message_sid
    text,  -- p_profile_name
    uuid,  -- p_conversation_id
    uuid,  -- p_contact_id
    text,  -- p_response_id
    integer, -- p_inactivity_hours
    integer, -- p_inactivity_minutes
    jsonb,   -- p_attachments
    jsonb    -- p_webhook_payload
);
