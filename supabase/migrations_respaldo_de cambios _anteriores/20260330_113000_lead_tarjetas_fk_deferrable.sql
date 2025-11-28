BEGIN;

ALTER TABLE public.lead_tarjetas
    DROP CONSTRAINT IF EXISTS lead_tarjetas_contacto_id_fkey;

ALTER TABLE public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_contacto_id_fkey
    FOREIGN KEY (contacto_id)
    REFERENCES public.contactos(id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

COMMIT;
