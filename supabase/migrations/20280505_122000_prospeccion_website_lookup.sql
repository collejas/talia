BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS website_lookup_status text NOT NULL DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS website_lookup_error text,
    ADD COLUMN IF NOT EXISTS website_lookup_checked_en timestamptz,
    ADD COLUMN IF NOT EXISTS website_http_status integer,
    ADD COLUMN IF NOT EXISTS website_final_url text,
    ADD COLUMN IF NOT EXISTS website_dns_ok boolean,
    ADD COLUMN IF NOT EXISTS website_reachable boolean,
    ADD COLUMN IF NOT EXISTS website_functional boolean,
    ADD COLUMN IF NOT EXISTS website_tls_ok boolean;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_website_lookup_status_idx
    ON public.prospeccion_prospectos (website_lookup_status);

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_website_lookup_checked_en_idx
    ON public.prospeccion_prospectos (website_lookup_checked_en DESC);

COMMIT;
