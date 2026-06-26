BEGIN;

CREATE INDEX IF NOT EXISTS personas_org_correo_principal_norm_idx
    ON public.personas (organizacion_id, lower(btrim(correo_principal)))
    WHERE correo_principal IS NOT NULL AND btrim(correo_principal) <> ''
      AND archived_at IS NULL
      AND merged_into_persona_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE INDEX IF NOT EXISTS personas_org_correo_secundario_norm_idx
    ON public.personas (organizacion_id, lower(btrim(correo_secundario)))
    WHERE correo_secundario IS NOT NULL AND btrim(correo_secundario) <> ''
      AND archived_at IS NULL
      AND merged_into_persona_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE INDEX IF NOT EXISTS personas_org_telefono_principal_norm_idx
    ON public.personas (organizacion_id, regexp_replace(btrim(telefono_principal_e164), '\D', '', 'g'))
    WHERE telefono_principal_e164 IS NOT NULL AND btrim(telefono_principal_e164) <> ''
      AND archived_at IS NULL
      AND merged_into_persona_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE INDEX IF NOT EXISTS personas_org_telefono_secundario_norm_idx
    ON public.personas (organizacion_id, regexp_replace(btrim(telefono_secundario_e164), '\D', '', 'g'))
    WHERE telefono_secundario_e164 IS NOT NULL AND btrim(telefono_secundario_e164) <> ''
      AND archived_at IS NULL
      AND merged_into_persona_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE INDEX IF NOT EXISTS cuentas_org_correo_principal_norm_idx
    ON public.cuentas (organizacion_id, lower(btrim(correo_principal)))
    WHERE correo_principal IS NOT NULL AND btrim(correo_principal) <> ''
      AND archived_at IS NULL
      AND merged_into_cuenta_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE INDEX IF NOT EXISTS cuentas_org_correo_secundario_norm_idx
    ON public.cuentas (organizacion_id, lower(btrim(correo_secundario)))
    WHERE correo_secundario IS NOT NULL AND btrim(correo_secundario) <> ''
      AND archived_at IS NULL
      AND merged_into_cuenta_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE INDEX IF NOT EXISTS cuentas_org_telefono_principal_norm_idx
    ON public.cuentas (organizacion_id, regexp_replace(btrim(telefono_principal_e164), '\D', '', 'g'))
    WHERE telefono_principal_e164 IS NOT NULL AND btrim(telefono_principal_e164) <> ''
      AND archived_at IS NULL
      AND merged_into_cuenta_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE INDEX IF NOT EXISTS cuentas_org_telefono_secundario_norm_idx
    ON public.cuentas (organizacion_id, regexp_replace(btrim(telefono_secundario_e164), '\D', '', 'g'))
    WHERE telefono_secundario_e164 IS NOT NULL AND btrim(telefono_secundario_e164) <> ''
      AND archived_at IS NULL
      AND merged_into_cuenta_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE INDEX IF NOT EXISTS cuentas_org_rfc_norm_idx
    ON public.cuentas (organizacion_id, upper(btrim(rfc)))
    WHERE rfc IS NOT NULL AND btrim(rfc) <> ''
      AND archived_at IS NULL
      AND merged_into_cuenta_id IS NULL
      AND COALESCE(estado, '') <> 'fusionado';

CREATE OR REPLACE FUNCTION public.tg_personas_reject_duplicate_contact_methods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_email_principal text;
    v_new_email_secundario text;
    v_new_email_institucional text;
    v_new_email_personal_3 text;
    v_new_phone_principal text;
    v_new_phone_secundario text;
    v_new_phone_empresa_1 text;
    v_new_phone_empresa_2 text;
    v_conflict_id uuid;
BEGIN
    v_new_email_principal := NULLIF(lower(btrim(NEW.correo_principal)), '');
    v_new_email_secundario := NULLIF(lower(btrim(NEW.correo_secundario)), '');
    v_new_email_institucional := NULLIF(lower(btrim(NEW.correo_institucional)), '');
    v_new_email_personal_3 := NULLIF(lower(btrim(NEW.correo_personal_3)), '');
    v_new_phone_principal := NULLIF(regexp_replace(btrim(COALESCE(NEW.telefono_principal_e164, NEW.telefono_movil_1_e164)), '\D', '', 'g'), '');
    v_new_phone_secundario := NULLIF(regexp_replace(btrim(COALESCE(NEW.telefono_secundario_e164, NEW.telefono_movil_2_e164)), '\D', '', 'g'), '');
    v_new_phone_empresa_1 := NULLIF(regexp_replace(btrim(NEW.telefono_empresa_1_e164), '\D', '', 'g'), '');
    v_new_phone_empresa_2 := NULLIF(regexp_replace(btrim(NEW.telefono_empresa_2_e164), '\D', '', 'g'), '');

    IF NEW.archived_at IS NOT NULL
       OR NEW.merged_into_persona_id IS NOT NULL
       OR COALESCE(NEW.estado, '') = 'fusionado' THEN
        RETURN NEW;
    END IF;

    SELECT p.id
      INTO v_conflict_id
      FROM public.personas p
     WHERE p.organizacion_id = NEW.organizacion_id
       AND (NEW.id IS NULL OR p.id <> NEW.id)
       AND p.archived_at IS NULL
       AND p.merged_into_persona_id IS NULL
       AND COALESCE(p.estado, '') <> 'fusionado'
       AND (
            (v_new_email_principal IS NOT NULL AND NULLIF(lower(btrim(p.correo_principal)), '') = v_new_email_principal)
         OR (v_new_email_secundario IS NOT NULL AND NULLIF(lower(btrim(p.correo_secundario)), '') = v_new_email_secundario)
         OR (v_new_email_institucional IS NOT NULL AND NULLIF(lower(btrim(p.correo_institucional)), '') = v_new_email_institucional)
         OR (v_new_email_personal_3 IS NOT NULL AND NULLIF(lower(btrim(p.correo_personal_3)), '') = v_new_email_personal_3)
         OR (v_new_phone_principal IS NOT NULL AND NULLIF(regexp_replace(btrim(COALESCE(p.telefono_principal_e164, p.telefono_movil_1_e164)), '\D', '', 'g'), '') = v_new_phone_principal)
         OR (v_new_phone_secundario IS NOT NULL AND NULLIF(regexp_replace(btrim(COALESCE(p.telefono_secundario_e164, p.telefono_movil_2_e164)), '\D', '', 'g'), '') = v_new_phone_secundario)
         OR (v_new_phone_empresa_1 IS NOT NULL AND NULLIF(regexp_replace(btrim(p.telefono_empresa_1_e164), '\D', '', 'g'), '') = v_new_phone_empresa_1)
         OR (v_new_phone_empresa_2 IS NOT NULL AND NULLIF(regexp_replace(btrim(p.telefono_empresa_2_e164), '\D', '', 'g'), '') = v_new_phone_empresa_2)
       )
     LIMIT 1;

    IF v_conflict_id IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_contact_method'
            USING ERRCODE = '23505';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cuentas_reject_duplicate_contact_methods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_email_principal text;
    v_new_email_secundario text;
    v_new_email_alt text;
    v_new_phone_principal text;
    v_new_phone_secundario text;
    v_new_rfc text;
    v_conflict_id uuid;
BEGIN
    v_new_email_principal := NULLIF(lower(btrim(NEW.correo_principal)), '');
    v_new_email_secundario := NULLIF(lower(btrim(NEW.correo_secundario)), '');
    v_new_email_alt := NULLIF(lower(btrim(COALESCE(NEW.correo, NEW.email))), '');
    v_new_phone_principal := NULLIF(regexp_replace(btrim(COALESCE(NEW.telefono_principal_e164, NEW.telefono)), '\D', '', 'g'), '');
    v_new_phone_secundario := NULLIF(regexp_replace(btrim(NEW.telefono_secundario_e164), '\D', '', 'g'), '');
    v_new_rfc := NULLIF(upper(btrim(NEW.rfc)), '');

    IF NEW.archived_at IS NOT NULL
       OR NEW.merged_into_cuenta_id IS NOT NULL
       OR COALESCE(NEW.estado, '') = 'fusionado' THEN
        RETURN NEW;
    END IF;

    SELECT c.id
      INTO v_conflict_id
      FROM public.cuentas c
     WHERE c.organizacion_id = NEW.organizacion_id
       AND (NEW.id IS NULL OR c.id <> NEW.id)
       AND c.archived_at IS NULL
       AND c.merged_into_cuenta_id IS NULL
       AND COALESCE(c.estado, '') <> 'fusionado'
       AND (
            (v_new_rfc IS NOT NULL AND NULLIF(upper(btrim(c.rfc)), '') = v_new_rfc)
         OR (v_new_email_principal IS NOT NULL AND NULLIF(lower(btrim(c.correo_principal)), '') = v_new_email_principal)
         OR (v_new_email_secundario IS NOT NULL AND NULLIF(lower(btrim(c.correo_secundario)), '') = v_new_email_secundario)
         OR (v_new_email_alt IS NOT NULL AND (
                NULLIF(lower(btrim(c.correo)), '') = v_new_email_alt
             OR NULLIF(lower(btrim(c.email)), '') = v_new_email_alt
         ))
         OR (v_new_phone_principal IS NOT NULL AND NULLIF(regexp_replace(btrim(COALESCE(c.telefono_principal_e164, c.telefono)), '\D', '', 'g'), '') = v_new_phone_principal)
         OR (v_new_phone_secundario IS NOT NULL AND NULLIF(regexp_replace(btrim(c.telefono_secundario_e164), '\D', '', 'g'), '') = v_new_phone_secundario)
       )
     LIMIT 1;

    IF v_conflict_id IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_account_detected'
            USING ERRCODE = '23505';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS personas_reject_duplicate_contact_methods ON public.personas;
CREATE TRIGGER personas_reject_duplicate_contact_methods
    BEFORE INSERT OR UPDATE ON public.personas
    FOR EACH ROW EXECUTE FUNCTION public.tg_personas_reject_duplicate_contact_methods();

DROP TRIGGER IF EXISTS cuentas_reject_duplicate_contact_methods ON public.cuentas;
CREATE TRIGGER cuentas_reject_duplicate_contact_methods
    BEFORE INSERT OR UPDATE ON public.cuentas
    FOR EACH ROW EXECUTE FUNCTION public.tg_cuentas_reject_duplicate_contact_methods();

COMMENT ON FUNCTION public.tg_personas_reject_duplicate_contact_methods()
    IS 'Evita duplicados activos de contactos por correo y teléfono normalizados.';

COMMENT ON FUNCTION public.tg_cuentas_reject_duplicate_contact_methods()
    IS 'Evita duplicados activos de cuentas por correo, teléfono y RFC normalizados.';

COMMIT;
