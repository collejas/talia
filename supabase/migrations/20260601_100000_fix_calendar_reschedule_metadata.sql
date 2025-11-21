BEGIN;

CREATE OR REPLACE FUNCTION public.fn_calendar_reschedule_booking(
    p_booking_id uuid,
    p_new_slot_start timestamp with time zone,
    p_notes text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
    booking_id uuid,
    resource_id uuid,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    timezone text,
    status text,
    hold_id uuid,
    tarjeta_id uuid,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    UPDATE public.calendar_slot_holds csh
    SET status = 'confirmed',
        metadata = csh.metadata
            || jsonb_build_object('confirmed_via', 'reschedule', 'confirmed_at', now()),
        updated_at = now()
    WHERE csh.id = v_new_hold.hold_id;

    v_old_hold := v_booking.hold_id;

    UPDATE public.calendar_bookings cb
    SET start_at = v_new_hold.slot_start,
        end_at = v_new_hold.slot_end,
        hold_id = v_new_hold.hold_id,
        tarjeta_id = v_booking.tarjeta_id,
        metadata = cb.metadata
            || COALESCE(p_metadata, '{}'::jsonb)
            || jsonb_build_object(
                'rescheduled_from', v_booking.start_at,
                'rescheduled_at', now()
            ),
        notes = COALESCE(NULLIF(p_notes, ''), cb.notes),
        updated_at = now()
    WHERE cb.id = v_booking.id;

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
$function$;

COMMENT ON FUNCTION public.fn_calendar_reschedule_booking(
    p_booking_id uuid,
    p_new_slot_start timestamp with time zone,
    p_notes text,
    p_metadata jsonb
) IS 'Genera un nuevo hold, actualiza la cita con el horario elegido y libera el hold anterior.';

COMMIT;
