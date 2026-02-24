-- Backfill metadata in mensajes for historical prospeccion WhatsApp sends.
-- This allows inbox filters by source/batch/campana to work on old records.

WITH envio_meta AS (
    SELECT
        e.id AS envio_id,
        e.batch_id,
        e.mensaje_id,
        e.canal,
        b.campana_id
    FROM public.prospeccion_contacto_envio e
    LEFT JOIN public.prospeccion_contacto_batch b
        ON b.id = e.batch_id
       AND b.organizacion_id = e.organizacion_id
    WHERE e.canal = 'whatsapp'
      AND e.mensaje_id IS NOT NULL
      AND e.mensaje_id <> ''
),
target_msgs AS (
    SELECT
        m.id AS mensaje_pk,
        m.datos AS datos_actuales,
        em.envio_id,
        em.batch_id,
        em.campana_id
    FROM public.mensajes m
    JOIN envio_meta em
      ON em.mensaje_id = m.twilio_message_sid
    WHERE m.direccion = 'saliente'
)
UPDATE public.mensajes m
SET datos = (
    COALESCE(tm.datos_actuales, '{}'::jsonb)
    || jsonb_build_object(
        'source', 'prospeccion',
        'channel', 'whatsapp',
        'envio_id', tm.envio_id::text,
        'batch_id', tm.batch_id::text
    )
    || CASE
        WHEN tm.campana_id IS NOT NULL THEN jsonb_build_object('campana_id', tm.campana_id::text)
        ELSE '{}'::jsonb
    END
)
FROM target_msgs tm
WHERE m.id = tm.mensaje_pk;
