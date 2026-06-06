BEGIN;

ALTER TABLE public.propiedad_unidades
    ADD COLUMN IF NOT EXISTS status_operativo public.propiedad_status,
    ADD COLUMN IF NOT EXISTS status_comercial public.propiedad_status;

UPDATE public.propiedad_unidades
SET
    status_operativo = COALESCE(status_operativo, status),
    status_comercial = COALESCE(status_comercial, status);

ALTER TABLE public.propiedad_unidades
    ALTER COLUMN status_operativo SET DEFAULT 'disponible',
    ALTER COLUMN status_comercial SET DEFAULT 'disponible';

ALTER TABLE public.propiedad_unidades
    ALTER COLUMN status_operativo SET NOT NULL,
    ALTER COLUMN status_comercial SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_propiedad_unidades_status_operativo
    ON public.propiedad_unidades (organizacion_id, status_operativo);

CREATE INDEX IF NOT EXISTS ix_propiedad_unidades_status_comercial
    ON public.propiedad_unidades (organizacion_id, status_comercial);

COMMENT ON COLUMN public.propiedad_unidades.status_operativo
    IS 'Estado operativo de la unidad, editable por el flujo de propiedades.';

COMMENT ON COLUMN public.propiedad_unidades.status_comercial
    IS 'Estado comercial de la unidad, controlado por el flujo CRM y ventas.';

COMMIT;
