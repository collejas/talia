BEGIN;

-- Manzana es un nivel geográfico/comercial válido entre macrolote y unidad.
ALTER TABLE public.propiedad_poligonos
    DROP CONSTRAINT IF EXISTS propiedad_poligonos_target_type_check;

ALTER TABLE public.propiedad_poligonos
    ADD CONSTRAINT propiedad_poligonos_target_type_check
    CHECK (target_type IN ('desarrollo', 'capa', 'manzana', 'unidad', 'mix'));

COMMIT;
