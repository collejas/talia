ALTER TABLE public.catalog_items
    ADD COLUMN IF NOT EXISTS metadata jsonb GENERATED ALWAYS AS (COALESCE(metadatos, '{}'::jsonb)) STORED;

COMMENT ON COLUMN public.catalog_items.metadata IS 'Alias legible para compatibilidad con triggers que esperan la columna metadata.';
