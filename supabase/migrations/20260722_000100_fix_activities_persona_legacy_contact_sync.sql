BEGIN;

-- Una persona canónica no necesariamente tiene un registro legacy en contactos.
-- Solo se conserva contacto_id cuando existe una fila legacy con el mismo UUID.
CREATE OR REPLACE FUNCTION public.tg_sync_persona_contacto_ids()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.organizacion_id IS NOT NULL AND NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := OLD.organizacion_id;
        RETURN NEW;
    END IF;

    IF NEW.persona_id IS NULL AND NEW.contacto_id IS NOT NULL THEN
        NEW.persona_id := public.resolve_persona_id_for_contact(NEW.organizacion_id, NEW.contacto_id);
    END IF;

    IF NEW.contacto_id IS NULL AND NEW.persona_id IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM public.contactos c
           WHERE c.organizacion_id = NEW.organizacion_id
             AND c.id = NEW.persona_id
       ) THEN
        NEW.contacto_id := NEW.persona_id;
    END IF;

    RETURN NEW;
END;
$function$;

COMMIT;
