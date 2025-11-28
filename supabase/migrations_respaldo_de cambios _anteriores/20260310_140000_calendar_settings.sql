BEGIN;

CREATE TABLE IF NOT EXISTS public.panel_calendar_settings (
    slug text PRIMARY KEY,
    reminder_enabled boolean NOT NULL DEFAULT true,
    reminder_offset_minutes integer NOT NULL DEFAULT 120 CHECK (reminder_offset_minutes BETWEEN 15 AND 720),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.panel_calendar_settings (slug, reminder_enabled, reminder_offset_minutes)
VALUES ('default', true, 120)
ON CONFLICT (slug) DO UPDATE
    SET reminder_enabled = EXCLUDED.reminder_enabled,
        reminder_offset_minutes = EXCLUDED.reminder_offset_minutes,
        updated_at = now();

COMMENT ON TABLE public.panel_calendar_settings IS
    'Preferencias del calendario para el panel (recordatorios, offsets, flags).';

COMMIT;
