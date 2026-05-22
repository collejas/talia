BEGIN;

CREATE OR REPLACE FUNCTION public.gen_codigo_cuenta_por_tipo(p_organizacion_id uuid, p_tipo text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_next bigint;
  v_tipo_norm text;
BEGIN
  IF p_organizacion_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_tipo_norm := lower(btrim(COALESCE(p_tipo, '')));
  IF v_tipo_norm IN ('persona_fisica_actividad_empresarial', 'pfae') THEN
    v_prefix := 'PFAE-';
  ELSE
    v_prefix := 'Emp-';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cuentas_codigo_' || p_organizacion_id::text || '_' || v_prefix));

  IF v_prefix = 'PFAE-' THEN
    SELECT COALESCE(MAX(substring(c.codigo_cuenta FROM '^PFAE-([0-9]+)$')::bigint), 0) + 1
      INTO v_next
    FROM public.cuentas c
    WHERE c.organizacion_id = p_organizacion_id
      AND c.codigo_cuenta ~ '^PFAE-[0-9]+$';
  ELSE
    SELECT COALESCE(MAX(substring(c.codigo_cuenta FROM '^Emp-([0-9]+)$')::bigint), 0) + 1
      INTO v_next
    FROM public.cuentas c
    WHERE c.organizacion_id = p_organizacion_id
      AND c.codigo_cuenta ~ '^Emp-[0-9]+$';
  END IF;

  RETURN v_prefix || v_next::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.gen_codigo_cuenta(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.gen_codigo_cuenta_por_tipo(p_organizacion_id, NULL);
END;
$$;

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
  v_tipo_codigo text;
BEGIN
  v_tipo_codigo := COALESCE(NULLIF(btrim(NEW.tipo), ''), NULLIF(btrim(COALESCE(OLD.tipo, '')), ''));
  IF COALESCE(NULLIF(btrim(NEW.codigo_cuenta), ''), NULL) IS NULL THEN
    NEW.codigo_cuenta := public.gen_codigo_cuenta_por_tipo(NEW.organizacion_id, v_tipo_codigo);
  ELSE
    NEW.codigo_cuenta := btrim(NEW.codigo_cuenta);
  END IF;

  IF NEW.fecha_incorporacion IS NULL THEN
    NEW.fecha_incorporacion := now();
  END IF;

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

UPDATE public.cuentas a
SET codigo_cuenta = public.gen_codigo_cuenta_por_tipo(a.organizacion_id, a.tipo)
WHERE a.codigo_cuenta IS NULL OR btrim(a.codigo_cuenta) = '';

ALTER FUNCTION public.gen_codigo_cuenta_por_tipo(uuid, text) SET search_path TO public;
ALTER FUNCTION public.gen_codigo_cuenta(uuid) SET search_path TO public;
ALTER FUNCTION public.tg_cuentas_codigo_y_sync() SET search_path TO public;

COMMIT;
