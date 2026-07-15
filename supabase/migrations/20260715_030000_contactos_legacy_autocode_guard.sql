BEGIN;

CREATE OR REPLACE FUNCTION public.tg_contactos_codigo_legacy_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF NEW.organizacion_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NULLIF(btrim(COALESCE(NEW.codigo_contacto, '')), '') IS NULL
       OR NEW.codigo_contacto !~ '^Con[0-9]+$' THEN
        NEW.codigo_contacto := public.gen_codigo_contacto(NEW.organizacion_id);
    ELSE
        NEW.codigo_contacto := btrim(NEW.codigo_contacto);
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_contactos_codigo_legacy_guard ON public.contactos;
CREATE TRIGGER tr_contactos_codigo_legacy_guard
BEFORE INSERT OR UPDATE OF codigo_contacto, organizacion_id ON public.contactos
FOR EACH ROW
EXECUTE FUNCTION public.tg_contactos_codigo_legacy_guard();

COMMENT ON FUNCTION public.tg_contactos_codigo_legacy_guard()
IS 'Garantiza codigo_contacto legacy valido en public.contactos usando el consecutivo oficial ConN por organizacion.';

COMMIT;
