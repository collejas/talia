BEGIN;

ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversaciones_canal_check;

ALTER TABLE public.conversaciones
    ADD CONSTRAINT conversaciones_canal_check
    CHECK (
        canal = ANY (ARRAY['whatsapp', 'instagram', 'webchat', 'voz', 'manual'])
    );

COMMIT;
