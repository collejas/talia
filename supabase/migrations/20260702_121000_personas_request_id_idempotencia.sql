BEGIN;

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS request_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'personas'
          AND indexname = 'personas_request_id_uidx'
    ) THEN
        CREATE UNIQUE INDEX personas_request_id_uidx
            ON public.personas (request_id)
            WHERE request_id IS NOT NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.personas.request_id
    IS 'Identificador de idempotencia para evitar duplicados en altas reintentadas de contactos.';

COMMIT;
