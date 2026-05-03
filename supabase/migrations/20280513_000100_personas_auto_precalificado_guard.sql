BEGIN;

CREATE OR REPLACE FUNCTION public.tg_personas_auto_precalificado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tarjeta_id uuid;
    v_legacy_cards boolean := (to_regclass('public.lead_tarjetas') IS NOT NULL);
BEGIN
    IF NOT v_legacy_cards THEN
        RETURN NEW;
    END IF;

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

COMMENT ON FUNCTION public.tg_personas_auto_precalificado() IS
    'No hace nada si la tabla legacy lead_tarjetas ya no existe.';

COMMIT;
