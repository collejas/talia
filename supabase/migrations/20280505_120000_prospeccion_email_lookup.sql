BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS email_lookup_status text NOT NULL DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS email_lookup_error text,
    ADD COLUMN IF NOT EXISTS email_lookup_checked_en timestamptz,
    ADD COLUMN IF NOT EXISTS email_lookup_details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_email_lookup_status_idx
    ON public.prospeccion_prospectos (email_lookup_status);

COMMIT;

