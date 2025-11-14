BEGIN;

-- Elimina dependencias de calendarios externos en la tabla principal.
ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS citas_calendario_range_excl;
ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS citas_calendario_id_fkey;
ALTER TABLE public.citas DROP COLUMN IF EXISTS calendario_id;

-- Tablas auxiliares de disponibilidad/calendarios que ya no se utilizarán.
DROP TABLE IF EXISTS public.agenda_bloqueos CASCADE;
DROP TABLE IF EXISTS public.agenda_excepciones CASCADE;
DROP TABLE IF EXISTS public.agenda_disponibilidad CASCADE;
DROP TABLE IF EXISTS public.agenda_calendarios CASCADE;

-- Función auxiliar de rangos utilizada por las tablas anteriores.
DROP FUNCTION IF EXISTS public.cita_slot_range(timestamptz, timestamptz) CASCADE;

-- Funciones RPC de disponibilidad y planificación.
DROP FUNCTION IF EXISTS public.fn_agenda_slots_disponibles(
    uuid, date, date, uuid, integer, integer, text, integer, uuid
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_agenda_slots_disponibles(
    uuid, date, date, integer, integer, text, integer, uuid
) CASCADE;

DROP FUNCTION IF EXISTS public.fn_cita_schedule(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_v2(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_v3(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_rpc(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_json(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_json_v1(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_json_v2(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_json_v1_rpc(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_json_payload_v1(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_json_payload_v2(jsonb) CASCADE;

DROP FUNCTION IF EXISTS public.fn_cita_reschedule(
    uuid, timestamptz, timestamptz, text, jsonb, text, timestamptz, uuid, boolean, text, text, timestamptz, text, text, text, text, text, public.cita_estado, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_reschedule_json_v1(
    uuid, timestamptz, timestamptz, text, jsonb, text, timestamptz, uuid, boolean, text, text, timestamptz, text, text, text, text, text, public.cita_estado, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_reschedule_json_v2(
    uuid, timestamptz, timestamptz, text, jsonb, text, timestamptz, uuid, boolean, text, text, timestamptz, text, text, text, text, text, public.cita_estado, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_reschedule_json_v3(
    uuid, timestamptz, timestamptz, text, jsonb, text, timestamptz, uuid, boolean, text, text, timestamptz, text, text, text, text, text, public.cita_estado, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_reschedule_json_payload_v1(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_reschedule_json_payload_v2(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_reschedule_json_payload_v3(jsonb) CASCADE;

-- Funciones de mutación directa sobre citas.
DROP FUNCTION IF EXISTS public.fn_cita_upsert(
    uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, public.cita_estado, text, text, text, text, text, text, jsonb, text, uuid, uuid, boolean, timestamptz, boolean, timestamptz, text, text, text
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_cancel(uuid, text, boolean, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_cancel(uuid, text, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_cancel(uuid, text) CASCADE;

COMMIT;
