BEGIN;

ALTER TABLE public.calendar_bookings
    ADD COLUMN IF NOT EXISTS reminder_status text DEFAULT 'pending' CHECK (reminder_status IN ('pending','queued','sent','failed')),
    ADD COLUMN IF NOT EXISTS reminder_scheduled_at timestamptz,
    ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS reminder_error text;

CREATE OR REPLACE FUNCTION public.fn_calendar_schedule_reminder()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.reminder_status := COALESCE(NEW.reminder_status, 'pending');
    IF NEW.status = 'confirmed' AND NEW.reminder_status = 'pending' THEN
        NEW.reminder_scheduled_at := NEW.start_at - INTERVAL '2 hours';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_bookings_schedule_reminder ON public.calendar_bookings;
CREATE TRIGGER calendar_bookings_schedule_reminder
BEFORE INSERT ON public.calendar_bookings
FOR EACH ROW EXECUTE FUNCTION public.fn_calendar_schedule_reminder();

CREATE OR REPLACE FUNCTION public.fn_calendar_due_reminders(
    p_now timestamptz DEFAULT now(),
    p_limit integer DEFAULT 50
) RETURNS TABLE (
    booking_id uuid,
    contact_id uuid,
    conversacion_id uuid,
    tarjeta_id uuid,
    start_at timestamptz,
    timezone text,
    reminder_scheduled_at timestamptz
)
LANGUAGE sql
AS $$
    SELECT
        cb.id,
        cb.contact_id,
        cb.conversacion_id,
        cb.tarjeta_id,
        cb.start_at,
        cb.timezone,
        cb.reminder_scheduled_at
    FROM public.calendar_bookings cb
    WHERE cb.status = 'confirmed'
      AND cb.reminder_status = 'pending'
      AND cb.reminder_scheduled_at IS NOT NULL
      AND cb.reminder_scheduled_at <= p_now
    ORDER BY cb.reminder_scheduled_at
    LIMIT COALESCE(NULLIF(p_limit, 0), 50);
$$;

CREATE OR REPLACE FUNCTION public.fn_calendar_mark_reminder_sent(
    p_booking_id uuid,
    p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id_required' USING ERRCODE = '22023';
    END IF;

    IF p_error IS NULL THEN
        UPDATE public.calendar_bookings
        SET reminder_status = 'sent',
            reminder_sent_at = now(),
            reminder_error = NULL
        WHERE id = p_booking_id;
    ELSE
        UPDATE public.calendar_bookings
        SET reminder_status = 'failed',
            reminder_error = p_error
        WHERE id = p_booking_id;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_due_reminders(timestamptz, integer)
    IS 'Devuelve citas con recordatorios pendientes que ya están dentro de la ventana configurada.';

COMMENT ON FUNCTION public.fn_calendar_mark_reminder_sent(uuid, text)
    IS 'Marca un recordatorio como enviado o fallido según el parámetro proporcionado.';

COMMIT;
