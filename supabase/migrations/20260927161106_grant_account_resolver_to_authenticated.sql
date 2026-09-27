-- The account resolver is SECURITY INVOKER and is called by CRM triggers
-- during authenticated opportunity and account-person relation writes.
REVOKE ALL ON FUNCTION public.crm_resolver_cuenta_unica_contacto(uuid, uuid)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_resolver_cuenta_unica_contacto(uuid, uuid)
    TO authenticated, service_role;
