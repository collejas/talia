BEGIN;

ALTER TYPE public.propiedad_status ADD VALUE IF NOT EXISTS 'bloqueado';

ALTER TABLE public.propiedad_unidades
    ADD COLUMN IF NOT EXISTS destino_inventario text NOT NULL DEFAULT 'comercial',
    ADD COLUMN IF NOT EXISTS precio_tipo text NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS precio_m2 numeric;

UPDATE public.propiedad_unidades
SET destino_inventario = COALESCE(NULLIF(destino_inventario, ''), 'comercial'),
    precio_tipo = COALESCE(NULLIF(precio_tipo, ''), 'manual')
WHERE destino_inventario IS NULL
   OR destino_inventario = ''
   OR precio_tipo IS NULL
   OR precio_tipo = '';

ALTER TABLE public.propiedad_unidades
    DROP CONSTRAINT IF EXISTS propiedad_unidades_destino_inventario_chk;

ALTER TABLE public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_destino_inventario_chk
    CHECK (destino_inventario IN ('comercial', 'patrimonial'));

ALTER TABLE public.propiedad_unidades
    DROP CONSTRAINT IF EXISTS propiedad_unidades_precio_tipo_chk;

ALTER TABLE public.propiedad_unidades
    ADD CONSTRAINT propiedad_unidades_precio_tipo_chk
    CHECK (precio_tipo IN ('manual', 'm2'));

COMMENT ON COLUMN public.propiedad_unidades.destino_inventario IS 'Clasificacion interna del inventario: comercial o patrimonial.';
COMMENT ON COLUMN public.propiedad_unidades.precio_tipo IS 'Forma de captura del precio: manual o por metro cuadrado.';
COMMENT ON COLUMN public.propiedad_unidades.precio_m2 IS 'Precio por metro cuadrado cuando la captura se hace por m2.';

COMMIT;
