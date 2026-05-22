BEGIN;

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS telefono_principal_tipo_linea text,
    ADD COLUMN IF NOT EXISTS correo_secundario text,
    ADD COLUMN IF NOT EXISTS telefono_secundario_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_secundario_tipo_linea text,
    ADD COLUMN IF NOT EXISTS telefono_secundario_extension text;

ALTER TABLE public.cuentas
    ADD COLUMN IF NOT EXISTS correo_principal text,
    ADD COLUMN IF NOT EXISTS correo_secundario text,
    ADD COLUMN IF NOT EXISTS telefono_principal_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_principal_tipo_linea text,
    ADD COLUMN IF NOT EXISTS telefono_principal_extension text,
    ADD COLUMN IF NOT EXISTS telefono_secundario_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_secundario_tipo_linea text,
    ADD COLUMN IF NOT EXISTS telefono_secundario_extension text;

UPDATE public.personas
SET
    correo_principal = COALESCE(NULLIF(btrim(correo_principal), ''), NULLIF(btrim(correo), '')),
    correo_secundario = COALESCE(NULLIF(btrim(correo_secundario), ''), NULLIF(btrim(correo_institucional), '')),
    correo_institucional = COALESCE(NULLIF(btrim(correo_institucional), ''), NULLIF(btrim(correo_secundario), '')),
    correo_personal_3 = NULLIF(btrim(correo_personal_3), ''),
    telefono_principal_e164 = COALESCE(NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono_movil_1_e164), '')),
    telefono_principal_tipo_linea = COALESCE(
        NULLIF(btrim(telefono_principal_tipo_linea), ''),
        CASE
            WHEN COALESCE(NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono_movil_1_e164), '')) IS NOT NULL
                THEN 'movil'
        END
    ),
    telefono_principal_extension = NULLIF(btrim(telefono_principal_extension), ''),
    telefono_secundario_e164 = COALESCE(NULLIF(btrim(telefono_secundario_e164), ''), NULLIF(btrim(telefono_movil_2_e164), '')),
    telefono_secundario_tipo_linea = COALESCE(
        NULLIF(btrim(telefono_secundario_tipo_linea), ''),
        CASE
            WHEN COALESCE(NULLIF(btrim(telefono_secundario_e164), ''), NULLIF(btrim(telefono_movil_2_e164), '')) IS NOT NULL
                THEN 'movil'
        END
    ),
    telefono_secundario_extension = COALESCE(
        NULLIF(btrim(telefono_secundario_extension), ''),
        NULLIF(btrim(telefono_empresa_1_extension), '')
    ),
    correo = COALESCE(NULLIF(btrim(correo_principal), ''), NULLIF(btrim(correo), '')),
    telefono_movil_1_e164 = COALESCE(NULLIF(btrim(telefono_movil_1_e164), ''), NULLIF(btrim(telefono_principal_e164), '')),
    telefono_movil_2_e164 = COALESCE(NULLIF(btrim(telefono_movil_2_e164), ''), NULLIF(btrim(telefono_secundario_e164), '')),
    telefono_empresa_1_e164 = NULLIF(btrim(telefono_empresa_1_e164), ''),
    telefono_empresa_1_extension = NULLIF(btrim(telefono_empresa_1_extension), ''),
    telefono_empresa_2_e164 = NULLIF(btrim(telefono_empresa_2_e164), ''),
    telefono_empresa_2_extension = NULLIF(btrim(telefono_empresa_2_extension), '');

UPDATE public.cuentas
SET
    correo_principal = COALESCE(NULLIF(btrim(correo_principal), ''), NULLIF(btrim(correo), ''), NULLIF(btrim(email), '')),
    correo_secundario = NULLIF(btrim(correo_secundario), ''),
    telefono_principal_e164 = COALESCE(NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono), '')),
    telefono_principal_tipo_linea = COALESCE(
        NULLIF(btrim(telefono_principal_tipo_linea), ''),
        CASE
            WHEN COALESCE(NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono), '')) IS NOT NULL
                THEN 'movil'
        END
    ),
    telefono_principal_extension = NULLIF(btrim(telefono_principal_extension), ''),
    telefono_secundario_e164 = NULLIF(btrim(telefono_secundario_e164), ''),
    telefono_secundario_tipo_linea = NULLIF(btrim(telefono_secundario_tipo_linea), ''),
    telefono_secundario_extension = NULLIF(btrim(telefono_secundario_extension), ''),
    correo = COALESCE(NULLIF(btrim(correo_principal), ''), NULLIF(btrim(correo), ''), NULLIF(btrim(email), '')),
    email = COALESCE(NULLIF(btrim(correo_principal), ''), NULLIF(btrim(email), ''), NULLIF(btrim(correo), '')),
    telefono = COALESCE(NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono), '')),
    sitio_web = COALESCE(NULLIF(btrim(sitio_web), ''), NULLIF(btrim(website), '')),
    website = COALESCE(NULLIF(btrim(website), ''), NULLIF(btrim(sitio_web), ''));

CREATE INDEX IF NOT EXISTS personas_org_correo_principal_idx
    ON public.personas (organizacion_id, lower(correo_principal))
    WHERE correo_principal IS NOT NULL AND btrim(correo_principal) <> '';

CREATE INDEX IF NOT EXISTS personas_org_correo_secundario_idx
    ON public.personas (organizacion_id, lower(correo_secundario))
    WHERE correo_secundario IS NOT NULL AND btrim(correo_secundario) <> '';

CREATE INDEX IF NOT EXISTS personas_org_telefono_principal_idx
    ON public.personas (organizacion_id, telefono_principal_e164)
    WHERE telefono_principal_e164 IS NOT NULL AND btrim(telefono_principal_e164) <> '';

CREATE INDEX IF NOT EXISTS personas_org_telefono_secundario_idx
    ON public.personas (organizacion_id, telefono_secundario_e164)
    WHERE telefono_secundario_e164 IS NOT NULL AND btrim(telefono_secundario_e164) <> '';

CREATE INDEX IF NOT EXISTS cuentas_org_correo_principal_idx
    ON public.cuentas (organizacion_id, lower(correo_principal))
    WHERE correo_principal IS NOT NULL AND btrim(correo_principal) <> '';

CREATE INDEX IF NOT EXISTS cuentas_org_correo_secundario_idx
    ON public.cuentas (organizacion_id, lower(correo_secundario))
    WHERE correo_secundario IS NOT NULL AND btrim(correo_secundario) <> '';

CREATE INDEX IF NOT EXISTS cuentas_org_telefono_principal_idx
    ON public.cuentas (organizacion_id, telefono_principal_e164)
    WHERE telefono_principal_e164 IS NOT NULL AND btrim(telefono_principal_e164) <> '';

CREATE INDEX IF NOT EXISTS cuentas_org_telefono_secundario_idx
    ON public.cuentas (organizacion_id, telefono_secundario_e164)
    WHERE telefono_secundario_e164 IS NOT NULL AND btrim(telefono_secundario_e164) <> '';

CREATE OR REPLACE FUNCTION public.tg_sync_persona_contact_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.correo_principal := COALESCE(
        NULLIF(btrim(NEW.correo_principal), ''),
        NULLIF(btrim(NEW.correo), '')
    );
    NEW.correo_secundario := COALESCE(
        NULLIF(btrim(NEW.correo_secundario), ''),
        NULLIF(btrim(NEW.correo_institucional), '')
    );
    NEW.correo_institucional := COALESCE(
        NULLIF(btrim(NEW.correo_institucional), ''),
        NEW.correo_secundario
    );
    NEW.correo_personal_3 := NULLIF(btrim(NEW.correo_personal_3), '');
    NEW.telefono_principal_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_principal_e164), ''),
        NULLIF(btrim(NEW.telefono_movil_1_e164), '')
    );
    NEW.telefono_principal_tipo_linea := COALESCE(NULLIF(btrim(NEW.telefono_principal_tipo_linea), ''), 'movil');
    NEW.telefono_principal_extension := NULLIF(btrim(NEW.telefono_principal_extension), '');
    NEW.telefono_secundario_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_secundario_e164), ''),
        NULLIF(btrim(NEW.telefono_movil_2_e164), '')
    );
    NEW.telefono_secundario_tipo_linea := COALESCE(NULLIF(btrim(NEW.telefono_secundario_tipo_linea), ''), 'movil');
    NEW.telefono_secundario_extension := COALESCE(
        NULLIF(btrim(NEW.telefono_secundario_extension), ''),
        NULLIF(btrim(NEW.telefono_empresa_1_extension), '')
    );
    NEW.telefono_movil_1_e164 := NEW.telefono_principal_e164;
    NEW.telefono_movil_2_e164 := NEW.telefono_secundario_e164;
    NEW.telefono_empresa_1_e164 := NULLIF(btrim(NEW.telefono_empresa_1_e164), '');
    NEW.telefono_empresa_1_extension := NULLIF(btrim(NEW.telefono_empresa_1_extension), '');
    NEW.telefono_empresa_2_e164 := NULLIF(btrim(NEW.telefono_empresa_2_e164), '');
    NEW.telefono_empresa_2_extension := NULLIF(btrim(NEW.telefono_empresa_2_extension), '');
    NEW.correo := COALESCE(
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
SET search_path = public
AS $function$
BEGIN
    IF btrim(COALESCE(NEW.correo_principal, '')) = '' THEN
        RAISE EXCEPTION 'correo_principal_required';
    END IF;
    IF btrim(COALESCE(NEW.telefono_principal_e164, '')) = '' THEN
        RAISE EXCEPTION 'telefono_principal_required';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_sync_account_contact_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.correo_principal := COALESCE(
        NULLIF(btrim(NEW.correo_principal), ''),
        NULLIF(btrim(NEW.correo), ''),
        NULLIF(btrim(NEW.email), '')
    );
    NEW.correo_secundario := NULLIF(btrim(NEW.correo_secundario), '');
    NEW.telefono_principal_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_principal_e164), ''),
        NULLIF(btrim(NEW.telefono), '')
    );
    NEW.telefono_principal_tipo_linea := COALESCE(NULLIF(btrim(NEW.telefono_principal_tipo_linea), ''), 'movil');
    NEW.telefono_principal_extension := NULLIF(btrim(NEW.telefono_principal_extension), '');
    NEW.telefono_secundario_e164 := NULLIF(btrim(NEW.telefono_secundario_e164), '');
    NEW.telefono_secundario_tipo_linea := NULLIF(btrim(NEW.telefono_secundario_tipo_linea), '');
    NEW.telefono_secundario_extension := NULLIF(btrim(NEW.telefono_secundario_extension), '');
    NEW.correo := COALESCE(
        NULLIF(btrim(NEW.correo_principal), ''),
        NULLIF(btrim(NEW.correo), ''),
        NULLIF(btrim(NEW.email), '')
    );
    NEW.email := COALESCE(
        NULLIF(btrim(NEW.correo_principal), ''),
        NULLIF(btrim(NEW.email), ''),
        NULLIF(btrim(NEW.correo), '')
    );
    NEW.telefono := COALESCE(
        NULLIF(btrim(NEW.telefono_principal_e164), ''),
        NULLIF(btrim(NEW.telefono), '')
    );
    NEW.sitio_web := COALESCE(
        NULLIF(btrim(NEW.sitio_web), ''),
        NULLIF(btrim(NEW.website), '')
    );
    NEW.website := COALESCE(
        NULLIF(btrim(NEW.website), ''),
        NULLIF(btrim(NEW.sitio_web), '')
    );
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_sync_persona_contact_aliases ON public.personas;
CREATE TRIGGER tg_sync_persona_contact_aliases
BEFORE INSERT OR UPDATE OF
    correo_principal,
    correo_secundario,
    correo_institucional,
    correo_personal_3,
    telefono_principal_e164,
    telefono_principal_tipo_linea,
    telefono_principal_extension,
    telefono_secundario_e164,
    telefono_secundario_tipo_linea,
    telefono_secundario_extension,
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
AFTER INSERT OR UPDATE OF
    nombre_completo,
    correo,
    correo_principal,
    correo_institucional,
    telefono_principal_e164,
    telefono_principal_tipo_linea,
    telefono_principal_extension,
    telefono_secundario_e164,
    telefono_secundario_tipo_linea,
    telefono_secundario_extension,
    company_name
ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_personas_auto_precalificado();

DROP TRIGGER IF EXISTS tg_sync_account_contact_aliases ON public.cuentas;
CREATE TRIGGER tg_sync_account_contact_aliases
BEFORE INSERT OR UPDATE OF
    correo_principal,
    correo_secundario,
    telefono_principal_e164,
    telefono_principal_tipo_linea,
    telefono_principal_extension,
    telefono_secundario_e164,
    telefono_secundario_tipo_linea,
    telefono_secundario_extension,
    correo,
    email,
    telefono,
    sitio_web,
    website
ON public.cuentas
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_account_contact_aliases();

COMMIT;
