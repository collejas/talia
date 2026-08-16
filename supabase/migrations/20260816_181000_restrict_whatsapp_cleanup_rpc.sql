BEGIN;

REVOKE EXECUTE ON FUNCTION public.crm_delete_whatsapp_persona_if_safe(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_delete_whatsapp_persona_if_safe(uuid, uuid)
    TO service_role;

COMMIT;
