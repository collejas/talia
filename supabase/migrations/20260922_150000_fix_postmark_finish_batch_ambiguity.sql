BEGIN;

-- La función devuelve una columna llamada delivery_batch_id. Calificar las
-- columnas de tenant_email_messages evita que PL/pgSQL confunda el nombre de
-- salida con la columna de la tabla al cerrar el bloque enviado.
CREATE OR REPLACE FUNCTION public.tenant_email_finish_delivery_batch(
    p_organizacion_id uuid,
    p_delivery_batch_id uuid,
    p_error_code text DEFAULT NULL,
    p_error_message text DEFAULT NULL
)
RETURNS TABLE (delivery_batch_id uuid, status text, pending_messages integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_pending integer;
    v_status text;
BEGIN
    SELECT count(*)::integer INTO v_pending
    FROM public.tenant_email_messages AS m
    WHERE m.organizacion_id = p_organizacion_id
      AND m.delivery_batch_id = p_delivery_batch_id
      AND m.status IN ('queued', 'processing');

    v_status := CASE WHEN v_pending > 0 THEN 'retry_wait' ELSE 'submitted' END;

    RETURN QUERY
    UPDATE public.tenant_email_delivery_batches AS b
    SET status = v_status,
        submitted_at = CASE WHEN v_pending = 0 THEN now() ELSE b.submitted_at END,
        last_error_code = p_error_code,
        last_error_message = left(p_error_message, 2000),
        updated_at = now()
    WHERE b.id = p_delivery_batch_id
      AND b.organizacion_id = p_organizacion_id
    RETURNING b.id, b.status, v_pending;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_finish_delivery_batch(uuid, uuid, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_finish_delivery_batch(uuid, uuid, text, text)
    TO service_role;

-- Recupera bloques que ya no tienen mensajes pendientes pero quedaron en
-- sending cuando la función anterior falló al cerrar el bloque. No reenvía
-- mensajes ni cambia estados individuales.
UPDATE public.tenant_email_delivery_batches AS b
SET status = 'submitted',
    submitted_at = COALESCE(b.submitted_at, now()),
    updated_at = now()
WHERE b.status = 'sending'
  AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_email_messages AS m
      WHERE m.delivery_batch_id = b.id
        AND m.status IN ('queued', 'processing')
  );

COMMIT;
