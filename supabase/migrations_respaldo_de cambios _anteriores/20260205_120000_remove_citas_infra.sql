BEGIN;

-- Vistas del panel que dependían de la agenda de citas.
DROP VIEW IF EXISTS public.panel_agenda_calendario CASCADE;
DROP VIEW IF EXISTS public.panel_agenda_demos CASCADE;

-- Triggers y funciones asociadas a cambios automáticos en la tabla.
DROP TRIGGER IF EXISTS citas_sync_stage ON public.citas;
DROP TRIGGER IF EXISTS citas_touch_updated_at ON public.citas;
DROP FUNCTION IF EXISTS public.tg_citas_sync_stage() CASCADE;

-- Índices específicos de la agenda (la tabla se conserva sólo como histórico).
DROP INDEX IF EXISTS public.citas_active_unique;
DROP INDEX IF EXISTS public.citas_calendario_idx;
DROP INDEX IF EXISTS public.citas_created_by_idx;
DROP INDEX IF EXISTS public.citas_estado_idx;
DROP INDEX IF EXISTS public.citas_provider_event_id_idx;
DROP INDEX IF EXISTS public.citas_start_idx;
DROP INDEX IF EXISTS public.citas_tarjeta_idx;
DROP INDEX IF EXISTS public.citas_updated_by_idx;

-- Políticas y RLS ya no aplican si la tabla queda en modo sólo lectura.
DROP POLICY IF EXISTS citas_admin_all ON public.citas;
DROP POLICY IF EXISTS citas_delete ON public.citas;
DROP POLICY IF EXISTS citas_insert ON public.citas;
DROP POLICY IF EXISTS citas_modify ON public.citas;
DROP POLICY IF EXISTS citas_select ON public.citas;
DROP POLICY IF EXISTS citas_service_manage ON public.citas;
ALTER TABLE public.citas DISABLE ROW LEVEL SECURITY;

-- Helpers de disponibilidad y planificación (la tabla queda sin lógica asociada).
DROP FUNCTION IF EXISTS public.cita_slot_range(timestamptz, timestamptz) CASCADE;

DROP FUNCTION IF EXISTS public.fn_agenda_slots_disponibles(
    uuid, date, date, uuid, integer, integer, text, integer, uuid
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_agenda_slots_disponibles(
    uuid, date, date, integer, integer, text, integer, uuid
) CASCADE;

DROP FUNCTION IF EXISTS public.fn_cita_schedule(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb,
    text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_json_v1(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb,
    text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_schedule_json_v2(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb,
    text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) CASCADE;

DROP FUNCTION IF EXISTS public.fn_cita_reschedule(
    uuid, timestamptz, timestamptz, text, jsonb, text, timestamptz, uuid,
    boolean, text, text, timestamptz, text, text, text, text, text,
    public.cita_estado, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_reschedule_json_v4(
    uuid, timestamptz, timestamptz, text, jsonb, text, timestamptz, uuid,
    boolean, text, text, timestamptz, text, text, text, text, text,
    public.cita_estado, text, boolean
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_reschedule_json_payload_v4(jsonb) CASCADE;

DROP FUNCTION IF EXISTS public.fn_cita_cancel(
    uuid, text, boolean, uuid
) CASCADE;
DROP FUNCTION IF EXISTS public.fn_cita_upsert(
    uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, public.cita_estado,
    text, text, text, text, text, text, jsonb, text, uuid, uuid, boolean,
    timestamptz, boolean, timestamptz, text, text, text
) CASCADE;

COMMIT;
