BEGIN;

ALTER TABLE public.calendar_slot_holds
    ADD COLUMN IF NOT EXISTS tarjeta_id uuid REFERENCES public.lead_tarjetas(id) ON DELETE SET NULL;

ALTER TABLE public.calendar_bookings
    ADD COLUMN IF NOT EXISTS tarjeta_id uuid REFERENCES public.lead_tarjetas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calendar_slot_holds_tarjeta_idx
    ON public.calendar_slot_holds(tarjeta_id);

CREATE INDEX IF NOT EXISTS calendar_bookings_tarjeta_idx
    ON public.calendar_bookings(tarjeta_id);

CREATE OR REPLACE FUNCTION public.fn_calendar_hold_slot(
    p_resource_id uuid,
    p_slot_start timestamptz,
    p_conversacion_id uuid,
    p_contact_id uuid DEFAULT NULL,
    p_hold_minutes integer DEFAULT 5,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_tarjeta_id uuid DEFAULT NULL
) RETURNS TABLE (
    hold_id uuid,
    resource_id uuid,
    slot_start timestamptz,
    slot_end timestamptz,
    expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_resource public.calendar_resources%ROWTYPE;
    v_slot_end timestamptz;
    v_slot_duration interval;
    v_expires timestamptz;
    v_capacity integer;
    v_hold_limit integer;
    v_active_holds integer;
    v_booked integer;
    v_local_date date;
    v_local_time time;
    v_slot_end_local time;
    v_blocked boolean;
    v_available_capacity integer;
    v_today date;
    v_hold_id uuid;
BEGIN
    IF p_resource_id IS NULL OR p_slot_start IS NULL THEN
        RAISE EXCEPTION 'resource_and_slot_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_resource
    FROM public.calendar_resources
    WHERE id = p_resource_id AND is_active;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'calendar_resource_not_found' USING ERRCODE = 'P0002';
    END IF;

    v_today := (now() AT TIME ZONE v_resource.timezone)::date;
    v_slot_duration := make_interval(mins => v_resource.slot_minutes);
    v_slot_end := p_slot_start + v_slot_duration;
    v_expires := now() + make_interval(mins => GREATEST(1, LEAST(p_hold_minutes, 15)));
    v_hold_limit := GREATEST(1, v_resource.max_holds_per_slot);
    v_local_date := (p_slot_start AT TIME ZONE v_resource.timezone)::date;
    v_local_time := (p_slot_start AT TIME ZONE v_resource.timezone)::time;
    v_slot_end_local := (v_slot_end AT TIME ZONE v_resource.timezone)::time;

    IF v_local_date < v_today - 1 THEN
        RAISE EXCEPTION 'slot_out_of_range' USING ERRCODE = '22023';
    END IF;
    IF v_local_date > v_today + v_resource.max_days_visible THEN
        RAISE EXCEPTION 'slot_out_of_range' USING ERRCODE = '22023';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM calendar_exceptions ce
        WHERE ce.resource_id = v_resource.id
          AND ce.kind = 'block'
          AND tstzrange(ce.start_at, ce.end_at, '[)') && tstzrange(p_slot_start, v_slot_end, '[)')
    ) INTO v_blocked;

    IF v_blocked THEN
        RAISE EXCEPTION 'slot_blocked' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(ap.capacity, v_resource.capacity_per_slot)
    INTO v_capacity
    FROM calendar_availability_patterns ap
    WHERE ap.resource_id = v_resource.id
      AND ap.is_active
      AND ap.weekday = EXTRACT(DOW FROM v_local_date)
      AND (ap.start_date IS NULL OR ap.start_date <= v_local_date)
      AND (ap.end_date IS NULL OR ap.end_date >= v_local_date)
      AND v_local_time >= ap.start_time
      AND v_slot_end_local <= ap.end_time
    ORDER BY ap.priority DESC, ap.start_time
    LIMIT 1;

    IF v_capacity IS NULL THEN
        SELECT COALESCE(ce.capacity, v_resource.capacity_per_slot)
        INTO v_capacity
        FROM calendar_exceptions ce
        WHERE ce.resource_id = v_resource.id
          AND ce.kind = 'extra'
          AND p_slot_start >= ce.start_at
          AND v_slot_end <= ce.end_at
        ORDER BY ce.start_at
        LIMIT 1;
    END IF;

    v_capacity := COALESCE(v_capacity, v_resource.capacity_per_slot);

    SELECT COUNT(*)
    INTO v_booked
    FROM calendar_bookings cb
    WHERE cb.resource_id = v_resource.id
      AND cb.status = 'confirmed'
      AND cb.start_at < v_slot_end
      AND cb.end_at > p_slot_start;

    IF v_booked >= v_capacity THEN
        RAISE EXCEPTION 'slot_already_booked' USING ERRCODE = 'P0001';
    END IF;

    v_available_capacity := GREATEST(v_capacity - v_booked, 0);

    SELECT COUNT(*)
    INTO v_active_holds
    FROM calendar_slot_holds sh
    WHERE sh.resource_id = v_resource.id
      AND sh.status = 'active'
      AND sh.expires_at > now()
      AND sh.start_at < v_slot_end
      AND sh.end_at > p_slot_start;

    IF v_active_holds >= LEAST(v_hold_limit, v_available_capacity) THEN
        RAISE EXCEPTION 'slot_hold_limit_reached' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.calendar_slot_holds (
        resource_id,
        start_at,
        end_at,
        contact_id,
        conversacion_id,
        tarjeta_id,
        status,
        expires_at,
        metadata
    ) VALUES (
        v_resource.id,
        p_slot_start,
        v_slot_end,
        p_contact_id,
        p_conversacion_id,
        p_tarjeta_id,
        'active',
        v_expires,
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_hold_id;

    RETURN QUERY
    SELECT v_hold_id, v_resource.id, p_slot_start, v_slot_end, v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_calendar_confirm_slot(
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
    status text
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
    FROM calendar_bookings cb
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
        v_booking_id,
        v_resource.id,
        v_hold.start_at,
        v_hold.end_at,
        v_resource.timezone,
        'confirmed'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_calendar_reschedule_booking(
    p_booking_id uuid,
    p_new_slot_start timestamptz,
    p_notes text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
    booking_id uuid,
    resource_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    status text,
    hold_id uuid
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
    SELECT v_booking.id,
           v_booking.resource_id,
           v_new_hold.slot_start,
           v_new_hold.slot_end,
           'confirmed'::text,
           v_new_hold.hold_id;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_hold_slot(uuid, timestamptz, uuid, uuid, integer, jsonb, uuid)
    IS 'Bloquea temporalmente un slot disponible mientras el visitante confirma la cita.';

COMMENT ON FUNCTION public.fn_calendar_confirm_slot(uuid, text, jsonb, text, text)
    IS 'Convierte un hold activo en una cita confirmada dentro del calendario.';

COMMENT ON FUNCTION public.fn_calendar_reschedule_booking(uuid, timestamptz, text, jsonb)
    IS 'Genera un nuevo hold, actualiza la cita con el horario elegido y libera el hold anterior.';

COMMIT;
