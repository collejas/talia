BEGIN;

CREATE OR REPLACE FUNCTION public.gen_codigo_contacto_legacy(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF p_organizacion_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('contactos_codigo_' || p_organizacion_id::text));

  SELECT COALESCE(MAX(substring(c.codigo_contacto FROM '^Con([0-9]+)$')::bigint), 0) + 1
    INTO v_next
  FROM public.contactos c
  WHERE c.organizacion_id = p_organizacion_id
    AND c.codigo_contacto ~ '^Con[0-9]+$';

  RETURN 'Con' || v_next::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_contactos_codigo_legacy_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
    IF NEW.organizacion_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NULLIF(btrim(COALESCE(NEW.codigo_contacto, '')), '') IS NULL
       OR NEW.codigo_contacto !~ '^Con[0-9]+$' THEN
        NEW.codigo_contacto := public.gen_codigo_contacto_legacy(NEW.organizacion_id);
    ELSE
        NEW.codigo_contacto := btrim(NEW.codigo_contacto);
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.gen_codigo_contacto_legacy(uuid)
IS 'Genera el consecutivo legacy ConN para public.contactos por organizacion.';

COMMENT ON FUNCTION public.tg_contactos_codigo_legacy_guard()
IS 'Garantiza codigo_contacto legacy valido en public.contactos usando el consecutivo oficial ConN por organizacion.';

COMMIT;
