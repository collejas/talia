-- Webhooks configurados por servidor y stream; no se mezclan entre tenants.
CREATE TABLE IF NOT EXISTS public.tenant_email_server_webhooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    server_id uuid NOT NULL,
    message_stream text NOT NULL,
    provider_webhook_id bigint NOT NULL,
    endpoint_url text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    verified_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_server_webhooks_status_check CHECK (status IN ('pending','verified','failed','disabled')),
    CONSTRAINT tenant_email_server_webhooks_stream_check CHECK (message_stream IN ('outbound','broadcast')),
    CONSTRAINT tenant_email_server_webhooks_unique UNIQUE (server_id, message_stream),
    CONSTRAINT tenant_email_server_webhooks_server_org_fkey
        FOREIGN KEY (organizacion_id, server_id)
        REFERENCES public.tenant_email_servers (organizacion_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_email_server_webhooks_org_idx
    ON public.tenant_email_server_webhooks (organizacion_id, status);

ALTER TABLE public.tenant_email_server_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_server_webhooks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_email_server_webhooks_service_role ON public.tenant_email_server_webhooks;
CREATE POLICY tenant_email_server_webhooks_service_role ON public.tenant_email_server_webhooks
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.tenant_email_webhook_receipts
    ADD COLUMN IF NOT EXISTS server_id uuid;
ALTER TABLE public.tenant_email_webhook_receipts
    DROP CONSTRAINT IF EXISTS tenant_email_webhook_receipts_server_org_fkey;
ALTER TABLE public.tenant_email_webhook_receipts
    ADD CONSTRAINT tenant_email_webhook_receipts_server_org_fkey
    FOREIGN KEY (organizacion_id, server_id)
    REFERENCES public.tenant_email_servers (organizacion_id, id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_suppressions_active_email_type_uq
    ON public.tenant_email_suppressions (organizacion_id, lower(email_address), suppression_type)
    WHERE active = true;
