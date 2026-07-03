-- Desglosa el domicilio fiscal de organizaciones y agrega referencias geo explícitas.

ALTER TABLE public.organizaciones
    ADD COLUMN IF NOT EXISTS pais_codigo_iso2 text,
    ADD COLUMN IF NOT EXISTS estado_clave_entidad text,
    ADD COLUMN IF NOT EXISTS municipio_clave_entidad text,
    ADD COLUMN IF NOT EXISTS municipio_clave_municipio text,
    ADD COLUMN IF NOT EXISTS direccion_fiscal_calle text,
    ADD COLUMN IF NOT EXISTS direccion_fiscal_numero_exterior text,
    ADD COLUMN IF NOT EXISTS direccion_fiscal_numero_interior text,
    ADD COLUMN IF NOT EXISTS direccion_fiscal_colonia text,
    ADD COLUMN IF NOT EXISTS direccion_fiscal_localidad text,
    ADD COLUMN IF NOT EXISTS direccion_fiscal_referencia text;

COMMENT ON COLUMN public.organizaciones.pais_codigo_iso2 IS 'Código ISO2 del país del tenant, ligado a geo_paises.';
COMMENT ON COLUMN public.organizaciones.estado_clave_entidad IS 'Clave del estado para tenants en México, ligada a geo_estados_mexico.';
COMMENT ON COLUMN public.organizaciones.municipio_clave_entidad IS 'Clave de entidad federativa del municipio fiscal.';
COMMENT ON COLUMN public.organizaciones.municipio_clave_municipio IS 'Clave del municipio fiscal en México.';
COMMENT ON COLUMN public.organizaciones.direccion_fiscal_calle IS 'Calle o vía principal del domicilio fiscal.';
COMMENT ON COLUMN public.organizaciones.direccion_fiscal_numero_exterior IS 'Número exterior del domicilio fiscal.';
COMMENT ON COLUMN public.organizaciones.direccion_fiscal_numero_interior IS 'Número interior o departamento del domicilio fiscal.';
COMMENT ON COLUMN public.organizaciones.direccion_fiscal_colonia IS 'Colonia o barrio del domicilio fiscal.';
COMMENT ON COLUMN public.organizaciones.direccion_fiscal_localidad IS 'Localidad, fracción o referencia territorial del domicilio fiscal.';
COMMENT ON COLUMN public.organizaciones.direccion_fiscal_referencia IS 'Referencia complementaria del domicilio fiscal.';

ALTER TABLE public.organizaciones
    ADD CONSTRAINT organizaciones_pais_codigo_iso2_fkey
        FOREIGN KEY (pais_codigo_iso2) REFERENCES public.geo_paises(codigo_iso2) ON UPDATE CASCADE,
    ADD CONSTRAINT organizaciones_estado_clave_entidad_fkey
        FOREIGN KEY (estado_clave_entidad) REFERENCES public.geo_estados_mexico(clave_entidad) ON UPDATE CASCADE,
    ADD CONSTRAINT organizaciones_municipio_geo_fkey
        FOREIGN KEY (municipio_clave_entidad, municipio_clave_municipio)
        REFERENCES public.geo_municipios_mexico(clave_entidad, clave_municipio)
        ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS organizaciones_pais_codigo_iso2_idx
    ON public.organizaciones (pais_codigo_iso2);

CREATE INDEX IF NOT EXISTS organizaciones_estado_clave_entidad_idx
    ON public.organizaciones (estado_clave_entidad);

CREATE INDEX IF NOT EXISTS organizaciones_municipio_geo_idx
    ON public.organizaciones (municipio_clave_entidad, municipio_clave_municipio);

UPDATE public.organizaciones
SET pais_codigo_iso2 = upper(btrim(pais))
WHERE pais_codigo_iso2 IS NULL
  AND pais IS NOT NULL
  AND btrim(pais) ~ '^[A-Za-z]{2}$';

UPDATE public.organizaciones o
SET estado_clave_entidad = e.clave_entidad
FROM public.geo_estados_mexico e
WHERE o.estado_clave_entidad IS NULL
  AND upper(coalesce(o.pais_codigo_iso2, btrim(o.pais), '')) = 'MX'
  AND o.estado IS NOT NULL
  AND lower(btrim(o.estado)) = lower(btrim(e.nombre))
  AND e.pais_codigo = 'MX';

UPDATE public.organizaciones o
SET municipio_clave_entidad = m.clave_entidad,
    municipio_clave_municipio = m.clave_municipio
FROM public.geo_municipios_mexico m
JOIN public.geo_estados_mexico e
  ON e.clave_entidad = m.clave_entidad
WHERE o.municipio_clave_municipio IS NULL
  AND upper(coalesce(o.pais_codigo_iso2, btrim(o.pais), '')) = 'MX'
  AND o.ciudad IS NOT NULL
  AND o.estado IS NOT NULL
  AND lower(btrim(o.ciudad)) = lower(btrim(m.nombre))
  AND lower(btrim(o.estado)) = lower(btrim(e.nombre))
  AND e.pais_codigo = 'MX';
