BEGIN;

ALTER TABLE public.organizaciones
    ADD COLUMN IF NOT EXISTS correo_contacto_obligatorio boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizaciones.correo_contacto_obligatorio IS
    'Define si el correo principal es obligatorio al crear o editar contactos en la organización.';

COMMIT;
