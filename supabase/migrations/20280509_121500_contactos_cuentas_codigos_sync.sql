-- Auto-codes and legacy/new field sync for contactos + cuentas

BEGIN;

-- ============================================================
-- Helpers: codigo generators (org-scoped, collision-safe)
-- ============================================================
CREATE OR REPLACE FUNCTION public.gen_codigo_contacto(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
  v_try integer := 0;
BEGIN
  IF p_organizacion_id IS NULL THEN
    RETURN NULL;
  END IF;

  LOOP
    v_try := v_try + 1;
    v_code := 'CT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.contactos c
      WHERE c.organizacion_id = p_organizacion_id
        AND c.codigo_contacto = v_code
    );

    IF v_try >= 50 THEN
      RAISE EXCEPTION 'no_se_pudo_generar_codigo_contacto_unico';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.gen_codigo_cuenta(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
  v_try integer := 0;
BEGIN
  IF p_organizacion_id IS NULL THEN
    RETURN NULL;
  END IF;

  LOOP
    v_try := v_try + 1;
    v_code := 'AC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.cuentas c
      WHERE c.organizacion_id = p_organizacion_id
        AND c.codigo_cuenta = v_code
    );

    IF v_try >= 50 THEN
      RAISE EXCEPTION 'no_se_pudo_generar_codigo_cuenta_unico';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

-- ============================================================
-- Trigger: contactos sync + autocode
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_contactos_codigo_y_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_email text;
  v_correo text;
  v_old_email text;
  v_old_correo text;
  v_email_changed boolean := false;
  v_correo_changed boolean := false;
  v_resolved_email text;

  v_tel text;
  v_tel_e164 text;
  v_old_tel text;
  v_old_tel_e164 text;
  v_tel_changed boolean := false;
  v_tel_e164_changed boolean := false;
  v_resolved_tel text;

  v_notas text;
  v_notes text;
  v_old_notas text;
  v_old_notes text;
  v_notas_changed boolean := false;
  v_notes_changed boolean := false;
  v_resolved_notas text;
BEGIN
  -- Autocode
  IF COALESCE(NULLIF(btrim(NEW.codigo_contacto), ''), NULL) IS NULL THEN
    NEW.codigo_contacto := public.gen_codigo_contacto(NEW.organizacion_id);
  ELSE
    NEW.codigo_contacto := btrim(NEW.codigo_contacto);
  END IF;

  -- EMAIL <-> CORREO
  v_email := NULLIF(btrim(COALESCE(NEW.email, '')), '');
  v_correo := NULLIF(btrim(COALESCE(NEW.correo, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_email := NULLIF(btrim(COALESCE(OLD.email, '')), '');
    v_old_correo := NULLIF(btrim(COALESCE(OLD.correo, '')), '');
    v_email_changed := v_email IS DISTINCT FROM v_old_email;
    v_correo_changed := v_correo IS DISTINCT FROM v_old_correo;

    IF v_email_changed AND NOT v_correo_changed THEN
      v_resolved_email := v_email;
    ELSIF v_correo_changed AND NOT v_email_changed THEN
      v_resolved_email := v_correo;
    ELSIF v_email_changed AND v_correo_changed THEN
      v_resolved_email := COALESCE(v_email, v_correo);
    ELSE
      v_resolved_email := COALESCE(v_email, v_correo, v_old_email, v_old_correo);
    END IF;
  ELSE
    v_resolved_email := COALESCE(v_email, v_correo);
  END IF;

  NEW.email := v_resolved_email;
  NEW.correo := v_resolved_email;

  -- TELEFONO <-> TELEFONO_E164
  v_tel := NULLIF(btrim(COALESCE(NEW.telefono, '')), '');
  v_tel_e164 := NULLIF(btrim(COALESCE(NEW.telefono_e164, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_tel := NULLIF(btrim(COALESCE(OLD.telefono, '')), '');
    v_old_tel_e164 := NULLIF(btrim(COALESCE(OLD.telefono_e164, '')), '');
    v_tel_changed := v_tel IS DISTINCT FROM v_old_tel;
    v_tel_e164_changed := v_tel_e164 IS DISTINCT FROM v_old_tel_e164;

    IF v_tel_changed AND NOT v_tel_e164_changed THEN
      v_resolved_tel := v_tel;
    ELSIF v_tel_e164_changed AND NOT v_tel_changed THEN
      v_resolved_tel := v_tel_e164;
    ELSIF v_tel_changed AND v_tel_e164_changed THEN
      v_resolved_tel := COALESCE(v_tel_e164, v_tel);
    ELSE
      v_resolved_tel := COALESCE(v_tel_e164, v_tel, v_old_tel_e164, v_old_tel);
    END IF;
  ELSE
    v_resolved_tel := COALESCE(v_tel_e164, v_tel);
  END IF;

  NEW.telefono := v_resolved_tel;
  NEW.telefono_e164 := v_resolved_tel;

  -- NOTAS <-> NOTES
  v_notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');
  v_notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_notas := NULLIF(btrim(COALESCE(OLD.notas, '')), '');
    v_old_notes := NULLIF(btrim(COALESCE(OLD.notes, '')), '');
    v_notas_changed := v_notas IS DISTINCT FROM v_old_notas;
    v_notes_changed := v_notes IS DISTINCT FROM v_old_notes;

    IF v_notas_changed AND NOT v_notes_changed THEN
      v_resolved_notas := v_notas;
    ELSIF v_notes_changed AND NOT v_notas_changed THEN
      v_resolved_notas := v_notes;
    ELSIF v_notas_changed AND v_notes_changed THEN
      v_resolved_notas := COALESCE(v_notas, v_notes);
    ELSE
      v_resolved_notas := COALESCE(v_notas, v_notes, v_old_notas, v_old_notes);
    END IF;
  ELSE
    v_resolved_notas := COALESCE(v_notas, v_notes);
  END IF;

  NEW.notas := v_resolved_notas;
  NEW.notes := v_resolved_notas;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_contactos_codigo_y_sync ON public.contactos;
CREATE TRIGGER tr_contactos_codigo_y_sync
BEFORE INSERT OR UPDATE ON public.contactos
FOR EACH ROW
EXECUTE FUNCTION public.tg_contactos_codigo_y_sync();

-- ============================================================
-- Trigger: cuentas sync + autocode
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_cuentas_codigo_y_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_email text;
  v_correo text;
  v_old_email text;
  v_old_correo text;
  v_email_changed boolean := false;
  v_correo_changed boolean := false;
  v_resolved_email text;

  v_web text;
  v_sitio text;
  v_old_web text;
  v_old_sitio text;
  v_web_changed boolean := false;
  v_sitio_changed boolean := false;
  v_resolved_web text;

  v_tipo_industria text;
  v_industria text;
  v_old_tipo_industria text;
  v_old_industria text;
  v_tipo_industria_changed boolean := false;
  v_industria_changed boolean := false;
  v_resolved_industria text;
BEGIN
  -- Autocode
  IF COALESCE(NULLIF(btrim(NEW.codigo_cuenta), ''), NULL) IS NULL THEN
    NEW.codigo_cuenta := public.gen_codigo_cuenta(NEW.organizacion_id);
  ELSE
    NEW.codigo_cuenta := btrim(NEW.codigo_cuenta);
  END IF;

  -- EMAIL <-> CORREO
  v_email := NULLIF(btrim(COALESCE(NEW.email, '')), '');
  v_correo := NULLIF(btrim(COALESCE(NEW.correo, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_email := NULLIF(btrim(COALESCE(OLD.email, '')), '');
    v_old_correo := NULLIF(btrim(COALESCE(OLD.correo, '')), '');
    v_email_changed := v_email IS DISTINCT FROM v_old_email;
    v_correo_changed := v_correo IS DISTINCT FROM v_old_correo;

    IF v_email_changed AND NOT v_correo_changed THEN
      v_resolved_email := v_email;
    ELSIF v_correo_changed AND NOT v_email_changed THEN
      v_resolved_email := v_correo;
    ELSIF v_email_changed AND v_correo_changed THEN
      v_resolved_email := COALESCE(v_email, v_correo);
    ELSE
      v_resolved_email := COALESCE(v_email, v_correo, v_old_email, v_old_correo);
    END IF;
  ELSE
    v_resolved_email := COALESCE(v_email, v_correo);
  END IF;

  NEW.email := v_resolved_email;
  NEW.correo := v_resolved_email;

  -- WEBSITE <-> SITIO_WEB
  v_web := NULLIF(btrim(COALESCE(NEW.website, '')), '');
  v_sitio := NULLIF(btrim(COALESCE(NEW.sitio_web, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_web := NULLIF(btrim(COALESCE(OLD.website, '')), '');
    v_old_sitio := NULLIF(btrim(COALESCE(OLD.sitio_web, '')), '');
    v_web_changed := v_web IS DISTINCT FROM v_old_web;
    v_sitio_changed := v_sitio IS DISTINCT FROM v_old_sitio;

    IF v_web_changed AND NOT v_sitio_changed THEN
      v_resolved_web := v_web;
    ELSIF v_sitio_changed AND NOT v_web_changed THEN
      v_resolved_web := v_sitio;
    ELSIF v_web_changed AND v_sitio_changed THEN
      v_resolved_web := COALESCE(v_web, v_sitio);
    ELSE
      v_resolved_web := COALESCE(v_web, v_sitio, v_old_web, v_old_sitio);
    END IF;
  ELSE
    v_resolved_web := COALESCE(v_web, v_sitio);
  END IF;

  NEW.website := v_resolved_web;
  NEW.sitio_web := v_resolved_web;

  -- TIPO_INDUSTRIA <-> INDUSTRIA
  v_tipo_industria := NULLIF(btrim(COALESCE(NEW.tipo_industria, '')), '');
  v_industria := NULLIF(btrim(COALESCE(NEW.industria, '')), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_tipo_industria := NULLIF(btrim(COALESCE(OLD.tipo_industria, '')), '');
    v_old_industria := NULLIF(btrim(COALESCE(OLD.industria, '')), '');
    v_tipo_industria_changed := v_tipo_industria IS DISTINCT FROM v_old_tipo_industria;
    v_industria_changed := v_industria IS DISTINCT FROM v_old_industria;

    IF v_tipo_industria_changed AND NOT v_industria_changed THEN
      v_resolved_industria := v_tipo_industria;
    ELSIF v_industria_changed AND NOT v_tipo_industria_changed THEN
      v_resolved_industria := v_industria;
    ELSIF v_tipo_industria_changed AND v_industria_changed THEN
      v_resolved_industria := COALESCE(v_tipo_industria, v_industria);
    ELSE
      v_resolved_industria := COALESCE(v_tipo_industria, v_industria, v_old_tipo_industria, v_old_industria);
    END IF;
  ELSE
    v_resolved_industria := COALESCE(v_tipo_industria, v_industria);
  END IF;

  NEW.tipo_industria := v_resolved_industria;
  NEW.industria := v_resolved_industria;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_cuentas_codigo_y_sync ON public.cuentas;
CREATE TRIGGER tr_cuentas_codigo_y_sync
BEFORE INSERT OR UPDATE ON public.cuentas
FOR EACH ROW
EXECUTE FUNCTION public.tg_cuentas_codigo_y_sync();

-- ============================================================
-- Backfill existing rows (one-time normalization)
-- ============================================================
UPDATE public.contactos c
SET
  codigo_contacto = COALESCE(NULLIF(btrim(c.codigo_contacto), ''), public.gen_codigo_contacto(c.organizacion_id)),
  email = COALESCE(NULLIF(btrim(c.email), ''), NULLIF(btrim(c.correo), '')),
  correo = COALESCE(NULLIF(btrim(c.correo), ''), NULLIF(btrim(c.email), '')),
  telefono = COALESCE(NULLIF(btrim(c.telefono), ''), NULLIF(btrim(c.telefono_e164), '')),
  telefono_e164 = COALESCE(NULLIF(btrim(c.telefono_e164), ''), NULLIF(btrim(c.telefono), '')),
  notas = COALESCE(NULLIF(btrim(c.notas), ''), NULLIF(btrim(c.notes), '')),
  notes = COALESCE(NULLIF(btrim(c.notes), ''), NULLIF(btrim(c.notas), ''))
WHERE
  COALESCE(NULLIF(btrim(c.codigo_contacto), ''), NULL) IS NULL
  OR (
    (COALESCE(NULLIF(btrim(c.email), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(c.correo), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(c.correo), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(c.email), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(c.telefono), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(c.telefono_e164), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(c.telefono_e164), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(c.telefono), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(c.notas), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(c.notes), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(c.notes), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(c.notas), ''), NULL) IS NOT NULL)
  );

UPDATE public.cuentas a
SET
  codigo_cuenta = COALESCE(NULLIF(btrim(a.codigo_cuenta), ''), public.gen_codigo_cuenta(a.organizacion_id)),
  email = COALESCE(NULLIF(btrim(a.email), ''), NULLIF(btrim(a.correo), '')),
  correo = COALESCE(NULLIF(btrim(a.correo), ''), NULLIF(btrim(a.email), '')),
  website = COALESCE(NULLIF(btrim(a.website), ''), NULLIF(btrim(a.sitio_web), '')),
  sitio_web = COALESCE(NULLIF(btrim(a.sitio_web), ''), NULLIF(btrim(a.website), '')),
  tipo_industria = COALESCE(NULLIF(btrim(a.tipo_industria), ''), NULLIF(btrim(a.industria), '')),
  industria = COALESCE(NULLIF(btrim(a.industria), ''), NULLIF(btrim(a.tipo_industria), ''))
WHERE
  COALESCE(NULLIF(btrim(a.codigo_cuenta), ''), NULL) IS NULL
  OR (
    (COALESCE(NULLIF(btrim(a.email), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(a.correo), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(a.correo), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(a.email), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(a.website), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(a.sitio_web), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(a.sitio_web), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(a.website), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(a.tipo_industria), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(a.industria), ''), NULL) IS NOT NULL)
    OR (COALESCE(NULLIF(btrim(a.industria), ''), NULL) IS NULL AND COALESCE(NULLIF(btrim(a.tipo_industria), ''), NULL) IS NOT NULL)
  );

COMMIT;
