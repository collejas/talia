BEGIN;

ALTER TABLE public.lead_movimientos
    DROP CONSTRAINT IF EXISTS lead_movimientos_fuente_check;

ALTER TABLE public.lead_movimientos
    ADD CONSTRAINT lead_movimientos_fuente_check
    CHECK (
        fuente = ANY (ARRAY['humano', 'asistente', 'api', 'contacto_auto'])
    );

COMMIT;
