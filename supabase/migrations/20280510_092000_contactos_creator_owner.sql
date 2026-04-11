BEGIN;

-- Si el contacto lo crea un vendedor autenticado, el propietario debe ser ese mismo usuario.
-- Solo caemos al round robin cuando no existe un creador vendedor válido en la sesión.

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
    v_creator uuid;
    v_creator_es_vendedor boolean := FALSE;
    v_owner_valido boolean := FALSE;
    v_lead_existe boolean;
    legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
BEGIN
    IF COALESCE(NEW.origen, '') = 'whatsapp' THEN
        RETURN NEW;
    END IF;

    v_org := NEW.organizacion_id;
    IF v_org IS NULL THEN
        v_org := NULLIF(current_setting('app.current_organizacion_id', true), '')::uuid;
    END IF;

    v_creator := auth.uid();
    IF v_creator IS NOT NULL AND v_org IS NOT NULL AND TG_OP = 'INSERT' THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.empleados e
              JOIN public.usuarios u
                ON u.id = e.usuario_id
               AND u.organizacion_id = e.organizacion_id
             WHERE e.usuario_id = v_creator
               AND e.organizacion_id = v_org
               AND COALESCE(e.es_vendedor, false)
        ) INTO v_creator_es_vendedor;
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

    IF TG_OP = 'INSERT' AND v_creator_es_vendedor THEN
        NEW.propietario_usuario_id := v_creator;
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
        IF v_creator_es_vendedor THEN
            NEW.propietario_usuario_id := v_creator;
        ELSE
            NEW.propietario_usuario_id := public.next_vendedor_round_robin(v_org);
        END IF;
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
