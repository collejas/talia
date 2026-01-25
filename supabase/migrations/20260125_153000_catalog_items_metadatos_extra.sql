BEGIN;

ALTER TABLE public.catalog_items
    ADD COLUMN IF NOT EXISTS metadatos_extra jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.catalog_items.metadatos_extra IS 'Metadatos volumétricos y específicos de unidad que no deben mezclarse con el catálogo principal.';

COMMIT;
