BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS nombre_comercial text,
    ADD COLUMN IF NOT EXISTS titulo text,
    ADD COLUMN IF NOT EXISTS nombre text,
    ADD COLUMN IF NOT EXISTS primer_apellido text,
    ADD COLUMN IF NOT EXISTS segundo_apellido text;

COMMENT ON COLUMN public.prospeccion_prospectos.nombre_comercial IS 'Nombre comercial o razón social visible del prospecto.';
COMMENT ON COLUMN public.prospeccion_prospectos.titulo IS 'Título o tratamiento de la persona de contacto.';
COMMENT ON COLUMN public.prospeccion_prospectos.nombre IS 'Nombre(s) de la persona de contacto.';
COMMENT ON COLUMN public.prospeccion_prospectos.primer_apellido IS 'Primer apellido de la persona de contacto.';
COMMENT ON COLUMN public.prospeccion_prospectos.segundo_apellido IS 'Segundo apellido de la persona de contacto.';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_nombre_comercial_idx
    ON public.prospeccion_prospectos (organizacion_id, lower(nombre_comercial))
    WHERE nombre_comercial IS NOT NULL AND btrim(nombre_comercial) <> '';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_nombre_idx
    ON public.prospeccion_prospectos (organizacion_id, lower(nombre))
    WHERE nombre IS NOT NULL AND btrim(nombre) <> '';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_apellidos_idx
    ON public.prospeccion_prospectos (organizacion_id, lower(primer_apellido), lower(segundo_apellido))
    WHERE (primer_apellido IS NOT NULL AND btrim(primer_apellido) <> '')
       OR (segundo_apellido IS NOT NULL AND btrim(segundo_apellido) <> '');

COMMIT;
