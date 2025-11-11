BEGIN;

DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN
        SELECT pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_cita_schedule_v2'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.fn_cita_schedule_v2(%s);', rec.args);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cita_schedule_v2(
    p_tarjeta_id uuid,
    p_contacto_id uuid,
    p_conversacion_id uuid,
    p_start_at timestamptz,
    p_calendario_id uuid DEFAULT NULL,
    p_end_at timestamptz DEFAULT NULL,
    p_timezone text DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_provider text DEFAULT NULL,
    p_meeting_url text DEFAULT NULL,
    p_location text DEFAULT NULL,
    p_external_join_url text DEFAULT NULL,
    p_reminder_sent_at timestamptz DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_updated_by uuid DEFAULT NULL,
    p_scheduled_via text DEFAULT 'ia',
    p_reminder_status text DEFAULT NULL,
    p_merge_metadata boolean DEFAULT TRUE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_calendario uuid;
    v_timezone text;
    v_provider text;
    v_row public.citas;
    v_end_at timestamptz;
    v_slot_minutes integer;
    v_slot record;
    v_start_day date;
BEGIN
    IF p_tarjeta_id IS NULL OR p_contacto_id IS NULL THEN
        RAISE EXCEPTION 'tarjeta_y_contacto_requeridos' USING ERRCODE = '23514';
    END IF;
    IF p_start_at IS NULL THEN
        RAISE EXCEPTION 'start_at_requerido' USING ERRCODE = '23514';
    END IF;

    v_end_at := COALESCE(p_end_at, p_start_at + INTERVAL '45 minutes');
    v_slot_minutes := GREATEST(CEIL(EXTRACT(EPOCH FROM (v_end_at - p_start_at)) / 60)::int, 1);

    IF p_calendario_id IS NOT NULL THEN
        SELECT ac.id, ac.timezone, ac.provider INTO v_calendario, v_timezone, v_provider
        FROM public.agenda_calendarios ac
        WHERE ac.id = p_calendario_id AND ac.activo IS TRUE
        LIMIT 1;
    ELSE
        SELECT ac.id, ac.timezone, ac.provider INTO v_calendario, v_timezone, v_provider
        FROM public.agenda_calendarios ac
        WHERE ac.activo IS TRUE
        ORDER BY ac.creado_en
        LIMIT 1;
    END IF;

    IF v_calendario IS NULL THEN
        RAISE EXCEPTION 'calendario_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF p_timezone IS NOT NULL AND btrim(p_timezone) <> '' THEN
        v_timezone := p_timezone;
    END IF;
    IF v_timezone IS NULL OR btrim(v_timezone) = '' THEN
        v_timezone := 'America/Mexico_City';
    END IF;

    v_provider := lower(COALESCE(p_provider, v_provider, 'hosting'));
    IF v_provider NOT IN ('hosting','google','caldav') THEN
        RAISE EXCEPTION 'provider_invalid' USING ERRCODE = '23514';
    END IF;

    v_start_day := (p_start_at AT TIME ZONE v_timezone)::date;
    SELECT *
    INTO v_slot
    FROM public.fn_agenda_slots_disponibles(
        NULL::uuid,
        v_start_day,
        v_start_day,
        v_calendario,
        v_slot_minutes,
        15,
        v_timezone,
        24,
        NULL
    )
    WHERE start_at = p_start_at;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'slot_not_available' USING ERRCODE = 'P0001';
    END IF;

    SELECT public.fn_cita_upsert(
        p_tarjeta_id => p_tarjeta_id,
        p_contacto_id => p_contacto_id,
        p_conversacion_id => p_conversacion_id,
        p_start_at => p_start_at,
        p_end_at => v_end_at,
        p_timezone => v_timezone,
        p_provider => v_provider,
        p_meeting_url => p_meeting_url,
        p_location => p_location,
        p_notes => p_notes,
        p_metadata => p_metadata,
        p_external_join_url => p_external_join_url,
        p_reminder_sent_at => p_reminder_sent_at,
        p_created_by => p_created_by,
        p_updated_by => p_updated_by,
        p_merge_metadata => p_merge_metadata,
        p_reminder_status => p_reminder_status,
        p_scheduled_via => COALESCE(lower(p_scheduled_via), 'ia')
    )
    INTO v_row;

    UPDATE public.citas
    SET calendario_id = v_calendario
    WHERE id = v_row.id
      AND (calendario_id IS DISTINCT FROM v_calendario);

    SELECT * INTO v_row FROM public.citas WHERE id = v_row.id;

    RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION public.fn_cita_schedule_v2(
    uuid, uuid, uuid, timestamptz, uuid, timestamptz, text, jsonb, text, text, text, text, text, timestamptz, uuid, uuid, text, text, boolean
) IS 'Agenda una cita y devuelve la fila completa de public.citas en formato JSON.';

COMMIT;
