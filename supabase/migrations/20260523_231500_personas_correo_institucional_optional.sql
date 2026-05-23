CREATE OR REPLACE FUNCTION public.tg_personas_require_contact_methods()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF btrim(COALESCE(NEW.telefono_movil_1_e164, '')) = '' THEN
        RAISE EXCEPTION 'telefono_movil_1_required';
    END IF;
    RETURN NEW;
END;
$function$;
