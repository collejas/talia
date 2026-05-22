BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS correo_principal text,
    ADD COLUMN IF NOT EXISTS correo_secundario text,
    ADD COLUMN IF NOT EXISTS telefono_principal_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_principal_tipo_linea text,
    ADD COLUMN IF NOT EXISTS telefono_principal_extension text,
    ADD COLUMN IF NOT EXISTS telefono_movil_1_e164 text,
    ADD COLUMN IF NOT EXISTS telefono_movil_1_tipo_linea text;

UPDATE public.prospeccion_prospectos
SET
    correo_principal = COALESCE(NULLIF(btrim(correo_principal), ''), NULLIF(btrim(email), '')),
    correo_secundario = NULLIF(btrim(correo_secundario), ''),
    telefono_principal_e164 = COALESCE(
        NULLIF(btrim(telefono_principal_e164), ''),
        NULLIF(btrim(phone_e164), ''),
        NULLIF(btrim(phone), '')
    ),
    telefono_principal_tipo_linea = NULLIF(btrim(telefono_principal_tipo_linea), ''),
    telefono_principal_extension = NULLIF(btrim(telefono_principal_extension), ''),
    telefono_movil_1_e164 = COALESCE(
        NULLIF(btrim(telefono_movil_1_e164), ''),
        NULLIF(btrim(telefono_principal_e164), ''),
        NULLIF(btrim(phone_e164), ''),
        NULLIF(btrim(phone), '')
    ),
    telefono_movil_1_tipo_linea = NULLIF(btrim(telefono_movil_1_tipo_linea), ''),
    email = COALESCE(NULLIF(btrim(email), ''), NULLIF(btrim(correo_principal), '')),
    phone_e164 = COALESCE(NULLIF(btrim(phone_e164), ''), NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono_movil_1_e164), '')),
    phone = COALESCE(NULLIF(btrim(phone), ''), NULLIF(btrim(telefono_principal_e164), ''), NULLIF(btrim(telefono_movil_1_e164), ''));

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_correo_principal_idx
    ON public.prospeccion_prospectos (organizacion_id, lower(correo_principal))
    WHERE correo_principal IS NOT NULL AND btrim(correo_principal) <> '';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_correo_secundario_idx
    ON public.prospeccion_prospectos (organizacion_id, lower(correo_secundario))
    WHERE correo_secundario IS NOT NULL AND btrim(correo_secundario) <> '';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_telefono_principal_e164_idx
    ON public.prospeccion_prospectos (organizacion_id, telefono_principal_e164)
    WHERE telefono_principal_e164 IS NOT NULL AND btrim(telefono_principal_e164) <> '';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_telefono_movil_1_e164_idx
    ON public.prospeccion_prospectos (organizacion_id, telefono_movil_1_e164)
    WHERE telefono_movil_1_e164 IS NOT NULL AND btrim(telefono_movil_1_e164) <> '';

CREATE OR REPLACE FUNCTION public.tg_prospeccion_prospectos_sync_contact_methods()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.correo_principal := COALESCE(
        NULLIF(btrim(NEW.correo_principal), ''),
        NULLIF(btrim(NEW.email), '')
    );
    NEW.correo_secundario := NULLIF(btrim(NEW.correo_secundario), '');
    NEW.telefono_principal_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_principal_e164), ''),
        NULLIF(btrim(NEW.phone_e164), ''),
        NULLIF(btrim(NEW.phone), '')
    );
    NEW.telefono_principal_tipo_linea := NULLIF(btrim(NEW.telefono_principal_tipo_linea), '');
    NEW.telefono_principal_extension := NULLIF(btrim(NEW.telefono_principal_extension), '');
    NEW.telefono_movil_1_e164 := COALESCE(
        NULLIF(btrim(NEW.telefono_movil_1_e164), ''),
        NULLIF(btrim(NEW.telefono_principal_e164), ''),
        NULLIF(btrim(NEW.phone_e164), ''),
        NULLIF(btrim(NEW.phone), '')
    );
    NEW.telefono_movil_1_tipo_linea := NULLIF(btrim(NEW.telefono_movil_1_tipo_linea), '');
    NEW.email := COALESCE(NULLIF(btrim(NEW.email), ''), NEW.correo_principal);
    NEW.phone_e164 := COALESCE(NULLIF(btrim(NEW.phone_e164), ''), NEW.telefono_principal_e164, NEW.telefono_movil_1_e164);
    NEW.phone := COALESCE(NULLIF(btrim(NEW.phone), ''), NEW.telefono_principal_e164, NEW.telefono_movil_1_e164);
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 't_prospeccion_prospectos_sync_contact_methods'
    ) THEN
        EXECUTE $trigger$
            CREATE TRIGGER t_prospeccion_prospectos_sync_contact_methods
                BEFORE INSERT OR UPDATE OF email, phone, phone_e164, correo_principal, correo_secundario, telefono_principal_e164, telefono_principal_tipo_linea, telefono_principal_extension, telefono_movil_1_e164, telefono_movil_1_tipo_linea
                ON public.prospeccion_prospectos
                FOR EACH ROW
                EXECUTE FUNCTION public.tg_prospeccion_prospectos_sync_contact_methods()
        $trigger$;
    END IF;
END
$$;

COMMIT;
