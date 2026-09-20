BEGIN;

-- Los intentos cancelados conservan auditoría, pero no deben bloquear una
-- nueva campaña ni incrementar envios_*_total del prospecto.
CREATE OR REPLACE FUNCTION public.sync_prospeccion_prospectos_envio_totales(
    p_organizacion_id uuid,
    p_prospecto_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
    IF p_organizacion_id IS NULL OR p_prospecto_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.prospeccion_prospectos p
    SET envios_correo_total = COALESCE(s.correo_total, 0),
        envios_whatsapp_total = COALESCE(s.whatsapp_total, 0),
        envios_voz_total = COALESCE(s.voz_total, 0),
        envios_total = COALESCE(s.total_envios, 0)
    FROM (
        SELECT
            COUNT(*) FILTER (WHERE LOWER(COALESCE(e.canal, '')) = 'correo')::bigint AS correo_total,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(e.canal, '')) = 'whatsapp')::bigint AS whatsapp_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) IN ('llamada', 'voz', 'voice', 'call')
            )::bigint AS voz_total,
            COUNT(*)::bigint AS total_envios
        FROM public.prospeccion_contacto_envio e
        WHERE e.organizacion_id = p_organizacion_id
          AND e.prospecto_id = p_prospecto_id
          AND LOWER(COALESCE(e.estado, '')) <> 'cancelado'
    ) AS s
    WHERE p.organizacion_id = p_organizacion_id
      AND p.id = p_prospecto_id;
END;
$function$;

COMMENT ON FUNCTION public.sync_prospeccion_prospectos_envio_totales(uuid, uuid)
    IS 'Recalcula totales de envios excluyendo intentos cancelados.';

-- Sólo se modifican los dos lotes autorizados, del tenant maestro, y sólo
-- registros sin identificador local/proveedor que nunca fueron aceptados.
UPDATE public.prospeccion_contacto_envio
SET estado = 'cancelado',
    error = 'cancelado_por_lote_duplicado_tras_502',
    procesado_en = COALESCE(procesado_en, now())
WHERE organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND batch_id IN (
      '690db3b6-36ae-41fa-b488-5bf92491c58f'::uuid,
      '711a6071-4472-4f04-90bc-4b495956e7ba'::uuid
  )
  AND estado IN ('pendiente', 'procesando')
  AND mensaje_id IS NULL
  AND mensaje_id_interno IS NULL;

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
  )
  AND estado NOT IN ('completado', 'cancelado');

-- Recalcular prospectos afectados por los dos lotes para retirar únicamente
-- el efecto de estos intentos cancelados de los contadores visibles.
WITH affected_prospectos AS (
    SELECT DISTINCT envio.organizacion_id, envio.prospecto_id
    FROM public.prospeccion_contacto_envio envio
    WHERE envio.organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND envio.batch_id IN (
          '690db3b6-36ae-41fa-b488-5bf92491c58f'::uuid,
          '711a6071-4472-4f04-90bc-4b495956e7ba'::uuid
      )
)
UPDATE public.prospeccion_prospectos p
SET envios_correo_total = COALESCE(s.correo_total, 0),
    envios_whatsapp_total = COALESCE(s.whatsapp_total, 0),
    envios_voz_total = COALESCE(s.voz_total, 0),
    envios_total = COALESCE(s.total_envios, 0)
FROM (
    SELECT
        a.organizacion_id,
        a.prospecto_id,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(e.canal, '')) = 'correo')::bigint AS correo_total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(e.canal, '')) = 'whatsapp')::bigint AS whatsapp_total,
        COUNT(*) FILTER (
            WHERE LOWER(COALESCE(e.canal, '')) IN ('llamada', 'voz', 'voice', 'call')
        )::bigint AS voz_total,
        COUNT(*)::bigint AS total_envios
    FROM affected_prospectos a
    LEFT JOIN public.prospeccion_contacto_envio e
      ON e.organizacion_id = a.organizacion_id
     AND e.prospecto_id = a.prospecto_id
     AND LOWER(COALESCE(e.estado, '')) <> 'cancelado'
    GROUP BY a.organizacion_id, a.prospecto_id
) AS s
WHERE p.organizacion_id = s.organizacion_id
  AND p.id = s.prospecto_id;

COMMIT;
