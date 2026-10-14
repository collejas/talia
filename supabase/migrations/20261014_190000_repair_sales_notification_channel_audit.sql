-- Corrige la trazabilidad de notificaciones de vendedor que fueron enviadas
-- por WhatsApp pero auditadas como webchat por el notifier compartido.
-- La relación se limita al mismo tenant, conversación y oportunidad de un job
-- persistido con channel = whatsapp; no modifica envíos ni estados de entrega.

WITH whatsapp_jobs AS (
    SELECT DISTINCT
        organizacion_id,
        conversation_id,
        opportunity_id
    FROM public.sales_notification_jobs
    WHERE channel = 'whatsapp'
      AND conversation_id IS NOT NULL
)
UPDATE public.asignaciones_vendedores AS assignment
SET canal = 'whatsapp'
FROM whatsapp_jobs AS job
WHERE assignment.organizacion_id = job.organizacion_id
  AND assignment.conversacion_id = job.conversation_id
  AND assignment.oportunidad_id = job.opportunity_id
  AND assignment.canal = 'webchat'
  AND assignment.trigger_event LIKE 'notify_%';

WITH whatsapp_jobs AS (
    SELECT DISTINCT
        organizacion_id,
        conversation_id
    FROM public.sales_notification_jobs
    WHERE channel = 'whatsapp'
      AND conversation_id IS NOT NULL
)
UPDATE public.mensajes AS message
SET datos = jsonb_set(
    COALESCE(message.datos, '{}'::jsonb),
    '{notification_channel}',
    '"whatsapp"'::jsonb,
    true
)
FROM whatsapp_jobs AS job
WHERE message.datos ->> 'sender' = 'sales_notification'
  AND message.datos ->> 'notification_channel' = 'webchat'
  AND message.datos ->> 'conversation_id_origen' = job.conversation_id::text
  AND message.organizacion_id = job.organizacion_id;
