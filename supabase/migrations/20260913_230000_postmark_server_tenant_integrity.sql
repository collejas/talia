BEGIN;

-- La referencia simple a server_id no basta: también debe coincidir el tenant.
-- Esto evita una asignación cruzada por error o por una petición manipulada.
ALTER TABLE public.tenant_email_servers
    ADD CONSTRAINT tenant_email_servers_org_id_unique UNIQUE (organizacion_id, id);

ALTER TABLE public.tenant_email_domains
    DROP CONSTRAINT IF EXISTS tenant_email_domains_server_fkey;
ALTER TABLE public.tenant_email_domains
    ADD CONSTRAINT tenant_email_domains_server_org_fkey
    FOREIGN KEY (organizacion_id, server_id)
    REFERENCES public.tenant_email_servers (organizacion_id, id)
    ON DELETE RESTRICT;

ALTER TABLE public.tenant_email_messages
    DROP CONSTRAINT IF EXISTS tenant_email_messages_server_fkey;
ALTER TABLE public.tenant_email_messages
    ADD CONSTRAINT tenant_email_messages_server_org_fkey
    FOREIGN KEY (organizacion_id, server_id)
    REFERENCES public.tenant_email_servers (organizacion_id, id)
    ON DELETE RESTRICT;

COMMENT ON CONSTRAINT tenant_email_domains_server_org_fkey ON public.tenant_email_domains IS
    'El dominio solo puede usar el servidor Postmark de su mismo tenant.';
COMMENT ON CONSTRAINT tenant_email_messages_server_org_fkey ON public.tenant_email_messages IS
    'El mensaje solo puede conservar el servidor Postmark de su mismo tenant.';

COMMIT;
