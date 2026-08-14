-- Conserva los callbacks Meta que pueden llegar antes de persistir mensajes.
ALTER TABLE public.eventos_entrega
  ALTER COLUMN mensaje_id DROP NOT NULL;

ALTER TABLE public.eventos_entrega
  ADD COLUMN IF NOT EXISTS proveedor_mensaje_id text;

UPDATE public.eventos_entrega ee
SET proveedor_mensaje_id = m.proveedor_mensaje_id
FROM public.mensajes m
WHERE ee.mensaje_id = m.id
  AND ee.proveedor_mensaje_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_entrega_provider_message
  ON public.eventos_entrega (organizacion_id, proveedor, proveedor_mensaje_id, creado_en DESC);

COMMENT ON COLUMN public.eventos_entrega.proveedor_mensaje_id IS
  'Identificador del proveedor (WAMID de Meta o SID historico) para reconciliar callbacks tempranos.';
