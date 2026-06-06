BEGIN;

ALTER TABLE public.catalog_items
    ADD COLUMN IF NOT EXISTS descripcion text;

COMMENT ON COLUMN public.catalog_items.descripcion IS 'Descripción principal del producto o servicio.';

UPDATE public.catalog_items
SET descripcion = COALESCE(descripcion, descripcion_corta, descripcion_larga)
WHERE descripcion IS NULL
  AND (descripcion_corta IS NOT NULL OR descripcion_larga IS NOT NULL);

COMMIT;
