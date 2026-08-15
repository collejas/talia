BEGIN;

ALTER TABLE public.tenant_web_tracking_domains
    ADD COLUMN IF NOT EXISTS verification_token text,
    ADD COLUMN IF NOT EXISTS verification_last_attempt_at timestamptz,
    ADD COLUMN IF NOT EXISTS verification_attempt_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS verification_error_code text,
    ADD COLUMN IF NOT EXISTS verification_error_message text;

ALTER TABLE public.tenant_web_tracking_domains
    DROP CONSTRAINT IF EXISTS tenant_web_tracking_domains_verification_attempt_count_check;

ALTER TABLE public.tenant_web_tracking_domains
    ADD CONSTRAINT tenant_web_tracking_domains_verification_attempt_count_check
        CHECK (verification_attempt_count >= 0);

UPDATE public.tenant_web_tracking_domains
SET verification_token = 'talia_verify_' || replace(gen_random_uuid()::text, '-', '')
WHERE verification_token IS NULL;

COMMENT ON COLUMN public.tenant_web_tracking_domains.verification_token IS
'Desafio público de verificación del dominio; no es una credencial de acceso.';

COMMENT ON COLUMN public.tenant_web_tracking_domains.verification_error_message IS
'Último error operativo de verificación, sin guardar respuestas completas del proveedor DNS.';

COMMIT;
