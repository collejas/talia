BEGIN;

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.usuarios.timezone IS
    'Zona horaria IANA preferida del usuario (ej. America/Mexico_City).';

COMMIT;
