ALTER TABLE public.catalog_items
    ADD COLUMN IF NOT EXISTS linea_id uuid REFERENCES public.lineas_de_negocio(id),
    ADD COLUMN IF NOT EXISTS familia_id uuid REFERENCES public.familias_productos(id),
    ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES public.modelos_productos(id);

CREATE INDEX IF NOT EXISTS catalog_items_linea_idx
    ON public.catalog_items (linea_id);

CREATE INDEX IF NOT EXISTS catalog_items_familia_idx
    ON public.catalog_items (familia_id);

CREATE INDEX IF NOT EXISTS catalog_items_modelo_idx
    ON public.catalog_items (modelo_id);
