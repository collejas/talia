BEGIN;

ALTER TABLE public.tenant_onboarding_progress
    ADD COLUMN IF NOT EXISTS web_tracking_decision text NOT NULL DEFAULT 'pendiente'
    CHECK (web_tracking_decision IN ('pendiente', 'usar', 'no_usar'));

COMMENT ON COLUMN public.tenant_onboarding_progress.web_tracking_decision IS
    'pendiente|usar|no_usar; no_usar permite completar el paso de Página Web sin activar tracking.';

COMMIT;
