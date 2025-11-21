BEGIN;

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

COMMIT;
