BEGIN;

ALTER TABLE public.tenant_email_sync_runs
    ADD COLUMN IF NOT EXISTS provider_filter text NOT NULL DEFAULT 'HardBounce';

COMMENT ON COLUMN public.tenant_email_sync_runs.provider_filter IS
    'Filtro del proveedor procesado por esta ejecución: HardBounce, SpamComplaint o Unsubscribe.';

COMMIT;
