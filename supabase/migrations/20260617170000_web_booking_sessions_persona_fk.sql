BEGIN;

ALTER TABLE public.web_booking_sessions
    ADD COLUMN IF NOT EXISTS persona_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'web_booking_sessions_persona_id_fkey'
    ) THEN
        ALTER TABLE public.web_booking_sessions
            ADD CONSTRAINT web_booking_sessions_persona_id_fkey
            FOREIGN KEY (persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;
    END IF;
END
$$;

UPDATE public.web_booking_sessions
SET persona_id = contacto_id
WHERE persona_id IS NULL
  AND contacto_id IS NOT NULL;

UPDATE public.web_booking_sessions
SET contacto_id = persona_id
WHERE contacto_id IS NULL
  AND persona_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS web_booking_sessions_org_persona_opened_idx
    ON public.web_booking_sessions USING btree (organizacion_id, persona_id, opened_at DESC);

COMMENT ON COLUMN public.web_booking_sessions.persona_id IS
'Identificador de la persona asociada a la sesion de agenda publica. Compatibilidad con contacto_id legacy.';

COMMIT;
