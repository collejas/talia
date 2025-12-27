BEGIN;

ALTER TABLE public.identidades_canal
    DROP CONSTRAINT IF EXISTS identidades_canal_canal_check;

ALTER TABLE public.identidades_canal
    ADD CONSTRAINT identidades_canal_canal_check
    CHECK (
        canal = ANY (ARRAY['whatsapp', 'instagram', 'webchat', 'voz', 'messenger'])
    );

ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversaciones_canal_check;

ALTER TABLE public.conversaciones
    ADD CONSTRAINT conversaciones_canal_check
    CHECK (
        canal = ANY (ARRAY['whatsapp', 'instagram', 'webchat', 'voz', 'manual', 'messenger'])
    );

COMMIT;
