-- Reconcilia dos intentos del tenant maestro que Talia marco como enviados,
-- pero que nunca fueron aceptados por Postmark.
--
-- Evidencia usada antes de aplicar esta migracion:
--   * Postmark Broadcast server 20008586: cero mensajes en la ventana de los
--     intentos del 2026-10-02.
--   * Los registros locales no tienen external_message_id ni proveedor_aceptado_en.
--   * Solo se liberan mensajes internos que siguen queued y sin ID externo.
--   * Se conserva toda la auditoria: no se borran lotes, envios ni mensajes.

CREATE TEMP TABLE _postmark_reconciliation_cancelled_messages
ON COMMIT DROP AS
WITH cancelled AS (
    UPDATE public.tenant_email_messages AS m
    SET status = 'cancelled',
        cancelled_at = COALESCE(m.cancelled_at, now()),
        last_error_code = 'postmark_not_accepted_reconciliation',
        last_error_message = 'Cancelado porque Postmark no acepto el mensaje; no tenia external_message_id',
        updated_at = now()
    WHERE m.organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND m.source_batch_id IN (
          '6de74eef-d3b7-4532-83fc-ee8ec8e3ab7b'::uuid,
          'e26ccc0a-dd9d-4a75-8a6f-d48bd7d5a394'::uuid
      )
      AND m.status = 'queued'
      AND m.external_message_id IS NULL
    RETURNING m.id, m.usage_period_id
)
SELECT id, usage_period_id
FROM cancelled;

INSERT INTO public.tenant_email_usage_events (
    organizacion_id,
    usage_period_id,
    event_type,
    recipient_count,
    reason
)
SELECT
    '00000000-0000-0000-0000-000000000001'::uuid,
    usage_period_id,
    'released',
    count(*)::integer,
    'postmark_not_accepted_reconciliation'
FROM _postmark_reconciliation_cancelled_messages
GROUP BY usage_period_id;

UPDATE public.tenant_email_usage_periods AS p
SET released_recipients = p.released_recipients + r.recipient_count,
    updated_at = now()
FROM (
    SELECT usage_period_id, count(*)::integer AS recipient_count
    FROM _postmark_reconciliation_cancelled_messages
    GROUP BY usage_period_id
) AS r
WHERE p.id = r.usage_period_id
  AND p.organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.prospeccion_contacto_envio AS e
SET estado = 'cancelado',
    error = 'postmark_no_acepto_el_envio_reconciliado',
    procesado_en = COALESCE(e.procesado_en, now())
WHERE e.organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND e.batch_id IN (
      '6de74eef-d3b7-4532-83fc-ee8ec8e3ab7b'::uuid,
      'e26ccc0a-dd9d-4a75-8a6f-d48bd7d5a394'::uuid
  )
  AND e.canal = 'correo'
  AND e.estado <> 'cancelado'
  AND e.mensaje_id IS NULL
  AND e.proveedor_aceptado_en IS NULL;

UPDATE public.prospeccion_contacto_batch AS b
SET estado = 'cancelado',
    finalizado_en = COALESCE(b.finalizado_en, now()),
    metadata = COALESCE(b.metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciliacion_postmark', 'no_aceptado_por_postmark',
        'reconciliacion_postmark_en', now()
    )
WHERE b.organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND b.id IN (
      '6de74eef-d3b7-4532-83fc-ee8ec8e3ab7b'::uuid,
      'e26ccc0a-dd9d-4a75-8a6f-d48bd7d5a394'::uuid
  );

