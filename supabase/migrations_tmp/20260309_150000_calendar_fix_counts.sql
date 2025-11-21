BEGIN;

CREATE OR REPLACE FUNCTION public.fn_calendar_list_slots(
    p_resource_id uuid,
    p_from date,
    p_to date,
    p_timezone text DEFAULT NULL,
    p_max_days integer DEFAULT 31
) RETURNS TABLE (
    resource_id uuid,
    slot_start timestamptz,
    slot_end timestamptz,
    timezone text,
    local_date date,
    local_time text,
    capacity integer,
    booked integer,
    holds integer,
    is_available boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_resource public.calendar_resources%ROWTYPE;
    v_from date;
    v_to date;
    v_timezone text;
    v_slot_duration interval;
    v_slot_step interval;
BEGIN
    IF p_resource_id IS NULL THEN
        RAISE EXCEPTION 'resource_id_required' USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_resource
    FROM public.calendar_resources
    WHERE id = p_resource_id AND is_active;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'calendar_resource_not_found' USING ERRCODE = 'P0002';
    END IF;

    v_from := COALESCE(p_from, CURRENT_DATE);
    v_to := COALESCE(p_to, v_from + v_resource.max_days_visible);

    IF v_to < v_from THEN
        RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
    END IF;

    IF (v_to - v_from) > LEAST(p_max_days, v_resource.max_days_visible) THEN
        v_to := v_from + LEAST(p_max_days, v_resource.max_days_visible);
    END IF;

    v_timezone := COALESCE(NULLIF(p_timezone, ''), v_resource.timezone);
    v_slot_duration := make_interval(mins => v_resource.slot_minutes);
    v_slot_step := make_interval(mins => v_resource.slot_minutes + v_resource.buffer_minutes);

    RETURN QUERY
    WITH params AS (
        SELECT v_timezone AS timezone,
               v_slot_duration AS slot_duration,
               v_slot_step AS slot_step,
               v_resource.capacity_per_slot AS default_capacity
    ),
    day_series AS (
        SELECT gs::date AS day
        FROM generate_series(v_from, v_to, '1 day') gs
    ),
    pattern_windows AS (
        SELECT
            ap.id AS pattern_id,
            ap.capacity,
            ((ds.day + ap.start_time)::timestamp AT TIME ZONE v_resource.timezone) AS window_start,
            ((ds.day + ap.end_time)::timestamp AT TIME ZONE v_resource.timezone) AS window_end
        FROM calendar_availability_patterns ap
        JOIN day_series ds ON ds.day BETWEEN COALESCE(ap.start_date, ds.day)
                              AND COALESCE(ap.end_date, ds.day)
        WHERE ap.resource_id = v_resource.id
          AND ap.is_active
          AND ap.weekday = EXTRACT(DOW FROM ds.day)
    ),
    extra_windows AS (
        SELECT
            ce.id AS pattern_id,
            COALESCE(ce.capacity, v_resource.capacity_per_slot) AS capacity,
            ce.start_at AS window_start,
            ce.end_at AS window_end
        FROM calendar_exceptions ce
        WHERE ce.resource_id = v_resource.id
          AND ce.kind = 'extra'
          AND ce.end_at >= (v_from::timestamp)
          AND ce.start_at <= (v_to::timestamp + INTERVAL '1 day')
    ),
    blocked_ranges AS (
        SELECT tstzrange(ce.start_at, ce.end_at, '[)') AS range
        FROM calendar_exceptions ce
        WHERE ce.resource_id = v_resource.id
          AND ce.kind = 'block'
          AND ce.end_at >= (v_from::timestamp)
          AND ce.start_at <= (v_to::timestamp + INTERVAL '1 day')
    ),
    windows AS (
        SELECT * FROM pattern_windows
        UNION ALL
        SELECT * FROM extra_windows
    ),
    slot_candidates AS (
        SELECT
            v_resource.id AS resource_id,
            w.pattern_id,
            w.capacity,
            gs AS slot_start,
            gs + params.slot_duration AS slot_end,
            params.default_capacity
        FROM windows w
        CROSS JOIN params
        CROSS JOIN LATERAL generate_series(
            w.window_start,
            w.window_end - params.slot_duration,
            params.slot_step
        ) AS gs
        WHERE w.window_end > w.window_start
    )
    SELECT
        sc.resource_id,
        sc.slot_start,
        sc.slot_end,
        params.timezone AS timezone,
        (sc.slot_start AT TIME ZONE params.timezone)::date AS local_date,
        to_char(sc.slot_start AT TIME ZONE params.timezone, 'HH24:MI') AS local_time,
        COALESCE(sc.capacity, params.default_capacity) AS capacity,
        COALESCE(booked.count, 0) AS booked,
        COALESCE(holds.count, 0) AS holds,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM blocked_ranges br
                WHERE br.range && tstzrange(sc.slot_start, sc.slot_end, '[)')
            ) THEN FALSE
            WHEN COALESCE(booked.count, 0) >= COALESCE(sc.capacity, params.default_capacity) THEN FALSE
            WHEN COALESCE(holds.count, 0) >= LEAST(v_resource.max_holds_per_slot, COALESCE(sc.capacity, params.default_capacity)) THEN FALSE
            ELSE TRUE
        END AS is_available
    FROM slot_candidates sc
    CROSS JOIN params
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer
        FROM calendar_bookings cb
        WHERE cb.resource_id = sc.resource_id
          AND cb.status = 'confirmed'
          AND cb.start_at < sc.slot_end
          AND cb.end_at > sc.slot_start
    ) AS booked ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer
        FROM calendar_slot_holds sh
        WHERE sh.resource_id = sc.resource_id
          AND sh.status = 'active'
          AND sh.expires_at > now()
          AND sh.start_at < sc.slot_end
          AND sh.end_at > sc.slot_start
    ) AS holds ON TRUE
    WHERE sc.slot_end > now() - INTERVAL '5 minutes'
    ORDER BY sc.slot_start;
END;
$$;

COMMIT;
