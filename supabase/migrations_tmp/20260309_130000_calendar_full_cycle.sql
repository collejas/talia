BEGIN;

-- Libera holds manual o automáticamente
CREATE OR REPLACE FUNCTION public.fn_calendar_release_hold(
    p_hold_id uuid,
    p_reason text DEFAULT NULL
) RETURNS TABLE (
    hold_id uuid,
    resource_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_hold public.calendar_slot_holds%ROWTYPE;
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

    IF v_hold.status = 'active' THEN
        UPDATE public.calendar_slot_holds
        SET status = 'released',
            metadata = metadata || jsonb_build_object(
                'released_reason', COALESCE(NULLIF(p_reason, ''), 'manual'),
                'released_at', now()
            ),
            updated_at = now()
        WHERE id = p_hold_id;
        v_hold.status := 'released';
    END IF;

    RETURN QUERY
    SELECT v_hold.id, v_hold.resource_id, v_hold.start_at, v_hold.end_at, v_hold.status;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_release_hold(uuid, text)
    IS 'Marca un hold como liberado y adjunta el motivo en metadata.';

-- Cancela una reserva confirmada y libera el hold asociado
CREATE OR REPLACE FUNCTION public.fn_calendar_cancel_booking(
    p_booking_id uuid,
    p_reason text DEFAULT NULL
) RETURNS TABLE (
    booking_id uuid,
    resource_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_booking public.calendar_bookings%ROWTYPE;
BEGIN
    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id_required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_booking
    FROM public.calendar_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN QUERY SELECT v_booking.id, v_booking.resource_id, v_booking.start_at, v_booking.end_at, v_booking.status;
        RETURN;
    END IF;

    UPDATE public.calendar_bookings
    SET status = 'cancelled',
        notes = COALESCE(NULLIF(p_reason, ''), notes),
        metadata = metadata || jsonb_build_object(
            'cancel_reason', NULLIF(p_reason, ''),
            'cancelled_at', now()
        ),
        updated_at = now()
    WHERE id = p_booking_id;

    IF v_booking.hold_id IS NOT NULL THEN
        PERFORM * FROM public.fn_calendar_release_hold(v_booking.hold_id, 'booking_cancelled');
    END IF;

    v_booking.status := 'cancelled';

    RETURN QUERY
    SELECT v_booking.id, v_booking.resource_id, v_booking.start_at, v_booking.end_at, v_booking.status;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_cancel_booking(uuid, text)
    IS 'Cancela una cita confirmada, adjunta el motivo y libera el hold original.';

-- Reschedule de una reserva confirmada
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
        jsonb_build_object('reschedule_from', v_booking.start_at)
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

COMMENT ON FUNCTION public.fn_calendar_reschedule_booking(uuid, timestamptz, text, jsonb)
    IS 'Genera un nuevo hold, actualiza la cita con el horario elegido y libera el hold anterior.';

-- Expira holds vencidos en lotes
CREATE OR REPLACE FUNCTION public.fn_calendar_expire_holds(
    p_now timestamptz DEFAULT now(),
    p_batch integer DEFAULT 200
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_total integer;
BEGIN
    WITH candidates AS (
        SELECT id
        FROM public.calendar_slot_holds
        WHERE status = 'active'
          AND expires_at <= p_now
        ORDER BY expires_at
        LIMIT p_batch
    )
    UPDATE public.calendar_slot_holds sh
    SET status = 'expired',
        metadata = sh.metadata || jsonb_build_object('expired_at', p_now),
        updated_at = p_now
    WHERE sh.id IN (SELECT id FROM candidates);

    GET DIAGNOSTICS v_total = ROW_COUNT;
    RETURN COALESCE(v_total, 0);
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_expire_holds(timestamptz, integer)
    IS 'Marca como expirados los holds activos cuyo tiempo haya vencido.';

-- CRUD de recursos del calendario
CREATE OR REPLACE FUNCTION public.fn_calendar_resource_upsert(
    p_name text,
    p_timezone text DEFAULT 'America/Mexico_City',
    p_slot_minutes integer DEFAULT 45,
    p_buffer_minutes integer DEFAULT 15,
    p_capacity_per_slot integer DEFAULT 1,
    p_max_holds integer DEFAULT 1,
    p_max_days_visible integer DEFAULT 45,
    p_is_active boolean DEFAULT true,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_id uuid DEFAULT NULL
) RETURNS public.calendar_resources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result public.calendar_resources%ROWTYPE;
BEGIN
    IF p_id IS NULL THEN
        INSERT INTO public.calendar_resources (
            name, timezone, slot_minutes, buffer_minutes,
            capacity_per_slot, max_holds_per_slot, max_days_visible,
            is_active, metadata
        ) VALUES (
            p_name,
            COALESCE(NULLIF(p_timezone, ''), 'America/Mexico_City'),
            GREATEST(15, p_slot_minutes),
            GREATEST(0, p_buffer_minutes),
            GREATEST(1, p_capacity_per_slot),
            GREATEST(1, p_max_holds),
            GREATEST(1, LEAST(p_max_days_visible, 120)),
            COALESCE(p_is_active, true),
            COALESCE(p_metadata, '{}'::jsonb)
        ) RETURNING * INTO v_result;
    ELSE
        UPDATE public.calendar_resources
        SET name = COALESCE(NULLIF(p_name, ''), name),
            timezone = COALESCE(NULLIF(p_timezone, ''), timezone),
            slot_minutes = GREATEST(15, COALESCE(p_slot_minutes, slot_minutes)),
            buffer_minutes = GREATEST(0, COALESCE(p_buffer_minutes, buffer_minutes)),
            capacity_per_slot = GREATEST(1, COALESCE(p_capacity_per_slot, capacity_per_slot)),
            max_holds_per_slot = GREATEST(1, COALESCE(p_max_holds, max_holds_per_slot)),
            max_days_visible = GREATEST(1, LEAST(COALESCE(p_max_days_visible, max_days_visible), 120)),
            is_active = COALESCE(p_is_active, is_active),
            metadata = COALESCE(p_metadata, metadata),
            updated_at = now()
        WHERE id = p_id
        RETURNING * INTO v_result;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'calendar_resource_not_found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_resource_upsert(
    text, text, integer, integer, integer, integer, integer, boolean, jsonb, uuid
)
    IS 'Crea o actualiza recursos del calendario de forma segura.';

-- CRUD de patrones recurrentes
CREATE OR REPLACE FUNCTION public.fn_calendar_pattern_upsert(
    p_resource_id uuid,
    p_weekday smallint,
    p_start_time time,
    p_end_time time,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL,
    p_capacity integer DEFAULT 1,
    p_priority smallint DEFAULT 0,
    p_is_active boolean DEFAULT true,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_id uuid DEFAULT NULL
) RETURNS public.calendar_availability_patterns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result public.calendar_availability_patterns%ROWTYPE;
BEGIN
    IF p_weekday NOT BETWEEN 0 AND 6 THEN
        RAISE EXCEPTION 'weekday_invalid' USING ERRCODE = '22023';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.calendar_availability_patterns (
            resource_id, weekday, start_time, end_time,
            start_date, end_date, capacity, priority,
            is_active, metadata
        ) VALUES (
            p_resource_id,
            p_weekday,
            p_start_time,
            p_end_time,
            p_start_date,
            p_end_date,
            GREATEST(1, p_capacity),
            COALESCE(p_priority, 0),
            COALESCE(p_is_active, true),
            COALESCE(p_metadata, '{}'::jsonb)
        ) RETURNING * INTO v_result;
    ELSE
        UPDATE public.calendar_availability_patterns
        SET resource_id = COALESCE(p_resource_id, resource_id),
            weekday = COALESCE(p_weekday, weekday),
            start_time = COALESCE(p_start_time, start_time),
            end_time = COALESCE(p_end_time, end_time),
            start_date = COALESCE(p_start_date, start_date),
            end_date = COALESCE(p_end_date, end_date),
            capacity = GREATEST(1, COALESCE(p_capacity, capacity)),
            priority = COALESCE(p_priority, priority),
            is_active = COALESCE(p_is_active, is_active),
            metadata = COALESCE(p_metadata, metadata),
            updated_at = now()
        WHERE id = p_id
        RETURNING * INTO v_result;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'pattern_not_found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_pattern_upsert(
    uuid, smallint, time, time, date, date, integer, smallint, boolean, jsonb, uuid
)
    IS 'Crea o actualiza las reglas recurrentes de disponibilidad.';

CREATE OR REPLACE FUNCTION public.fn_calendar_pattern_delete(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_found boolean;
BEGIN
    DELETE FROM public.calendar_availability_patterns
    WHERE id = p_id;
    GET DIAGNOSTICS v_found = ROW_COUNT;
    RETURN COALESCE(v_found, false);
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_pattern_delete(uuid)
    IS 'Elimina un patrón recurrente del calendario.';

-- CRUD de excepciones puntuales
CREATE OR REPLACE FUNCTION public.fn_calendar_exception_upsert(
    p_resource_id uuid,
    p_kind text,
    p_start_at timestamptz,
    p_end_at timestamptz,
    p_capacity integer DEFAULT NULL,
    p_reason text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_id uuid DEFAULT NULL
) RETURNS public.calendar_exceptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result public.calendar_exceptions%ROWTYPE;
BEGIN
    IF p_kind NOT IN ('block', 'extra') THEN
        RAISE EXCEPTION 'exception_kind_invalid' USING ERRCODE = '22023';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.calendar_exceptions (
            resource_id, kind, start_at, end_at,
            capacity, reason, metadata
        ) VALUES (
            p_resource_id,
            p_kind,
            p_start_at,
            p_end_at,
            CASE WHEN p_kind = 'extra' THEN GREATEST(1, COALESCE(p_capacity, 1)) ELSE NULL END,
            NULLIF(p_reason, ''),
            COALESCE(p_metadata, '{}'::jsonb)
        ) RETURNING * INTO v_result;
    ELSE
        UPDATE public.calendar_exceptions
        SET resource_id = COALESCE(p_resource_id, resource_id),
            kind = COALESCE(p_kind, kind),
            start_at = COALESCE(p_start_at, start_at),
            end_at = COALESCE(p_end_at, end_at),
            capacity = CASE
                WHEN COALESCE(p_kind, kind) = 'extra'
                    THEN GREATEST(1, COALESCE(p_capacity, capacity, 1))
                ELSE NULL
            END,
            reason = COALESCE(NULLIF(p_reason, ''), reason),
            metadata = COALESCE(p_metadata, metadata),
            updated_at = now()
        WHERE id = p_id
        RETURNING * INTO v_result;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'exception_not_found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_exception_upsert(
    uuid, text, timestamptz, timestamptz, integer, text, jsonb, uuid
)
    IS 'Gestiona bloqueos o ventanas extra del calendario.';

CREATE OR REPLACE FUNCTION public.fn_calendar_exception_delete(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_found boolean;
BEGIN
    DELETE FROM public.calendar_exceptions
    WHERE id = p_id;
    GET DIAGNOSTICS v_found = ROW_COUNT;
    RETURN COALESCE(v_found, false);
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_exception_delete(uuid)
    IS 'Elimina una excepción puntual del calendario.';

-- Consulta de reservas para el panel/operaciones
CREATE OR REPLACE FUNCTION public.fn_calendar_list_bookings(
    p_resource_id uuid,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_limit integer DEFAULT 200,
    p_offset integer DEFAULT 0
) RETURNS TABLE (
    booking_id uuid,
    resource_id uuid,
    contact_id uuid,
    conversacion_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    status text,
    notes text,
    metadata jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT
        cb.id,
        cb.resource_id,
        cb.contact_id,
        cb.conversacion_id,
        cb.start_at,
        cb.end_at,
        cb.status,
        cb.notes,
        cb.metadata
    FROM public.calendar_bookings cb
    WHERE cb.resource_id = p_resource_id
      AND (p_status IS NULL OR cb.status = p_status)
      AND (p_from IS NULL OR cb.start_at >= p_from)
      AND (p_to IS NULL OR cb.end_at <= p_to)
    ORDER BY cb.start_at
    LIMIT COALESCE(NULLIF(p_limit, 0), 200)
    OFFSET GREATEST(p_offset, 0);
$$;

COMMENT ON FUNCTION public.fn_calendar_list_bookings(uuid, timestamptz, timestamptz, text, integer, integer)
    IS 'Devuelve las reservas del calendario con filtros básicos para el panel.';

-- Métricas resumidas del recurso de calendario
CREATE OR REPLACE FUNCTION public.fn_calendar_booking_stats(
    p_resource_id uuid,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE (
    confirmed integer,
    cancelled integer,
    upcoming integer,
    past integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    WITH base AS (
        SELECT * FROM public.calendar_bookings cb
        WHERE cb.resource_id = p_resource_id
          AND (p_from IS NULL OR cb.start_at >= p_from)
          AND (p_to IS NULL OR cb.end_at <= p_to)
    )
    SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (
            WHERE status = 'confirmed'
              AND cb.start_at >= now()
        ) AS upcoming,
        COUNT(*) FILTER (
            WHERE status = 'confirmed'
              AND cb.end_at < now()
        ) AS past
    FROM base cb;
$$;

COMMENT ON FUNCTION public.fn_calendar_booking_stats(uuid, timestamptz, timestamptz)
    IS 'Entrega totales básicos (confirmadas, canceladas, próximas y pasadas) para un recurso.';

COMMIT;
