BEGIN;

-- Segunda pasada: durante la primera cancelación el worker alcanzó a crear 84
-- mensajes locales queued. No tienen external_message_id, por lo que todavía
-- no fueron aceptados por Postmark y se pueden cancelar sin afectar al
-- proveedor.
UPDATE public.tenant_email_messages
SET status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, now()),
    last_error_code = 'cancelled_duplicate_contact_batch',
    last_error_message = 'Cancelado antes de aceptación por Postmark',
    updated_at = now()
WHERE organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND source_batch_id IN (
      '690db3b6-36ae-41fa-b488-5bf92491c58f'::uuid,
      '711a6071-4472-4f04-90bc-4b495956e7ba'::uuid
  )
  AND status = 'queued'
  AND external_message_id IS NULL;

-- Los envíos de ambos lotes no tienen MessageID de Postmark. Se conservan como
-- auditoría y se excluyen de los contadores mediante la función actualizada.
UPDATE public.prospeccion_contacto_envio
SET estado = 'cancelado',
    error = 'cancelado_por_lote_duplicado_tras_502',
    procesado_en = COALESCE(procesado_en, now())
WHERE organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND batch_id IN (
      '690db3b6-36ae-41fa-b488-5bf92491c58f'::uuid,
      '711a6071-4472-4f04-90bc-4b495956e7ba'::uuid
  )
  AND estado <> 'cancelado'
  AND mensaje_id IS NULL;

UPDATE public.prospeccion_contacto_batch
SET estado = 'cancelado',
    finalizado_en = COALESCE(finalizado_en, now()),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelacion_motivo', 'duplicado_por_reintento_tras_502',
        'cancelado_en', now()
    )
WHERE organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND id IN (
      '690db3b6-36ae-41fa-b488-5bf92491c58f'::uuid,
      '711a6071-4472-4f04-90bc-4b495956e7ba'::uuid
  );

COMMIT;
