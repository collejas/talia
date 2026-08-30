BEGIN;

ALTER TABLE public.tenant_onboarding_progress
    ADD COLUMN IF NOT EXISTS zoom_decision text NOT NULL DEFAULT 'pendiente'
    CHECK (zoom_decision IN ('pendiente', 'usar', 'no_usar'));

COMMENT ON COLUMN public.tenant_onboarding_progress.zoom_decision IS
    'pendiente|usar|no_usar; no_usar permite completar Zoom sin activar la integración.';

COMMIT;
