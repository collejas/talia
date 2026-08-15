-- Explicita el estado de conciliacion de callbacks de entrega.
-- Un callback sin mensaje local nunca debe convertirse por si solo en un cargo.
ALTER TABLE public.eventos_entrega
  ADD COLUMN IF NOT EXISTS conciliacion_estado text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS conciliacion_motivo text,
  ADD COLUMN IF NOT EXISTS conciliado_en timestamptz;

ALTER TABLE public.eventos_entrega
  DROP CONSTRAINT IF EXISTS eventos_entrega_conciliacion_estado_check;

ALTER TABLE public.eventos_entrega
  ADD CONSTRAINT eventos_entrega_conciliacion_estado_check
  CHECK (conciliacion_estado IN ('pendiente', 'vinculado', 'no_conciliado'));

-- Los eventos que ya tenian mensaje_id quedaron conciliados historicamente.
UPDATE public.eventos_entrega
SET conciliacion_estado = 'vinculado',
    conciliado_en = COALESCE(conciliado_en, creado_en),
    conciliacion_motivo = NULL
WHERE mensaje_id IS NOT NULL
  AND conciliacion_estado = 'pendiente';

-- Cierra solo callbacks Meta suficientemente antiguos y sin una fila local
-- resoluble por organizacion + WAMID. No crea ni modifica cargos.
UPDATE public.eventos_entrega ee
SET conciliacion_estado = 'no_conciliado',
    conciliacion_motivo = 'mensaje_local_no_encontrado',
    conciliado_en = now()
WHERE ee.conciliacion_estado = 'pendiente'
  AND ee.proveedor = 'meta'
  AND ee.proveedor_mensaje_id LIKE 'wamid.%'
  AND ee.mensaje_id IS NULL
  AND ee.creado_en < now() - interval '15 minutes'
  AND NOT EXISTS (
    SELECT 1
    FROM public.mensajes m
    WHERE m.organizacion_id = ee.organizacion_id
      AND m.proveedor_mensaje_id = ee.proveedor_mensaje_id
  );

CREATE INDEX IF NOT EXISTS idx_eventos_entrega_conciliacion
  ON public.eventos_entrega (organizacion_id, conciliacion_estado, creado_en DESC);

COMMENT ON COLUMN public.eventos_entrega.conciliacion_estado IS
  'Estado de conciliacion del callback: pendiente, vinculado o no_conciliado.';
COMMENT ON COLUMN public.eventos_entrega.conciliacion_motivo IS
  'Motivo explicito cuando el callback no pudo vincularse a un mensaje local.';
