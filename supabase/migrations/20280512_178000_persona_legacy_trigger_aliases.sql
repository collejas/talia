BEGIN;

CREATE OR REPLACE FUNCTION public.puede_ver_contacto(p_contacto_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public
AS $function$
    SELECT public.puede_ver_persona(p_contacto_id);
$function$;

CREATE OR REPLACE FUNCTION public.tg_personas_auto_asignacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
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
        (NEW.telefono_principal_e164 IS NOT NULL AND btrim(NEW.telefono_principal_e164) <> '');

    IF NOT v_tienen_datos THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_tenian_datos :=
            (OLD.correo IS NOT NULL AND btrim(OLD.correo) <> '') OR
            (OLD.telefono_principal_e164 IS NOT NULL AND btrim(OLD.telefono_principal_e164) <> '');
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
            'persona_auto',
            jsonb_build_object('auto', true, 'motivo', 'persona_datos_capturados')
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
$function$;

CREATE OR REPLACE FUNCTION public.tg_personas_auto_precalificado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tarjeta_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF COALESCE(NEW.nombre_completo, '') = COALESCE(OLD.nombre_completo, '')
           AND COALESCE(NEW.correo, '') = COALESCE(OLD.correo, '')
           AND COALESCE(NEW.telefono_principal_e164, '') = COALESCE(OLD.telefono_principal_e164, '')
           AND COALESCE(NEW.company_name, '') = COALESCE(OLD.company_name, '') THEN
            RETURN NEW;
        END IF;
    END IF;

    FOR v_tarjeta_id IN
        SELECT lt.id
          FROM public.lead_tarjetas lt
         WHERE lt.contacto_id = NEW.id
    LOOP
        PERFORM public._lead_tarjeta_auto_precalificar(v_tarjeta_id);
    END LOOP;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS personas_auto_asignacion ON public.personas;
CREATE TRIGGER personas_auto_asignacion
BEFORE INSERT OR UPDATE ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_personas_auto_asignacion();

DROP TRIGGER IF EXISTS personas_auto_precalificado ON public.personas;
CREATE TRIGGER personas_auto_precalificado
AFTER INSERT OR UPDATE OF nombre_completo, correo, telefono_principal_e164, company_name ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_personas_auto_precalificado();

CREATE OR REPLACE FUNCTION public.tg_conversaciones_auto_tarjeta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tablero uuid;
    v_etapa uuid;
    v_persona_id uuid;
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

    v_persona_id := COALESCE(NEW.persona_id, NEW.contacto_id);

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
        v_persona_id,
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
$function$;

COMMIT;
