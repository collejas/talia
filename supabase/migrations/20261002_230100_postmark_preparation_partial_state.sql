ALTER TABLE public.prospeccion_contacto_batch
  DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_preparacion_estado_check;

ALTER TABLE public.prospeccion_contacto_batch
  ADD CONSTRAINT prospeccion_contacto_batch_preparacion_estado_check
  CHECK (preparacion_estado = ANY (ARRAY[
    'no_requerida'::text,
    'pendiente'::text,
    'procesando'::text,
    'parcial'::text,
    'completada'::text,
    'fallida'::text
  ]));
