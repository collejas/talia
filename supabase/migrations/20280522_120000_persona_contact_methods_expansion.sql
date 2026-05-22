BEGIN;

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS correo_institucional text,
    ADD COLUMN IF NOT EXISTS correo_personal_3 text,
    ADD COLUMN IF NOT EXISTS telefono_movil_1_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_movil_2_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_empresa_1_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_empresa_1_extension text,
    ADD COLUMN IF NOT EXISTS telefono_empresa_2_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_empresa_2_extension text;

UPDATE public.personas
SET
    correo_institucional = COALESCE(
        NULLIF(btrim(correo_institucional), ''),
        NULLIF(btrim(correo_principal), '')
    ),
    correo_personal_3 = NULLIF(btrim(correo_personal_3), ''),
    telefono_movil_1_e164 = COALESCE(
        NULLIF(btrim(telefono_movil_1_e164), ''),
        NULLIF(btrim(telefono_principal_e164), '')
    ),
    telefono_movil_2_e164 = NULLIF(btrim(telefono_movil_2_e164), ''),
    telefono_empresa_1_e164 = NULLIF(btrim(telefono_empresa_1_e164), ''),
    telefono_empresa_1_extension = NULLIF(btrim(telefono_empresa_1_extension), ''),
    telefono_empresa_2_e164 = NULLIF(btrim(telefono_empresa_2_e164), ''),
    telefono_empresa_2_extension = NULLIF(btrim(telefono_empresa_2_extension), ''),
    correo_principal = COALESCE(
        NULLIF(btrim(correo_principal), ''),
        NULLIF(btrim(correo_institucional), '')
    ),
    telefono_principal_e164 = COALESCE(
        NULLIF(btrim(telefono_principal_e164), ''),
        NULLIF(btrim(telefono_movil_1_e164), '')
    ),
    correo = COALESCE(
        NULLIF(btrim(correo_institucional), ''),
        NULLIF(btrim(correo_principal), ''),
        NULLIF(btrim(correo), '')
    );

CREATE INDEX IF NOT EXISTS personas_org_correo_institucional_idx
    ON public.personas (organizacion_id, lower(correo_institucional))
    WHERE correo_institucional IS NOT NULL AND btrim(correo_institucional) <> '';

CREATE INDEX IF NOT EXISTS personas_org_correo_personal_3_idx
    ON public.personas (organizacion_id, lower(correo_personal_3))
    WHERE correo_personal_3 IS NOT NULL AND btrim(correo_personal_3) <> '';

CREATE INDEX IF NOT EXISTS personas_org_telefono_movil_1_idx
    ON public.personas (organizacion_id, telefono_movil_1_e164)
    WHERE telefono_movil_1_e164 IS NOT NULL AND btrim(telefono_movil_1_e164) <> '';

CREATE INDEX IF NOT EXISTS personas_org_telefono_movil_2_idx
    ON public.personas (organizacion_id, telefono_movil_2_e164)
    WHERE telefono_movil_2_e164 IS NOT NULL AND btrim(telefono_movil_2_e164) <> '';

CREATE INDEX IF NOT EXISTS personas_org_telefono_empresa_1_idx
    ON public.personas (organizacion_id, telefono_empresa_1_e164)
    WHERE telefono_empresa_1_e164 IS NOT NULL AND btrim(telefono_empresa_1_e164) <> '';

CREATE INDEX IF NOT EXISTS personas_org_telefono_empresa_2_idx
    ON public.personas (organizacion_id, telefono_empresa_2_e164)
    WHERE telefono_empresa_2_e164 IS NOT NULL AND btrim(telefono_empresa_2_e164) <> '';

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
    NEW.telefono_movil_1_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_movil_1_e164), ''),
        NULLIF(btrim(NEW.telefono_principal_e164), '')
    );
    NEW.telefono_principal_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_principal_e164), ''),
        NULLIF(btrim(NEW.telefono_movil_1_e164), '')
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

CREATE OR REPLACE FUNCTION public.tg_personas_require_contact_methods()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF btrim(COALESCE(NEW.correo_institucional, '')) = '' THEN
        RAISE EXCEPTION 'correo_institucional_required';
    END IF;
    IF btrim(COALESCE(NEW.telefono_movil_1_e164, '')) = '' THEN
        RAISE EXCEPTION 'telefono_movil_1_required';
    END IF;
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

DROP TRIGGER IF EXISTS personas_require_contact_methods ON public.personas;
CREATE TRIGGER personas_require_contact_methods
BEFORE INSERT ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_personas_require_contact_methods();

DROP TRIGGER IF EXISTS personas_auto_precalificado ON public.personas;
CREATE TRIGGER personas_auto_precalificado
AFTER INSERT OR UPDATE OF nombre_completo, correo, correo_principal, correo_institucional, telefono_principal_e164, telefono_movil_1_e164, company_name ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_personas_auto_precalificado();

COMMIT;
