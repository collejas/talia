BEGIN;

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS codigo_contacto text;

CREATE OR REPLACE FUNCTION public.gen_codigo_contacto(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF p_organizacion_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('personas_codigo_' || p_organizacion_id::text));

  SELECT COALESCE(MAX(substring(p.codigo_contacto FROM '^Cont-([0-9]+)$')::bigint), 0) + 1
    INTO v_next
  FROM public.personas p
  WHERE p.organizacion_id = p_organizacion_id
    AND p.codigo_contacto ~ '^Cont-[0-9]+$';

  RETURN 'Cont-' || v_next::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_personas_codigo_contacto_auto()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NULLIF(btrim(NEW.codigo_contacto), ''), NULL) IS NULL THEN
      NEW.codigo_contacto := public.gen_codigo_contacto(NEW.organizacion_id);
    ELSE
      NEW.codigo_contacto := btrim(NEW.codigo_contacto);
    END IF;
  ELSE
    NEW.codigo_contacto := OLD.codigo_contacto;
  END IF;

  NEW.metadata := jsonb_set(
    COALESCE(NEW.metadata, '{}'::jsonb),
    '{legacy_contacto_codigo}',
    to_jsonb(NEW.codigo_contacto),
    true
  );
  RETURN NEW;
END;
$$;

WITH ranked AS (
  SELECT
    p.id,
    p.organizacion_id,
    row_number() OVER (
      PARTITION BY p.organizacion_id
      ORDER BY COALESCE(p.creado_en, p.actualizado_en, now()), p.id
    ) AS seq
  FROM public.personas p
),
assigned AS (
  SELECT
    r.id,
    'Cont-' || r.seq::text AS new_code
  FROM ranked r
)
UPDATE public.personas p
SET
  codigo_contacto = assigned.new_code,
  metadata = jsonb_set(
    COALESCE(p.metadata, '{}'::jsonb),
    '{legacy_contacto_codigo}',
    to_jsonb(assigned.new_code),
    true
  )
FROM assigned
WHERE assigned.id = p.id;

ALTER TABLE public.personas
  ALTER COLUMN codigo_contacto SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS personas_org_codigo_contacto_uidx
  ON public.personas (organizacion_id, codigo_contacto)
  WHERE codigo_contacto IS NOT NULL AND btrim(codigo_contacto) <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'personas_codigo_contacto_formato_chk'
      AND conrelid = 'public.personas'::regclass
  ) THEN
    ALTER TABLE public.personas
      ADD CONSTRAINT personas_codigo_contacto_formato_chk
      CHECK (codigo_contacto ~ '^Cont-[0-9]+$');
  END IF;
END $$;

DROP TRIGGER IF EXISTS personas_codigo_contacto_auto ON public.personas;
CREATE TRIGGER personas_codigo_contacto_auto
BEFORE INSERT OR UPDATE OF codigo_contacto, metadata ON public.personas
FOR EACH ROW
EXECUTE FUNCTION public.tg_personas_codigo_contacto_auto();

ALTER FUNCTION public.gen_codigo_contacto(uuid) SET search_path TO public;
ALTER FUNCTION public.tg_personas_codigo_contacto_auto() SET search_path TO public;

COMMIT;
