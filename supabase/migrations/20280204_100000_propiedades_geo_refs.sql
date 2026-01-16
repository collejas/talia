BEGIN;

ALTER TABLE public.propiedades
    ADD COLUMN IF NOT EXISTS pais_codigo text NOT NULL DEFAULT 'MX',
    ADD COLUMN IF NOT EXISTS estado_cve char(2),
    ADD COLUMN IF NOT EXISTS municipio_cve char(3),
    ADD COLUMN IF NOT EXISTS codigo_postal text,
    ADD COLUMN IF NOT EXISTS colonia text,
    ADD COLUMN IF NOT EXISTS linea_id uuid REFERENCES public.lineas_de_negocio(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS familia_id uuid REFERENCES public.familias_productos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES public.modelos_productos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_propiedades_estado_cve
    ON public.propiedades (organizacion_id, estado_cve);
CREATE INDEX IF NOT EXISTS ix_propiedades_municipio_cve
    ON public.propiedades (organizacion_id, municipio_cve);
CREATE INDEX IF NOT EXISTS ix_propiedades_codigo_postal
    ON public.propiedades (organizacion_id, codigo_postal);
CREATE INDEX IF NOT EXISTS ix_propiedades_linea_id
    ON public.propiedades (organizacion_id, linea_id);
CREATE INDEX IF NOT EXISTS ix_propiedades_familia_id
    ON public.propiedades (organizacion_id, familia_id);
CREATE INDEX IF NOT EXISTS ix_propiedades_modelo_id
    ON public.propiedades (organizacion_id, modelo_id);

COMMIT;
