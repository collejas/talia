BEGIN;

-- `openai_request_usage.contact_id` conserva el nombre por compatibilidad,
-- pero a partir de la migración del modelo nuevo debe apuntar a `personas(id)`.
-- El runtime ya envía `persona_id` en este campo; esta migración solo alinea
-- la restricción referencial con el modelo operativo vigente.

ALTER TABLE public.openai_request_usage
    DROP CONSTRAINT IF EXISTS openai_request_usage_contact_id_fkey;

ALTER TABLE public.openai_request_usage
    ADD CONSTRAINT openai_request_usage_contact_id_fkey
    FOREIGN KEY (contact_id)
    REFERENCES public.personas (id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.openai_request_usage.contact_id IS
    'Compatibilidad temporal: almacena personas.id aunque el nombre de columna permanezca como contact_id.';

COMMIT;
