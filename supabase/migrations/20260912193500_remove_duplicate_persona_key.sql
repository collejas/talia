BEGIN;

ALTER TABLE public.clientes
    DROP CONSTRAINT IF EXISTS clientes_persona_org_fkey;

ALTER TABLE public.personas
    DROP CONSTRAINT IF EXISTS personas_organizacion_id_key;

ALTER TABLE public.clientes
    ADD CONSTRAINT clientes_persona_org_fkey
        FOREIGN KEY (organizacion_id, persona_id)
        REFERENCES public.personas (organizacion_id, id)
        ON DELETE RESTRICT;

COMMIT;
