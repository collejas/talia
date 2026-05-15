BEGIN;

ALTER VIEW public.conversaciones_en_curso SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.tg_sync_persona_contact_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.correo := COALESCE(NULLIF(NEW.correo_principal, ''), NULLIF(NEW.persona_datos #>> '{correo}', ''), NULLIF(NEW.metadata #>> '{correo}', ''));
    NEW.company_name := COALESCE(
        NULLIF(NEW.persona_datos #>> '{company_name}', ''),
        NULLIF(NEW.persona_datos #>> '{empresa}', ''),
        NULLIF(NEW.metadata #>> '{company_name}', ''),
        NULLIF(NEW.metadata #>> '{empresa}', '')
    );
    NEW.estado := COALESCE(
        NULLIF(NEW.estado, ''),
        NULLIF(NEW.persona_datos #>> '{estado}', ''),
        NULLIF(NEW.metadata #>> '{estado}', ''),
        'activo'
    );
    NEW.captura_estado := COALESCE(
        NULLIF(NEW.captura_estado, ''),
        NULLIF(NEW.persona_datos #>> '{captura_estado}', ''),
        NULLIF(NEW.metadata #>> '{captura_estado}', ''),
        'incompleto'
    );
    RETURN NEW;
END;
$function$;

COMMIT;
