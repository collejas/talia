-- Seed de ejemplo para agenda_calendarios y agenda_disponibilidad
-- Ejecutar en entornos de desarrollo o staging después de aplicar
-- la migración 20260105_090000_agenda_disponibilidad.sql.

BEGIN;

-- Calendario principal de demos Tal-IA
INSERT INTO public.agenda_calendarios (
    id,
    nombre,
    descripcion,
    provider,
    provider_calendar_id,
    timezone,
    capacidad,
    metadata
) VALUES (
    '00000000-0000-4000-8000-000000000001',
    'Tal-IA · Calendario principal',
    'Agenda dedicada a demos gestionadas por Tal-IA',
    'caldav',
    'https://mail.talia.mx:2080/calendars/hola@talia.mx/calendar',
    'America/Mexico_City',
    1,
    jsonb_build_object('ia_managed', true)
)
ON CONFLICT (id) DO UPDATE
SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    provider = EXCLUDED.provider,
    provider_calendar_id = EXCLUDED.provider_calendar_id,
    timezone = EXCLUDED.timezone,
    capacidad = EXCLUDED.capacidad,
    metadata = EXCLUDED.metadata,
    activo = true,
    actualizado_en = NOW();

-- Bloques laborales (lunes-viernes 09:00-18:00)
INSERT INTO public.agenda_disponibilidad (
    calendario_id,
    weekday,
    start_time,
    end_time,
    capacidad,
    metadata
) VALUES
    ('00000000-0000-4000-8000-000000000001', 0, '09:00', '18:00', 1, '{}'::jsonb),
    ('00000000-0000-4000-8000-000000000001', 1, '09:00', '18:00', 1, '{}'::jsonb),
    ('00000000-0000-4000-8000-000000000001', 2, '09:00', '18:00', 1, '{}'::jsonb),
    ('00000000-0000-4000-8000-000000000001', 3, '09:00', '18:00', 1, '{}'::jsonb),
    ('00000000-0000-4000-8000-000000000001', 4, '09:00', '18:00', 1, '{}'::jsonb)
ON CONFLICT (calendario_id, weekday, start_time, end_time) DO UPDATE
SET
    capacidad = EXCLUDED.capacidad,
    metadata = EXCLUDED.metadata,
    activo = true,
    actualizado_en = NOW();

COMMIT;
