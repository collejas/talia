BEGIN;

-- ============================================================================
-- Alineación de tipos de direcciones de cuenta
-- ============================================================================
--
-- Objetivo:
-- - dejar de depender de `operativa` como tipo canónico
-- - materializar `principal` como el valor real en almacenamiento
-- - conservar compatibilidad histórica donde haga falta

UPDATE public.cuenta_direcciones
SET tipo_relacion = 'principal'
WHERE tipo_relacion = 'operativa';

UPDATE public.direcciones
SET tipo = 'principal'
WHERE tipo = 'operativa';

ALTER TABLE public.cuenta_direcciones
    DROP CONSTRAINT IF EXISTS cuenta_direcciones_tipo_chk;

ALTER TABLE public.cuenta_direcciones
    ADD CONSTRAINT cuenta_direcciones_tipo_chk
    CHECK (tipo_relacion IN ('fiscal', 'principal', 'sucursal'));

ALTER TABLE public.direcciones
    DROP CONSTRAINT IF EXISTS direcciones_tipo_chk;

ALTER TABLE public.direcciones
    ADD CONSTRAINT direcciones_tipo_chk
    CHECK (tipo IN ('fiscal', 'principal', 'operativa', 'facturacion', 'envio', 'sucursal', 'personal', 'otro'));

COMMIT;
