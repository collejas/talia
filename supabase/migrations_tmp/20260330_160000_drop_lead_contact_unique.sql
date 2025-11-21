BEGIN;

ALTER TABLE public.lead_tarjetas
    DROP CONSTRAINT IF EXISTS lead_tarjetas_contacto_tablero_key;

COMMIT;
