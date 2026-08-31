BEGIN;

-- El estado de sincronización es operativo y se actualiza exclusivamente desde
-- el backend mediante service_role. Un usuario autenticado solo puede consultar
-- el estado de su propia organización.
ALTER TABLE public.tenant_mailbox_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_mailbox_sync_state FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_mailbox_sync_state FROM anon;
REVOKE ALL ON public.tenant_mailbox_sync_state FROM authenticated;
GRANT SELECT ON public.tenant_mailbox_sync_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_mailbox_sync_state TO service_role;

DROP POLICY IF EXISTS tenant_mailbox_sync_state_member_select
    ON public.tenant_mailbox_sync_state;

CREATE POLICY tenant_mailbox_sync_state_member_select
    ON public.tenant_mailbox_sync_state
    FOR SELECT
    TO authenticated
    USING (
        organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

COMMENT ON TABLE public.tenant_mailbox_sync_state IS
    'Estado de sincronización IMAP por tenant, buzón y carpeta; protegido por organización mediante RLS y escrito solo por el backend.';

COMMIT;
