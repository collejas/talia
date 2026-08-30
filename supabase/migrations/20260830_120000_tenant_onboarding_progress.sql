BEGIN;

-- Decisiones explícitas del tenant para el flujo guiado. El avance de cada
-- paso se calcula a partir de la configuración existente; esta tabla solo
-- guarda decisiones que no pueden distinguirse de un campo vacío.
CREATE TABLE IF NOT EXISTS public.tenant_onboarding_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL UNIQUE
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    webchat_decision text NOT NULL DEFAULT 'pendiente'
        CHECK (webchat_decision IN ('pendiente', 'usar', 'no_usar')),
    voz_decision text NOT NULL DEFAULT 'pendiente'
        CHECK (voz_decision IN ('pendiente', 'usar', 'no_usar')),
    ultimo_paso text,
    ultimo_paso_actualizado_en timestamptz,
    actualizado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_onboarding_progress_actualizado_por_idx
    ON public.tenant_onboarding_progress (actualizado_por);

COMMENT ON TABLE public.tenant_onboarding_progress IS
    'Decisiones y posición del tenant dentro de la configuración guiada.';
COMMENT ON COLUMN public.tenant_onboarding_progress.webchat_decision IS
    'pendiente|usar|no_usar; no_usar permite completar el paso sin activar el canal.';
COMMENT ON COLUMN public.tenant_onboarding_progress.voz_decision IS
    'pendiente|usar|no_usar; no_usar permite completar el paso sin activar el canal.';

COMMIT;
