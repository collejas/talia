BEGIN;

CREATE OR REPLACE FUNCTION public.tg_personas_require_contact_methods()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF lower(COALESCE(NEW.origen, '')) = 'webchat'
       OR COALESCE(NEW.persona_datos ->> 'source', NEW.metadata ->> 'source', '') = 'webchat_runtime' THEN
        RETURN NEW;
    END IF;

    IF btrim(COALESCE(NEW.telefono_movil_1_e164, '')) = '' THEN
        RAISE EXCEPTION 'telefono_movil_1_required';
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_personas_require_contact_methods()
IS 'Exige telefono movil para altas generales de personas, pero permite altas incompletas originadas por webchat_runtime.';

COMMIT;
