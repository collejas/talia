BEGIN;

-- 1. Recursos base del calendario
CREATE TABLE public.calendar_resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE,
    timezone text NOT NULL DEFAULT 'America/Mexico_City',
    slot_minutes integer NOT NULL DEFAULT 45,
    buffer_minutes integer NOT NULL DEFAULT 15,
    capacity_per_slot integer NOT NULL DEFAULT 1 CHECK (capacity_per_slot >= 1),
    max_holds_per_slot integer NOT NULL DEFAULT 1 CHECK (max_holds_per_slot >= 1),
    max_days_visible integer NOT NULL DEFAULT 45 CHECK (max_days_visible BETWEEN 1 AND 120),
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

COMMENT ON TABLE public.calendar_resources IS 'Catálogo de recursos (personas/calendarios) que exponen disponibilidad en el webchat.';

CREATE TRIGGER calendar_resources_touch_updated_at
BEFORE UPDATE ON public.calendar_resources
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 2. Patrones recurrentes de disponibilidad (ej. lunes-viernes 9-18h)
CREATE TABLE public.calendar_availability_patterns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id uuid NOT NULL REFERENCES public.calendar_resources(id) ON DELETE CASCADE,
    weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time time NOT NULL,
    end_time time NOT NULL,
    start_date date,
    end_date date,
    capacity integer NOT NULL DEFAULT 1 CHECK (capacity >= 1),
    priority smallint NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_availability_patterns
    ADD CONSTRAINT calendar_availability_patterns_time_check
    CHECK (end_time > start_time);

CREATE INDEX calendar_availability_patterns_resource_weekday_idx
    ON public.calendar_availability_patterns(resource_id, weekday)
    WHERE is_active;

CREATE TRIGGER calendar_availability_patterns_touch_updated_at
BEFORE UPDATE ON public.calendar_availability_patterns
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON TABLE public.calendar_availability_patterns IS 'Definiciones semanales para generar slots disponibles automáticamente.';

-- 3. Excepciones puntuales (bloqueos o ventanas extra)
CREATE TABLE public.calendar_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id uuid NOT NULL REFERENCES public.calendar_resources(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind = ANY (ARRAY['block','extra'])),
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    capacity integer,
    reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

ALTER TABLE public.calendar_exceptions
    ADD CONSTRAINT calendar_exceptions_time_check
    CHECK (end_at > start_at);

CREATE INDEX calendar_exceptions_resource_kind_idx
    ON public.calendar_exceptions(resource_id, kind, start_at, end_at);

CREATE TRIGGER calendar_exceptions_touch_updated_at
BEFORE UPDATE ON public.calendar_exceptions
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON TABLE public.calendar_exceptions IS 'Bloqueos (kind=block) o ventanas adicionales (kind=extra) aplicadas a un recurso.';

-- 4. Holds temporales para evitar sobreventa de slots
CREATE TABLE public.calendar_slot_holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id uuid NOT NULL REFERENCES public.calendar_resources(id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    contact_id uuid,
    conversacion_id uuid,
    status text NOT NULL DEFAULT 'active'
        CHECK (status = ANY (ARRAY['active','confirmed','released','expired'])),
    expires_at timestamptz NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

ALTER TABLE public.calendar_slot_holds
    ADD CONSTRAINT calendar_slot_holds_time_check
    CHECK (end_at > start_at);

CREATE INDEX calendar_slot_holds_resource_start_idx
    ON public.calendar_slot_holds(resource_id, start_at);

CREATE INDEX calendar_slot_holds_active_idx
    ON public.calendar_slot_holds(resource_id, start_at, expires_at)
    WHERE status = 'active';

CREATE TRIGGER calendar_slot_holds_touch_updated_at
BEFORE UPDATE ON public.calendar_slot_holds
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON TABLE public.calendar_slot_holds IS 'Reservas temporales mientras el visitante confirma la cita.';

-- 5. Reservas confirmadas del calendario
CREATE TABLE public.calendar_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id uuid NOT NULL REFERENCES public.calendar_resources(id) ON DELETE CASCADE,
    hold_id uuid REFERENCES public.calendar_slot_holds(id) ON DELETE SET NULL,
    contact_id uuid,
    conversacion_id uuid,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    timezone text NOT NULL,
    status text NOT NULL DEFAULT 'confirmed'
        CHECK (status = ANY (ARRAY['confirmed','cancelled'])),
    notes text,
    meeting_url text,
    external_join_url text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

ALTER TABLE public.calendar_bookings
    ADD CONSTRAINT calendar_bookings_time_check
    CHECK (end_at > start_at);

CREATE UNIQUE INDEX calendar_bookings_unique_slot
    ON public.calendar_bookings(resource_id, start_at)
    WHERE status = 'confirmed';

CREATE INDEX calendar_bookings_conversation_idx
    ON public.calendar_bookings(conversacion_id);

CREATE TRIGGER calendar_bookings_touch_updated_at
BEFORE UPDATE ON public.calendar_bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON TABLE public.calendar_bookings IS 'Citas confirmadas que Tal-IA agenda desde el webchat.';

-- 6. Función para listar slots disponibles
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
        SELECT COUNT(*)
        FROM calendar_bookings cb
        WHERE cb.resource_id = sc.resource_id
          AND cb.status = 'confirmed'
          AND cb.start_at < sc.slot_end
          AND cb.end_at > sc.slot_start
    ) AS booked ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*)
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

COMMENT ON FUNCTION public.fn_calendar_list_slots(uuid, date, date, text, integer)
    IS 'Genera la disponibilidad por slot considerando patrones, excepciones, holds y reservas confirmadas.';

-- 7. Función para crear un hold
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

    -- Verifica que el slot esté dentro de la ventana permitida
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

    -- Capacidad configurada por patrón/excepción
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
    ) RETURNING id,
                  v_resource.id,
                  p_slot_start,
                  v_slot_end,
                  v_expires
      INTO hold_id,
           resource_id,
           slot_start,
           slot_end,
           expires_at;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_hold_slot(uuid, timestamptz, uuid, uuid, integer, jsonb)
    IS 'Bloquea temporalmente un slot disponible mientras el visitante confirma la cita.';

-- 8. Función para confirmar un slot
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
        start_at,
        end_at,
        timezone,
        status,
        notes,
        meeting_url,
        external_join_url,
        metadata
    ) VALUES (
        v_resource.id,
        v_hold.id,
        v_hold.contact_id,
        v_hold.conversacion_id,
        v_hold.start_at,
        v_hold.end_at,
        v_resource.timezone,
        'confirmed',
        NULLIF(p_notes, ''),
        NULLIF(p_meeting_url, ''),
        NULLIF(p_external_join_url, ''),
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id, resource_id, start_at, end_at, timezone, status
    INTO booking_id, resource_id, start_at, end_at, timezone, status;

    UPDATE public.calendar_slot_holds
    SET status = 'confirmed', updated_at = now()
    WHERE id = p_hold_id;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_confirm_slot(uuid, text, jsonb, text, text)
    IS 'Convierte un hold activo en una cita confirmada dentro del calendario.';

COMMIT;
