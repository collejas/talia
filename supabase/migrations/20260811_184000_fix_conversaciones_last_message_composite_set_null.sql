BEGIN;

ALTER TABLE public.conversaciones
    DROP CONSTRAINT IF EXISTS conversaciones_ultimo_mensaje_org_fkey;

ALTER TABLE public.conversaciones
    ADD CONSTRAINT conversaciones_ultimo_mensaje_org_fkey
        FOREIGN KEY (organizacion_id, ultimo_mensaje_id)
        REFERENCES public.mensajes (organizacion_id, id)
        ON DELETE SET NULL (ultimo_mensaje_id)
        DEFERRABLE INITIALLY DEFERRED;

COMMIT;
