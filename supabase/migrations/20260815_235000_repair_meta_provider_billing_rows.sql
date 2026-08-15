-- Corrige filas del ledger que guardaron Twilio aunque el identificador es WAMID.
-- Un WAMID solo puede provenir de WhatsApp Cloud API (Meta); los SID de Twilio
-- conservan el proveedor twilio.

UPDATE public.cobro_mensajes
SET proveedor = 'meta'
WHERE proveedor = 'twilio'
  AND proveedor_mensaje_id ILIKE 'wamid.%';

UPDATE public.eventos_entrega
SET proveedor = 'meta'
WHERE proveedor = 'twilio'
  AND proveedor_mensaje_id ILIKE 'wamid.%';
