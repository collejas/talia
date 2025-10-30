BEGIN;

CREATE OR REPLACE FUNCTION public.tg_contactos_auto_asignacion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tenian_datos boolean := FALSE;
    v_tienen_datos boolean := FALSE;
    v_vendedor uuid;
    v_owner uuid;
    v_lead_existe boolean;
BEGIN
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

DROP TRIGGER IF EXISTS contactos_auto_asignacion ON public.contactos;
CREATE TRIGGER contactos_auto_asignacion
    BEFORE INSERT OR UPDATE ON public.contactos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_contactos_auto_asignacion();

COMMIT;
