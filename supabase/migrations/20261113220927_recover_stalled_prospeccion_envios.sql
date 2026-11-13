BEGIN;

ALTER TABLE public.prospeccion_contacto_envio
    ADD COLUMN procesamiento_iniciado_en timestamptz;

-- No expirar reclamaciones anteriores justo al publicar la migración.
UPDATE public.prospeccion_contacto_envio
SET procesamiento_iniciado_en = now()
WHERE estado = 'procesando';

CREATE FUNCTION public.tg_prospeccion_envio_processing_started()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.estado = 'procesando' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.procesamiento_iniciado_en := clock_timestamp();
        ELSIF OLD.estado IS DISTINCT FROM 'procesando' THEN
            NEW.procesamiento_iniciado_en := clock_timestamp();
        ELSE
            NEW.procesamiento_iniciado_en := OLD.procesamiento_iniciado_en;
        END IF;
    ELSE
        NEW.procesamiento_iniciado_en := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER prospeccion_envio_processing_started
BEFORE INSERT OR UPDATE OF estado ON public.prospeccion_contacto_envio
FOR EACH ROW EXECUTE FUNCTION public.tg_prospeccion_envio_processing_started();

CREATE INDEX prospeccion_envio_stalled_idx
ON public.prospeccion_contacto_envio (canal, procesamiento_iniciado_en, id)
WHERE estado = 'procesando';

CREATE FUNCTION public.worker_recover_stalled_prospeccion_envios(
    p_canales text[] DEFAULT NULL, p_limit integer DEFAULT 25
)
RETURNS TABLE(envio_id uuid, organizacion_id uuid, estado text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    v_envio public.prospeccion_contacto_envio%ROWTYPE;
    v_mail public.tenant_email_messages%ROWTYPE;
    v_state text;
    v_error text;
    v_batches uuid[] := ARRAY[]::uuid[];
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'stalled_recovery_invalid_limit' USING ERRCODE = '22023';
    END IF;
    FOR v_envio IN
        SELECT e.* FROM public.prospeccion_contacto_envio e
        WHERE e.estado = 'procesando'
          AND e.procesamiento_iniciado_en < now() - interval '1 hour'
          AND (p_canales IS NULL OR e.canal = ANY(p_canales))
        ORDER BY e.procesamiento_iniciado_en, e.id
        LIMIT p_limit FOR UPDATE SKIP LOCKED
    LOOP
        v_mail := NULL;
        IF v_envio.canal = 'correo' THEN
            SELECT m.* INTO v_mail FROM public.tenant_email_messages m
            WHERE m.organizacion_id = v_envio.organizacion_id
              AND m.idempotency_key = 'prospeccion-envio:' || v_envio.id::text;
        END IF;
        v_error := NULL;
        v_state := CASE v_mail.status
            WHEN 'delivered' THEN 'entregado'
            WHEN 'opened' THEN 'leido'
            WHEN 'clicked' THEN 'leido'
            WHEN 'bounced' THEN 'fallido'
            WHEN 'complained' THEN 'fallido'
            WHEN 'failed' THEN 'error'
            WHEN 'suppressed' THEN 'omitido'
            WHEN 'cancelled' THEN 'cancelado'
            WHEN 'submitted' THEN 'enviado'
            WHEN 'queued' THEN 'enviado'
            WHEN 'processing' THEN 'enviado'
            WHEN 'verifying' THEN 'enviado'
            ELSE 'error' END;
        IF v_mail.id IS NULL OR v_mail.status NOT IN (
            'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed',
            'suppressed', 'cancelled', 'submitted', 'queued', 'processing', 'verifying'
        ) THEN
            v_error := 'processing_expired_review_required';
        ELSIF v_mail.status = 'verifying' THEN
            v_error := 'delivery_uncertain';
        ELSIF v_mail.status IN ('bounced', 'complained', 'failed', 'suppressed') THEN
            v_error := COALESCE(v_mail.last_error_code, 'postmark_' || v_mail.status);
        END IF;
        -- Nunca crear un segundo mensaje ni volver a ponerlo en pendiente.
        UPDATE public.prospeccion_contacto_envio e
        SET estado = v_state, error = v_error, procesado_en = now(),
            mensaje_id = COALESCE(v_mail.external_message_id::text, e.mensaje_id),
            mensaje_id_interno = COALESCE(v_mail.id::text, e.mensaje_id_interno),
            proveedor_aceptado_en = COALESCE(v_mail.submitted_at, e.proveedor_aceptado_en),
            entregado_en = COALESCE(v_mail.delivered_at, e.entregado_en),
            leido_en = COALESCE(v_mail.opened_at, v_mail.clicked_at, e.leido_en)
        WHERE e.id = v_envio.id AND e.organizacion_id = v_envio.organizacion_id
          AND e.estado = 'procesando';
        IF v_envio.batch_id IS NOT NULL THEN
            v_batches := array_append(v_batches, v_envio.batch_id);
        END IF;
        envio_id := v_envio.id;
        organizacion_id := v_envio.organizacion_id;
        estado := v_state;
        RETURN NEXT;
    END LOOP;

    UPDATE public.prospeccion_contacto_batch b
    SET estado = CASE WHEN EXISTS (
            SELECT 1 FROM public.prospeccion_contacto_envio e
            WHERE e.batch_id = b.id AND e.organizacion_id = b.organizacion_id
              AND e.estado IN ('error','fallido','failed','undelivered','cancelado','canceled')
        ) THEN 'error' ELSE 'completado' END,
        finalizado_en = now()
    WHERE b.id = ANY(v_batches)
      AND b.preparacion_estado NOT IN ('pendiente', 'procesando')
      AND NOT EXISTS (
          SELECT 1 FROM public.prospeccion_contacto_envio e
          WHERE e.batch_id = b.id AND e.organizacion_id = b.organizacion_id
            AND e.estado IN ('pendiente', 'procesando')
      );
END;
$$;

REVOKE ALL ON FUNCTION public.tg_prospeccion_envio_processing_started() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.worker_recover_stalled_prospeccion_envios(text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_recover_stalled_prospeccion_envios(text[], integer) TO service_role;

COMMIT;
