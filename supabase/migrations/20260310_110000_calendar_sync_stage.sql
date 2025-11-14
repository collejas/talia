BEGIN;

CREATE OR REPLACE FUNCTION public.fn_calendar_sync_tarjeta_stage(
    p_tarjeta_id uuid,
    p_status text,
    p_booking_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_tarjeta public.lead_tarjetas%ROWTYPE;
    v_target_stage uuid;
    v_target_code text;
    v_actor uuid;
BEGIN
    IF p_tarjeta_id IS NULL OR p_status IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_tarjeta
    FROM public.lead_tarjetas
    WHERE id = p_tarjeta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_status = 'confirmed' THEN
        v_target_code := 'demo';
    ELSIF p_status = 'cancelled' THEN
        v_target_code := 'precalificado';
    ELSE
        RETURN;
    END IF;

    SELECT id INTO v_target_stage
    FROM public.lead_etapas
    WHERE tablero_id = v_tarjeta.tablero_id
      AND codigo = v_target_code
    ORDER BY orden
    LIMIT 1;

    IF v_target_stage IS NULL AND p_status = 'cancelled' THEN
        SELECT id INTO v_target_stage
        FROM public.lead_etapas
        WHERE tablero_id = v_tarjeta.tablero_id
        ORDER BY orden
        LIMIT 1;
    END IF;

    IF v_target_stage IS NULL OR v_target_stage = v_tarjeta.etapa_id THEN
        RETURN;
    END IF;

    v_actor := coalesce(auth.uid(), v_tarjeta.asignado_a_usuario_id, v_tarjeta.propietario_usuario_id);

    UPDATE public.lead_tarjetas
    SET etapa_id = v_target_stage,
        actualizado_en = now()
    WHERE id = v_tarjeta.id;

    INSERT INTO public.lead_movimientos (
        tarjeta_id,
        etapa_origen_id,
        etapa_destino_id,
        cambiado_por,
        fuente,
        metadata
    ) VALUES (
        v_tarjeta.id,
        v_tarjeta.etapa_id,
        v_target_stage,
        v_actor,
        'asistente',
        jsonb_build_object(
            'source', 'calendar_booking',
            'booking_id', p_booking_id,
            'status', p_status
        )
    );
END;
$$;

COMMENT ON FUNCTION public.fn_calendar_sync_tarjeta_stage(uuid, text, uuid)
    IS 'Sincroniza la etapa de la tarjeta cuando cambia el estado de una cita del calendario.';

CREATE OR REPLACE FUNCTION public.tg_calendar_bookings_sync_stage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tarjeta_id uuid;
BEGIN
    v_tarjeta_id := NEW.tarjeta_id;

    IF v_tarjeta_id IS NULL AND NEW.conversacion_id IS NOT NULL THEN
        SELECT lt.id INTO v_tarjeta_id
        FROM public.lead_tarjetas lt
        WHERE lt.conversacion_id = NEW.conversacion_id
        ORDER BY lt.creado_en DESC
        LIMIT 1;
    END IF;

    IF v_tarjeta_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'confirmed' THEN
            PERFORM public.fn_calendar_sync_tarjeta_stage(v_tarjeta_id, 'confirmed', NEW.id);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            PERFORM public.fn_calendar_sync_tarjeta_stage(v_tarjeta_id, NEW.status, NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_bookings_sync_stage ON public.calendar_bookings;
CREATE TRIGGER calendar_bookings_sync_stage
AFTER INSERT OR UPDATE OF status ON public.calendar_bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_calendar_bookings_sync_stage();

COMMIT;
