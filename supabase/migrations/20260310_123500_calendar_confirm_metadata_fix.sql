BEGIN;

DROP FUNCTION IF EXISTS public.fn_calendar_confirm_slot(uuid, text, jsonb, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.fn_calendar_reschedule_booking(uuid, timestamptz, text, jsonb) CASCADE;

CREATE FUNCTION public.fn_calendar_confirm_slot(
    p_hold_id uuid,
    p_notes text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_meeting_url text DEFAULT NULL,
    p_external_join_url text DEFAULT NULL
) RETURNS TABLE (
    booking_id uuid,
    resource_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    timezone text,
    status text,
    hold_id uuid,
    tarjeta_id uuid,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_hold public.calendar_slot_holds%ROWTYPE;
    v_resource public.calendar_resources%ROWTYPE;
    v_capacity integer;
    v_booked integer;
    v_booking_id uuid;
BEGIN
    IF p_hold_id IS NULL THEN
        RAISE EXCEPTION 'hold_id_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_hold
    FROM public.calendar_slot_holds
    WHERE id = p_hold_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'hold_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_hold.status <> 'active' THEN
        RAISE EXCEPTION 'hold_not_active' USING ERRCODE = 'P0001';
    END IF;

    IF v_hold.expires_at <= now() THEN
        UPDATE public.calendar_slot_holds
        SET status = 'expired'
        WHERE id = p_hold_id;
        RAISE EXCEPTION 'hold_expired' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_resource
    FROM public.calendar_resources
    WHERE id = v_hold.resource_id;

    IF NOT FOUND OR NOT v_resource.is_active THEN
        RAISE EXCEPTION 'calendar_resource_not_found' USING ERRCODE = 'P0002';
    END IF;

    v_capacity := v_resource.capacity_per_slot;

    SELECT COUNT(*)
    INTO v_booked
    FROM public.calendar_bookings cb
    WHERE cb.resource_id = v_resource.id
      AND cb.status = 'confirmed'
      AND cb.start_at < v_hold.end_at
      AND cb.end_at > v_hold.start_at;

    IF v_booked >= v_capacity THEN
        RAISE EXCEPTION 'slot_already_booked' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.calendar_bookings (
        resource_id,
        hold_id,
        contact_id,
        conversacion_id,
        tarjeta_id,
        start_at,
        end_at,
        timezone,
        status,
        notes,
        meeting_url,
        external_join_url,
        metadata,
        created_at,
        updated_at
    ) VALUES (
        v_resource.id,
        v_hold.id,
        v_hold.contact_id,
        v_hold.conversacion_id,
        v_hold.tarjeta_id,
        v_hold.start_at,
        v_hold.end_at,
        v_resource.timezone,
        'confirmed',
        NULLIF(p_notes, ''),
        NULLIF(p_meeting_url, ''),
        NULLIF(p_external_join_url, ''),
        COALESCE(p_metadata, '{}'::jsonb),
        now(),
        now()
    ) RETURNING id INTO v_booking_id;

    UPDATE public.calendar_slot_holds
    SET status = 'confirmed', updated_at = now()
    WHERE id = p_hold_id;

    RETURN QUERY
    SELECT
        cb.id,
        cb.resource_id,
        cb.start_at,
        cb.end_at,
        cb.timezone,
        cb.status,
        cb.hold_id,
        cb.tarjeta_id,
        cb.metadata
    FROM public.calendar_bookings cb
    WHERE cb.id = v_booking_id;
END;
$$;

CREATE FUNCTION public.fn_calendar_reschedule_booking(
    p_booking_id uuid,
    p_new_slot_start timestamptz,
    p_notes text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
    booking_id uuid,
    resource_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    timezone text,
    status text,
    hold_id uuid,
    tarjeta_id uuid,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_booking public.calendar_bookings%ROWTYPE;
    v_new_hold record;
    v_old_hold uuid;
BEGIN
    IF p_booking_id IS NULL OR p_new_slot_start IS NULL THEN
        RAISE EXCEPTION 'booking_and_slot_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_booking
    FROM public.calendar_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_booking.status <> 'confirmed' THEN
        RAISE EXCEPTION 'booking_not_confirmed' USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO v_new_hold
    FROM public.fn_calendar_hold_slot(
        v_booking.resource_id,
        p_new_slot_start,
        v_booking.conversacion_id,
        v_booking.contact_id,
        5,
        jsonb_build_object('reschedule_from', v_booking.start_at),
        v_booking.tarjeta_id
    ) AS hold_data;

    UPDATE public.calendar_slot_holds
    SET status = 'confirmed',
        metadata = metadata || jsonb_build_object('confirmed_via', 'reschedule', 'confirmed_at', now()),
        updated_at = now()
    WHERE id = v_new_hold.hold_id;

    v_old_hold := v_booking.hold_id;

    UPDATE public.calendar_bookings
    SET start_at = v_new_hold.slot_start,
        end_at = v_new_hold.slot_end,
        hold_id = v_new_hold.hold_id,
        tarjeta_id = v_booking.tarjeta_id,
        metadata = metadata || COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
            'rescheduled_from', v_booking.start_at,
            'rescheduled_at', now()
        ),
        notes = COALESCE(NULLIF(p_notes, ''), notes),
        updated_at = now()
    WHERE id = v_booking.id;

    IF v_old_hold IS NOT NULL THEN
        PERFORM * FROM public.fn_calendar_release_hold(v_old_hold, 'rescheduled');
    END IF;

    RETURN QUERY
    SELECT
        cb.id,
        cb.resource_id,
        cb.start_at,
        cb.end_at,
        cb.timezone,
        cb.status,
        cb.hold_id,
        cb.tarjeta_id,
        cb.metadata
    FROM public.calendar_bookings cb
    WHERE cb.id = v_booking.id;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_confirm_slot(uuid, text, jsonb, text, text)
    IS 'Convierte un hold activo en una cita confirmada dentro del calendario.';

COMMENT ON FUNCTION public.fn_calendar_reschedule_booking(uuid, timestamptz, text, jsonb)
    IS 'Genera un nuevo hold, actualiza la cita con el horario elegido y libera el hold anterior.';

COMMIT;
