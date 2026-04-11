BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS email_domain_relation text;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_email_domain_relation_idx
    ON public.prospeccion_prospectos (email_domain_relation);

COMMIT;
