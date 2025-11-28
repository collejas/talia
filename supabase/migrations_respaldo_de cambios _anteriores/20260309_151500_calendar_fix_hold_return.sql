BEGIN;

CREATE OR REPLACE FUNCTION public.fn_calendar_hold_slot(
    p_resource_id uuid,
    p_slot_start timestamptz,
    p_conversacion_id uuid,
    p_contact_id uuid DEFAULT NULL,
    p_hold_minutes integer DEFAULT 5,
    p_metadata jsonb DEFAULT '{}'::jsonb
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
        status,
        expires_at,
        metadata
    ) VALUES (
        v_resource.id,
        p_slot_start,
        v_slot_end,
        p_contact_id,
        p_conversacion_id,
        'active',
        v_expires,
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_hold_id;

    RETURN QUERY
    SELECT v_hold_id, v_resource.id, p_slot_start, v_slot_end, v_expires;
END;
$$;

COMMIT;
