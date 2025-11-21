BEGIN;

CREATE INDEX IF NOT EXISTS calendar_bookings_hold_id_idx
    ON public.calendar_bookings (hold_id);

DROP INDEX IF EXISTS public.uniq_ejecuciones_run_id;

COMMIT;
