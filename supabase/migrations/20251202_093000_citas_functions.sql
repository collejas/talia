BEGIN;

-- ============================================================================
-- Función: fn_cita_upsert
-- Inserta o actualiza una cita respetando permisos y devolviendo el registro.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_cita_upsert(
    uuid,
    uuid,
    uuid,
    uuid,
    timestamptz,
    timestamptz,
    text,
    public.cita_estado,
    text,
    text,
    text,
    text,
    text,
    text,
    jsonb,
    text,
    uuid,
    uuid,
    boolean,
    timestamptz,
    boolean
) CASCADE;

CREATE FUNCTION public.fn_cita_upsert(
    p_id uuid DEFAULT NULL,
    p_tarjeta_id uuid DEFAULT NULL,
    p_contacto_id uuid DEFAULT NULL,
    p_conversacion_id uuid DEFAULT NULL,
    p_start_at timestamptz DEFAULT NULL,
    p_end_at timestamptz DEFAULT NULL,
    p_timezone text DEFAULT NULL,
    p_estado public.cita_estado DEFAULT NULL,
    p_provider text DEFAULT NULL,
    p_provider_calendar_id text DEFAULT NULL,
    p_provider_event_id text DEFAULT NULL,
    p_meeting_url text DEFAULT NULL,
    p_location text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL,
    p_cancel_reason text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_updated_by uuid DEFAULT NULL,
    p_merge_metadata boolean DEFAULT TRUE,
    p_expected_updated_at timestamptz DEFAULT NULL,
    p_remove_provider_event boolean DEFAULT FALSE
)
RETURNS public.citas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_row public.citas;
    v_existing public.citas;
    v_target_tarjeta uuid;
    v_start timestamptz;
    v_end timestamptz;
    v_timezone text;
    v_provider text;
    v_metadata jsonb;
    v_merge boolean := COALESCE(p_merge_metadata, TRUE);
    v_duration interval := interval '45 minutes';
    v_provider_event_id text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
    END IF;

    IF p_id IS NULL THEN
        IF p_tarjeta_id IS NULL THEN
            RAISE EXCEPTION 'tarjeta_required' USING ERRCODE = '23514';
        END IF;
        IF p_contacto_id IS NULL THEN
            RAISE EXCEPTION 'contacto_required' USING ERRCODE = '23514';
        END IF;
        IF p_start_at IS NULL THEN
            RAISE EXCEPTION 'start_at_required' USING ERRCODE = '23514';
        END IF;
        IF NOT public.puede_ver_lead(p_tarjeta_id) THEN
            RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
        END IF;

        v_start := p_start_at;
        v_end := COALESCE(p_end_at, v_start + v_duration);
        IF v_end < v_start THEN
            RAISE EXCEPTION 'end_before_start' USING ERRCODE = '23514';
        END IF;

        v_timezone := NULLIF(btrim(COALESCE(p_timezone, '')), '');

        v_provider := lower(COALESCE(p_provider, 'hosting'));
        IF v_provider NOT IN ('hosting', 'google') THEN
            RAISE EXCEPTION 'provider_invalid' USING ERRCODE = '23514';
        END IF;

        v_metadata := jsonb_strip_nulls(COALESCE(p_metadata, '{}'::jsonb));

        INSERT INTO public.citas (
            tarjeta_id,
            contacto_id,
            conversacion_id,
            start_at,
            end_at,
            timezone,
            estado,
            provider,
            provider_calendar_id,
            provider_event_id,
            meeting_url,
            location,
            notes,
            metadata,
            created_by,
            updated_by,
            cancel_reason
        )
        VALUES (
            p_tarjeta_id,
            p_contacto_id,
            p_conversacion_id,
            v_start,
            v_end,
            v_timezone,
            COALESCE(p_estado, 'pendiente'),
            v_provider,
            p_provider_calendar_id,
            NULLIF(btrim(p_provider_event_id), ''),
            NULLIF(btrim(p_meeting_url), ''),
            NULLIF(btrim(p_location), ''),
            NULLIF(p_notes, ''),
            v_metadata,
            COALESCE(p_created_by, v_uid),
            COALESCE(p_updated_by, v_uid),
            NULLIF(p_cancel_reason, '')
        )
        RETURNING * INTO v_row;

        RETURN v_row;
    END IF;

    SELECT *
    INTO v_existing
    FROM public.citas
    WHERE id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'cita_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF p_expected_updated_at IS NOT NULL
       AND v_existing.actualizado_en IS DISTINCT FROM p_expected_updated_at THEN
        RAISE EXCEPTION 'concurrency_conflict' USING ERRCODE = '40001';
    END IF;

    IF NOT public.puede_ver_lead(v_existing.tarjeta_id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    v_target_tarjeta := COALESCE(p_tarjeta_id, v_existing.tarjeta_id);
    IF NOT public.puede_ver_lead(v_target_tarjeta) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    v_start := COALESCE(p_start_at, v_existing.start_at);
    v_end :=
        CASE
            WHEN p_end_at IS NOT NULL THEN p_end_at
            WHEN v_existing.end_at IS NOT NULL THEN v_existing.end_at
            ELSE v_start + v_duration
        END;
    IF v_end < v_start THEN
        RAISE EXCEPTION 'end_before_start' USING ERRCODE = '23514';
    END IF;

    v_timezone := NULLIF(
        btrim(COALESCE(p_timezone, v_existing.timezone, '')),
        ''
    );

    v_provider := lower(COALESCE(p_provider, v_existing.provider));
    IF v_provider NOT IN ('hosting', 'google') THEN
        RAISE EXCEPTION 'provider_invalid' USING ERRCODE = '23514';
    END IF;

    IF p_metadata IS NULL THEN
        v_metadata := v_existing.metadata;
    ELSIF v_merge THEN
        v_metadata := jsonb_strip_nulls(
            COALESCE(v_existing.metadata, '{}'::jsonb) || p_metadata
        );
    ELSE
        v_metadata := jsonb_strip_nulls(p_metadata);
    END IF;

    v_provider_event_id :=
        CASE
            WHEN p_remove_provider_event THEN NULL
            WHEN p_provider_event_id IS NOT NULL THEN NULLIF(btrim(p_provider_event_id), '')
            ELSE v_existing.provider_event_id
        END;

    UPDATE public.citas
    SET
        tarjeta_id = v_target_tarjeta,
        contacto_id = COALESCE(p_contacto_id, v_existing.contacto_id),
        conversacion_id = COALESCE(p_conversacion_id, v_existing.conversacion_id),
        start_at = v_start,
        end_at = v_end,
        timezone = v_timezone,
        estado = COALESCE(p_estado, v_existing.estado),
        provider = v_provider,
        provider_calendar_id = COALESCE(
            NULLIF(btrim(p_provider_calendar_id), ''),
            v_existing.provider_calendar_id
        ),
        provider_event_id = v_provider_event_id,
        meeting_url = COALESCE(NULLIF(btrim(p_meeting_url), ''), v_existing.meeting_url),
        location = COALESCE(NULLIF(btrim(p_location), ''), v_existing.location),
        notes = COALESCE(NULLIF(p_notes, ''), v_existing.notes),
        metadata = v_metadata,
        cancel_reason = COALESCE(NULLIF(p_cancel_reason, ''), v_existing.cancel_reason),
        updated_by = COALESCE(p_updated_by, v_uid)
    WHERE id = p_id
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.fn_cita_upsert(
    uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, public.cita_estado,
    text, text, text, text, text, text, jsonb, text, uuid, uuid, boolean, timestamptz, boolean
) IS
    'Inserta o actualiza citas aplicando permisos, duración predeterminada y merge opcional de metadatos.';

GRANT EXECUTE ON FUNCTION public.fn_cita_upsert(
    uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, public.cita_estado,
    text, text, text, text, text, text, jsonb, text, uuid, uuid, boolean, timestamptz, boolean
) TO postgres, service_role, authenticated;

-- ============================================================================
-- Función: fn_cita_cancel
-- Marca la cita como cancelada y permite limpiar el evento externo.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_cita_cancel(uuid, text, boolean) CASCADE;

CREATE FUNCTION public.fn_cita_cancel(
    p_id uuid,
    p_reason text DEFAULT NULL,
    p_remove_provider_event boolean DEFAULT FALSE
)
RETURNS public.citas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_row public.citas;
    v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
    END IF;

    SELECT *
    INTO v_row
    FROM public.citas
    WHERE id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'cita_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.puede_ver_lead(v_row.tarjeta_id) THEN
        RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    UPDATE public.citas
    SET
        estado = 'cancelada',
        cancel_reason = COALESCE(v_reason, cancel_reason),
        provider_event_id = CASE
            WHEN p_remove_provider_event THEN NULL
            ELSE provider_event_id
        END,
        updated_by = v_uid
    WHERE id = p_id
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.fn_cita_cancel(uuid, text, boolean) IS
    'Cancela una cita existente, opcionalmente liberando el identificador del evento externo.';

GRANT EXECUTE ON FUNCTION public.fn_cita_cancel(uuid, text, boolean)
    TO postgres, service_role, authenticated;

COMMIT;
