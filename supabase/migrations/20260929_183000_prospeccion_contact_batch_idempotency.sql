ALTER TABLE public.prospeccion_contacto_batch
    ADD COLUMN IF NOT EXISTS solicitud_idempotencia text;

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_batch_org_idempotency_uidx
    ON public.prospeccion_contacto_batch (organizacion_id, solicitud_idempotencia)
    WHERE solicitud_idempotencia IS NOT NULL;

COMMENT ON COLUMN public.prospeccion_contacto_batch.solicitud_idempotencia IS
    'Clave de la solicitud de envío completa; evita crear otro lote cuando el cliente reintenta la misma acción.';
