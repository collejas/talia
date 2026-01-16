BEGIN;

ALTER TABLE public.propiedad_unidades
    ADD COLUMN IF NOT EXISTS desarrollo_id uuid REFERENCES public.propiedad_desarrollos(id),
    ADD COLUMN IF NOT EXISTS tipo_id uuid REFERENCES public.propiedad_tipos(id),
    ADD COLUMN IF NOT EXISTS nombre text NOT NULL DEFAULT 'Unidad',
    ADD COLUMN IF NOT EXISTS descripcion text,
    ADD COLUMN IF NOT EXISTS linea_id uuid REFERENCES public.lineas_de_negocio(id),
    ADD COLUMN IF NOT EXISTS familia_id uuid REFERENCES public.familias_productos(id),
    ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES public.modelos_productos(id);

CREATE INDEX IF NOT EXISTS ix_propiedad_unidades_tipo ON public.propiedad_unidades (tipo_id);
CREATE INDEX IF NOT EXISTS ix_propiedad_unidades_linea ON public.propiedad_unidades (linea_id);
CREATE INDEX IF NOT EXISTS ix_propiedad_unidades_familia ON public.propiedad_unidades (familia_id);
CREATE INDEX IF NOT EXISTS ix_propiedad_unidades_modelo ON public.propiedad_unidades (modelo_id);
CREATE INDEX IF NOT EXISTS ix_propiedad_unidades_desarrollo ON public.propiedad_unidades (desarrollo_id);

ALTER TABLE public.propiedad_unidades ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.propiedad_unidades.tipo_id IS 'Tipo comercial que describe la unidad, antes en propiedades';
COMMENT ON COLUMN public.propiedad_unidades.linea_id IS 'Linea de negocio asociada';
COMMENT ON COLUMN public.propiedad_unidades.familia_id IS 'Familia comercial';
COMMENT ON COLUMN public.propiedad_unidades.modelo_id IS 'Modelo/prototipo';

COMMIT;
