BEGIN;

ALTER TABLE public.actividades
    ADD COLUMN IF NOT EXISTS whatsapp_recordatorio_en timestamptz,
    ADD COLUMN IF NOT EXISTS whatsapp_recordatorio_enviado_en timestamptz;

UPDATE public.actividades
SET whatsapp_recordatorio_en = fecha_vencimiento - interval '90 minutes'
WHERE whatsapp_recordatorio_en IS NULL
  AND fecha_vencimiento IS NOT NULL;

CREATE INDEX IF NOT EXISTS actividades_org_whatsapp_recordatorio_pendiente_idx
    ON public.actividades (organizacion_id, whatsapp_recordatorio_en)
    WHERE estado = 'pendiente'
      AND whatsapp_recordatorio_en IS NOT NULL
      AND whatsapp_recordatorio_enviado_en IS NULL;

COMMIT;
