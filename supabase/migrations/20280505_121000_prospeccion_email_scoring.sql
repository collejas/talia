BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS email_quality_tier text,
    ADD COLUMN IF NOT EXISTS email_risk_score integer,
    ADD COLUMN IF NOT EXISTS email_recommendation text;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_email_risk_score_idx
    ON public.prospeccion_prospectos (email_risk_score);

COMMIT;

