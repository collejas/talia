BEGIN;

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS telefono_principal_extension text;

UPDATE public.personas
SET telefono_principal_extension = NULLIF(btrim(telefono_principal_extension), '');

CREATE OR REPLACE FUNCTION public.tg_sync_persona_contact_aliases()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.correo_institucional := COALESCE(
        NULLIF(btrim(NEW.correo_institucional), ''),
        NULLIF(btrim(NEW.correo_principal), '')
    );
    NEW.correo_principal := COALESCE(
        NULLIF(btrim(NEW.correo_principal), ''),
        NULLIF(btrim(NEW.correo_institucional), '')
    );
    NEW.correo_personal_3 := NULLIF(btrim(NEW.correo_personal_3), '');
    NEW.telefono_principal_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_principal_e164), ''),
        NULLIF(btrim(NEW.telefono_movil_1_e164), '')
    );
    NEW.telefono_principal_extension := NULLIF(btrim(NEW.telefono_principal_extension), '');
    NEW.telefono_movil_1_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_movil_1_e164), ''),
        NULLIF(btrim(NEW.telefono_principal_e164), '')
    );
    NEW.telefono_movil_2_e164 := NULLIF(btrim(NEW.telefono_movil_2_e164), '');
    NEW.telefono_empresa_1_e164 := NULLIF(btrim(NEW.telefono_empresa_1_e164), '');
    NEW.telefono_empresa_1_extension := NULLIF(btrim(NEW.telefono_empresa_1_extension), '');
    NEW.telefono_empresa_2_e164 := NULLIF(btrim(NEW.telefono_empresa_2_e164), '');
    NEW.telefono_empresa_2_extension := NULLIF(btrim(NEW.telefono_empresa_2_extension), '');
    NEW.correo := COALESCE(
        NULLIF(btrim(NEW.correo_institucional), ''),
        NULLIF(btrim(NEW.correo_principal), ''),
        NULLIF(btrim(NEW.correo), '')
    );
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
BEFORE INSERT OR UPDATE OF
    correo_principal,
    correo_institucional,
    correo_personal_3,
    telefono_principal_e164,
    telefono_principal_extension,
    telefono_movil_1_e164,
    telefono_movil_2_e164,
    telefono_empresa_1_e164,
    telefono_empresa_1_extension,
    telefono_empresa_2_e164,
    telefono_empresa_2_extension,
    persona_datos,
    metadata
ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_persona_contact_aliases();

COMMIT;
