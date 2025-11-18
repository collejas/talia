BEGIN;

ALTER TABLE public.lead_tarjetas
    DROP CONSTRAINT IF EXISTS lead_tarjetas_fuente_check;

ALTER TABLE public.lead_tarjetas
    ADD CONSTRAINT lead_tarjetas_fuente_check
    CHECK (
        fuente IS NULL
        OR fuente = ANY (ARRAY['humano', 'asistente', 'api', 'contacto_auto'])
    );

COMMIT;
