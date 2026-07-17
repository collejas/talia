BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_mailbox_sync_state (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    mailbox_email text NOT NULL,
    folder_name text NOT NULL,
    last_seen_uid bigint NOT NULL DEFAULT 0,
    last_sync_at timestamptz,
    last_error text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_mailbox_sync_state IS
    'Estado de sincronización IMAP por tenant, buzón y carpeta para inbox/spam/junk.';
COMMENT ON COLUMN public.tenant_mailbox_sync_state.mailbox_email IS
    'Correo del buzón asistente que se está leyendo por IMAP.';
COMMENT ON COLUMN public.tenant_mailbox_sync_state.folder_name IS
    'Nombre lógico de carpeta IMAP revisada, por ejemplo INBOX o Spam.';
COMMENT ON COLUMN public.tenant_mailbox_sync_state.last_seen_uid IS
    'Último UID IMAP procesado correctamente en esa carpeta.';

ALTER TABLE public.tenant_mailbox_sync_state
    ADD CONSTRAINT tenant_mailbox_sync_state_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.tenant_mailbox_sync_state
    ADD CONSTRAINT tenant_mailbox_sync_state_uid_check
        CHECK (last_seen_uid >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_mailbox_sync_state_org_mailbox_folder_uidx
    ON public.tenant_mailbox_sync_state (organizacion_id, mailbox_email, folder_name);

CREATE INDEX IF NOT EXISTS tenant_mailbox_sync_state_org_mailbox_idx
    ON public.tenant_mailbox_sync_state (organizacion_id, mailbox_email);

DROP TRIGGER IF EXISTS t_tenant_mailbox_sync_state_set_org ON public.tenant_mailbox_sync_state;
CREATE TRIGGER t_tenant_mailbox_sync_state_set_org
    BEFORE INSERT ON public.tenant_mailbox_sync_state
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_tenant_mailbox_sync_state_touch_updated_at ON public.tenant_mailbox_sync_state;
CREATE TRIGGER t_tenant_mailbox_sync_state_touch_updated_at
    BEFORE UPDATE ON public.tenant_mailbox_sync_state
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMIT;
