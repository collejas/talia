BEGIN;

ALTER TABLE public.busquedas
    ADD COLUMN IF NOT EXISTS metadata jsonb GENERATED ALWAYS AS (COALESCE(meta, '{}'::jsonb)) STORED;

COMMENT ON COLUMN public.busquedas.metadata IS
    'Alias para compatibilidad con triggers y funciones que esperan metadata.';

COMMIT;
