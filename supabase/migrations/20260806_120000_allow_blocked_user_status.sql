BEGIN;

-- La pantalla de usuarios permite bloquear cuentas; el constraint original
-- solo contemplaba activo e inactivo.
ALTER TABLE public.usuarios
    DROP CONSTRAINT IF EXISTS usuarios_estado_check;

ALTER TABLE public.usuarios
    ADD CONSTRAINT usuarios_estado_check
    CHECK (estado = ANY (ARRAY['activo'::text, 'inactivo'::text, 'bloqueado'::text]));

COMMIT;
