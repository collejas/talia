-- Corrige el identificador provisional usado durante la validacion del RPC.
-- La fila corresponde al mensaje real y debe poder recibir futuros callbacks de Meta.
UPDATE public.cobro_mensajes AS cm
SET proveedor_mensaje_id = COALESCE(m.proveedor_mensaje_id, m.twilio_message_sid)
FROM public.mensajes AS m
WHERE cm.mensaje_id = m.id
  AND cm.proveedor_mensaje_id = 'SM_TEST_REPAIR_20260813'
  AND m.proveedor_mensaje_id IS NOT NULL;
