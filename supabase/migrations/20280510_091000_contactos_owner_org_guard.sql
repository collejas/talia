BEGIN;

-- Evita que el trigger de contactos asigne un propietario que no exista en usuarios
-- para la misma organización. El FK compuesto de contactos requiere ambos valores.

CREATE OR REPLACE FUNCTION public.next_vendedor_round_robin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid := NULLIF(current_setting('app.current_organizacion_id', true), '')::uuid;
BEGIN
    RETURN public.next_vendedor_round_robin(v_org);
END;
$$;

CREATE OR REPLACE FUNCTION public.next_vendedor_round_robin(p_organizacion_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario uuid;
BEGIN
    SELECT e.usuario_id
      INTO v_usuario
      FROM public.empleados e
      JOIN public.usuarios u
        ON u.id = e.usuario_id
       AND u.organizacion_id = e.organizacion_id
     WHERE e.es_vendedor = TRUE
       AND (p_organizacion_id IS NULL OR e.organizacion_id = p_organizacion_id)
     ORDER BY COALESCE(e.ultimo_lead_asignado_en, to_timestamp(0)), e.creado_en, e.usuario_id
     FOR UPDATE OF e SKIP LOCKED
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE public.empleados
       SET ultimo_lead_asignado_en = now()
     WHERE usuario_id = v_usuario;

    RETURN v_usuario;
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
    v_org uuid;
    v_owner_valido boolean := FALSE;
    v_lead_existe boolean;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
BEGIN
    -- Si el contacto proviene de WhatsApp, la tarjeta se crea desde el backend;
    -- no debemos duplicarla desde este trigger pensado para webchat/landing.
    IF COALESCE(NEW.origen, '') = 'whatsapp' THEN
        RETURN NEW;
    END IF;

    v_org := NEW.organizacion_id;
    IF v_org IS NULL THEN
        v_org := NULLIF(current_setting('app.current_organizacion_id', true), '')::uuid;
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

    IF NEW.propietario_usuario_id IS NOT NULL AND v_org IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.usuarios u
             WHERE u.id = NEW.propietario_usuario_id
               AND u.organizacion_id = v_org
        ) INTO v_owner_valido;

        IF NOT v_owner_valido THEN
            NEW.propietario_usuario_id := NULL;
        END IF;
    END IF;

    IF NEW.propietario_usuario_id IS NULL THEN
        NEW.propietario_usuario_id := public.next_vendedor_round_robin(v_org);
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
            COALESCE(v_owner, NEW.propietario_usuario_id),
            v_owner,
            'contacto_auto',
            jsonb_build_object('auto', true, 'motivo', 'contacto_datos_capturados')
        )
        ON CONFLICT DO NOTHING;
    ELSE
        UPDATE public.lead_tarjetas
           SET asignado_a_usuario_id = COALESCE(asignado_a_usuario_id, v_owner),
               propietario_usuario_id = COALESCE(propietario_usuario_id, v_owner)
         WHERE contacto_id = NEW.id
           AND (asignado_a_usuario_id IS NULL OR propietario_usuario_id IS NULL);
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
