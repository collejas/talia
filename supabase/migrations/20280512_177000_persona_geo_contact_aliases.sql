BEGIN;

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS correo text,
    ADD COLUMN IF NOT EXISTS company_name text,
    ADD COLUMN IF NOT EXISTS estado text,
    ADD COLUMN IF NOT EXISTS captura_estado text;

UPDATE public.personas p
SET
    correo = COALESCE(NULLIF(p.correo_principal, ''), NULLIF(p.persona_datos #>> '{correo}', ''), NULLIF(p.metadata #>> '{correo}', '')),
    company_name = COALESCE(
        NULLIF(p.persona_datos #>> '{company_name}', ''),
        NULLIF(p.persona_datos #>> '{empresa}', ''),
        NULLIF(p.metadata #>> '{company_name}', ''),
        NULLIF(p.metadata #>> '{empresa}', '')
    ),
    estado = COALESCE(
        NULLIF(p.estado, ''),
        NULLIF(p.persona_datos #>> '{estado}', ''),
        NULLIF(p.metadata #>> '{estado}', ''),
        'activo'
    ),
    captura_estado = COALESCE(
        NULLIF(p.captura_estado, ''),
        NULLIF(p.persona_datos #>> '{captura_estado}', ''),
        NULLIF(p.metadata #>> '{captura_estado}', ''),
        'incompleto'
    );

CREATE OR REPLACE FUNCTION public.tg_sync_persona_contact_aliases()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS tg_sync_persona_contact_aliases ON public.personas;
CREATE TRIGGER tg_sync_persona_contact_aliases
BEFORE INSERT OR UPDATE OF correo_principal, persona_datos, metadata
ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_persona_contact_aliases();

COMMIT;
