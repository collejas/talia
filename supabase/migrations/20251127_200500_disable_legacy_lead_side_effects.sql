BEGIN;

-- Evita que los triggers legacy fallen cuando las tablas lead_* ya no existen.

CREATE OR REPLACE FUNCTION public.tg_calendar_bookings_sync_stage() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_tarjeta_id uuid;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
BEGIN
    IF NOT legacy_cards THEN
        RETURN NEW;
    END IF;

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

CREATE OR REPLACE FUNCTION public.tg_contactos_auto_asignacion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_tenian_datos boolean := FALSE;
    v_tienen_datos boolean := FALSE;
    v_vendedor uuid;
    v_owner uuid;
    v_lead_existe boolean;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
BEGIN
    -- Si el contacto proviene de WhatsApp, la tarjeta se crea desde el backend;
    -- no debemos duplicarla desde este trigger pensado para webchat/landing.
    IF COALESCE(NEW.origen, '') = 'whatsapp' THEN
        RETURN NEW;
    END IF;

    v_tienen_datos :=
        (NEW.correo IS NOT NULL AND btrim(NEW.correo) <> '') OR
        (NEW.telefono_e164 IS NOT NULL AND btrim(NEW.telefono_e164) <> '');

    IF NOT v_tienen_datos THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_tenian_datos :=
            (OLD.correo IS NOT NULL AND btrim(OLD.correo) <> '') OR
            (OLD.telefono_e164 IS NOT NULL AND btrim(OLD.telefono_e164) <> '');
        IF v_tenian_datos THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT public.next_vendedor_round_robin() INTO v_vendedor;
    IF v_vendedor IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.propietario_usuario_id IS NULL THEN
        NEW.propietario_usuario_id := v_vendedor;
    END IF;
    v_owner := NEW.propietario_usuario_id;

    IF NOT legacy_cards THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.lead_tarjetas
         WHERE contacto_id = NEW.id
    ) INTO v_lead_existe;

    IF NOT v_lead_existe THEN
        INSERT INTO public.lead_tarjetas (
            contacto_id,
            propietario_usuario_id,
            asignado_a_usuario_id,
            fuente,
            metadata
        )
        VALUES (
            NEW.id,
            COALESCE(v_owner, v_vendedor),
            v_vendedor,
            'contacto_auto',
            jsonb_build_object('auto', true, 'motivo', 'contacto_datos_capturados')
        )
        ON CONFLICT DO NOTHING;
    ELSE
        UPDATE public.lead_tarjetas
           SET asignado_a_usuario_id = COALESCE(asignado_a_usuario_id, v_vendedor),
               propietario_usuario_id = COALESCE(propietario_usuario_id, v_owner, v_vendedor)
         WHERE contacto_id = NEW.id
           AND (asignado_a_usuario_id IS NULL OR propietario_usuario_id IS NULL);
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_conversaciones_auto_tarjeta() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_tablero uuid;
    v_etapa uuid;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
    legacy_boards boolean := (to_regclass('public.lead_tableros') IS NOT NULL);
    legacy_stages boolean := (to_regclass('public.lead_etapas') IS NOT NULL);
BEGIN
    IF NEW.estado = 'cerrada' THEN
        RETURN NEW;
    END IF;

    IF NEW.ultimo_entrante_en IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT (legacy_cards AND legacy_boards AND legacy_stages) THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.lead_tarjetas lt
         WHERE lt.conversacion_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_tablero
      FROM public.lead_tableros
     WHERE es_default = TRUE
     ORDER BY creado_en
     LIMIT 1;

    IF v_tablero IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_etapa
      FROM public.lead_etapas
     WHERE tablero_id = v_tablero
       AND COALESCE(metadatos->>'is_counter_only', 'false') <> 'true'
     ORDER BY orden
     LIMIT 1;

    IF v_etapa IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.lead_tarjetas (
        contacto_id,
        conversacion_id,
        tablero_id,
        etapa_id,
        canal,
        propietario_usuario_id,
        asignado_a_usuario_id,
        fuente,
        metadata
    )
    VALUES (
        NEW.contacto_id,
        NEW.id,
        v_tablero,
        v_etapa,
        NEW.canal,
        NEW.asignado_a_usuario_id,
        NEW.asignado_a_usuario_id,
        'asistente',
        jsonb_build_object('auto', true, 'motivo', 'conversacion_nueva')
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

COMMIT;
