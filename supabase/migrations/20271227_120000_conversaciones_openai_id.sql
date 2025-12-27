BEGIN;

ALTER TABLE public.conversaciones
    ADD COLUMN IF NOT EXISTS conversacion_openai_id text;

COMMIT;
