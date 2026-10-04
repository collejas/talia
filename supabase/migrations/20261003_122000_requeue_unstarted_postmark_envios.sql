-- Un claim sin inicio de despacho ni identificador local/proveedor no llegó a
-- Postmark. Se puede reanudar sin duplicar un mensaje aceptado.
CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_postmark_stale_claim_idx
    ON public.prospeccion_contacto_envio (organizacion_id, canal, estado, batch_id, id)
    WHERE canal = 'correo' AND estado = 'procesando';

UPDATE public.prospeccion_contacto_envio
SET estado = 'pendiente',
    intento_actual = GREATEST(COALESCE(intento_actual, 1) - 1, 0),
    error = NULL,
    procesado_en = NULL,
    programado_en = now(),
    despacho_iniciado_en = NULL
WHERE canal = 'correo'
  AND estado = 'procesando'
  AND mensaje_id IS NULL
  AND mensaje_id_interno IS NULL
  AND proveedor_aceptado_en IS NULL
  AND despacho_iniciado_en IS NULL;
