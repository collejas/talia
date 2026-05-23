BEGIN;

ALTER TABLE public.cuentas
  DROP CONSTRAINT IF EXISTS cuentas_codigo_cuenta_formato_chk;

UPDATE public.cuentas
SET codigo_cuenta = regexp_replace(codigo_cuenta, '^(Emp|PFAE)([0-9]+)$', '\1-\2')
WHERE codigo_cuenta ~ '^(Emp|PFAE)[0-9]+$';

ALTER TABLE public.cuentas
  ADD CONSTRAINT cuentas_codigo_cuenta_formato_chk
  CHECK (codigo_cuenta ~ '^(Emp|PFAE)-[0-9]+$');

COMMIT;
