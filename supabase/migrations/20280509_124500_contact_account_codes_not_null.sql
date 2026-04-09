BEGIN;

-- Repara nulos o formatos incorrectos antes de endurecer constraints.
UPDATE public.contactos c
SET codigo_contacto = public.gen_codigo_contacto(c.organizacion_id)
WHERE c.codigo_contacto IS NULL
   OR btrim(c.codigo_contacto) = ''
   OR c.codigo_contacto !~ '^Con[0-9]+$';

UPDATE public.cuentas a
SET codigo_cuenta = public.gen_codigo_cuenta(a.organizacion_id)
WHERE a.codigo_cuenta IS NULL
   OR btrim(a.codigo_cuenta) = ''
   OR a.codigo_cuenta !~ '^Emp[0-9]+$';

-- Reforzar no nulo.
ALTER TABLE public.contactos
  ALTER COLUMN codigo_contacto SET NOT NULL;

ALTER TABLE public.cuentas
  ALTER COLUMN codigo_cuenta SET NOT NULL;

-- Reforzar formato.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contactos_codigo_contacto_formato_chk'
      AND conrelid = 'public.contactos'::regclass
  ) THEN
    ALTER TABLE public.contactos
      ADD CONSTRAINT contactos_codigo_contacto_formato_chk
      CHECK (codigo_contacto ~ '^Con[0-9]+$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cuentas_codigo_cuenta_formato_chk'
      AND conrelid = 'public.cuentas'::regclass
  ) THEN
    ALTER TABLE public.cuentas
      ADD CONSTRAINT cuentas_codigo_cuenta_formato_chk
      CHECK (codigo_cuenta ~ '^Emp[0-9]+$');
  END IF;
END $$;

COMMIT;
