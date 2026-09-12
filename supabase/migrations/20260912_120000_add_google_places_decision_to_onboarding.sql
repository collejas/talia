BEGIN;

ALTER TABLE public.tenant_onboarding_progress
    ADD COLUMN IF NOT EXISTS google_places_decision text NOT NULL DEFAULT 'pendiente'
    CHECK (google_places_decision IN ('pendiente', 'usar', 'no_usar'));

COMMENT ON COLUMN public.tenant_onboarding_progress.google_places_decision IS
    'pendiente|usar|no_usar; no_usar permite completar Búsquedas sin activar Google Places.';

COMMIT;
