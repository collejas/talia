BEGIN;

ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS orden_diverso double precision;

UPDATE public.prospeccion_prospectos
SET orden_diverso = random()
WHERE orden_diverso IS NULL;

ALTER TABLE public.prospeccion_prospectos
    ALTER COLUMN orden_diverso SET DEFAULT random(),
    ALTER COLUMN orden_diverso SET NOT NULL;

COMMENT ON COLUMN public.prospeccion_prospectos.orden_diverso IS
    'Clave pseudoaleatoria persistente para ordenar prospectos de forma diversa antes de paginar.';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_orden_diverso_idx
    ON public.prospeccion_prospectos (organizacion_id, orden_diverso, id);

COMMIT;
