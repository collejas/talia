BEGIN;

ALTER TABLE public.conversation_summaries
    ADD COLUMN IF NOT EXISTS persona_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'conversation_summaries_persona_org_fkey'
    ) THEN
        ALTER TABLE public.conversation_summaries
            ADD CONSTRAINT conversation_summaries_persona_org_fkey
            FOREIGN KEY (organizacion_id, persona_id)
            REFERENCES public.personas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS conversation_summaries_persona_org_idx
    ON public.conversation_summaries (organizacion_id, persona_id, creado_en DESC);

COMMENT ON COLUMN public.conversation_summaries.persona_id IS
    'Persona asociada al resumen conversacional. Sustituye el uso legacy de contacto_id para flujos IA.';

COMMIT;
