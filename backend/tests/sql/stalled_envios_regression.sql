-- Solo para una base PostgreSQL vacía y desechable. No ejecutar en producción.
\set ON_ERROR_STOP on
CREATE TABLE public.prospeccion_contacto_batch (
    id uuid PRIMARY KEY, organizacion_id uuid NOT NULL,
    estado text DEFAULT 'en_proceso', preparacion_estado text DEFAULT 'completada',
    finalizado_en timestamptz
);
CREATE TABLE public.prospeccion_contacto_envio (
    id uuid PRIMARY KEY, organizacion_id uuid NOT NULL, batch_id uuid,
    canal text NOT NULL, estado text NOT NULL, error text,
    mensaje_id text, mensaje_id_interno text, procesado_en timestamptz,
    proveedor_aceptado_en timestamptz, entregado_en timestamptz, leido_en timestamptz
);
CREATE TABLE public.tenant_email_messages (
    id uuid PRIMARY KEY, organizacion_id uuid NOT NULL,
    idempotency_key text, status text, external_message_id uuid,
    submitted_at timestamptz, delivered_at timestamptz,
    opened_at timestamptz, clicked_at timestamptz, last_error_code text,
    UNIQUE (organizacion_id, idempotency_key)
);
INSERT INTO public.prospeccion_contacto_envio(id, organizacion_id, canal, estado)
VALUES ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'whatsapp', 'procesando');

\ir ../../../supabase/migrations/20261113220927_recover_stalled_prospeccion_envios.sql

DO $$
DECLARE
    org uuid := gen_random_uuid(); other_org uuid := gen_random_uuid();
    eid uuid; bid uuid; mid uuid; provider_id uuid; actual text; expected text;
    s text; n integer;
BEGIN
    -- Migración compatible: los trabajos existentes reciben una hora de gracia.
    IF NOT EXISTS (SELECT 1 FROM public.prospeccion_contacto_envio
        WHERE procesamiento_iniciado_en >= now() - interval '1 minute') THEN
        RAISE EXCEPTION 'legacy_claim_missing_grace_period';
    END IF;
    SELECT count(*) INTO n FROM public.worker_recover_stalled_prospeccion_envios();
    IF n <> 0 THEN RAISE EXCEPTION 'active_claim_recovered'; END IF;

    FOREACH s IN ARRAY ARRAY['delivered','opened','clicked','bounced','complained',
        'failed','suppressed','cancelled','submitted','queued','processing','verifying']
    LOOP
        eid := gen_random_uuid(); bid := gen_random_uuid(); mid := gen_random_uuid();
        provider_id := CASE WHEN s IN ('delivered','opened','clicked','bounced','complained','submitted')
            THEN gen_random_uuid() ELSE NULL END;
        INSERT INTO public.prospeccion_contacto_batch(id, organizacion_id) VALUES (bid, org);
        INSERT INTO public.prospeccion_contacto_envio(id, organizacion_id, batch_id, canal, estado)
        VALUES (eid, org, bid, 'correo', 'procesando');
        UPDATE public.prospeccion_contacto_envio SET procesamiento_iniciado_en = now() - interval '2 hours'
        WHERE id = eid;
        INSERT INTO public.tenant_email_messages(id, organizacion_id, idempotency_key, status,
            external_message_id, submitted_at)
        VALUES (mid, org, 'prospeccion-envio:' || eid, s, provider_id,
            CASE WHEN provider_id IS NOT NULL THEN now() - interval '1 hour' END);
        SELECT count(*) INTO n FROM public.worker_recover_stalled_prospeccion_envios(ARRAY['whatsapp']);
        IF n <> 0 THEN RAISE EXCEPTION 'channel_scope_violated'; END IF;
        PERFORM public.worker_recover_stalled_prospeccion_envios(ARRAY['correo']);
        expected := CASE s WHEN 'delivered' THEN 'entregado' WHEN 'opened' THEN 'leido'
            WHEN 'clicked' THEN 'leido' WHEN 'bounced' THEN 'fallido' WHEN 'complained' THEN 'fallido'
            WHEN 'failed' THEN 'error' WHEN 'suppressed' THEN 'omitido' WHEN 'cancelled' THEN 'cancelado'
            ELSE 'enviado' END;
        SELECT estado INTO actual FROM public.prospeccion_contacto_envio WHERE id = eid;
        IF actual <> expected THEN RAISE EXCEPTION 'incorrect_status: % -> %', s, actual; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.prospeccion_contacto_envio WHERE id = eid
            AND mensaje_id_interno = mid::text AND mensaje_id IS NOT DISTINCT FROM provider_id::text
            AND procesamiento_iniciado_en IS NULL) THEN RAISE EXCEPTION 'lost_evidence'; END IF;
        IF s IN ('queued','processing','verifying') AND EXISTS (
            SELECT 1 FROM public.prospeccion_contacto_envio WHERE id=eid AND proveedor_aceptado_en IS NOT NULL
        ) THEN RAISE EXCEPTION 'false_provider_acceptance'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.prospeccion_contacto_batch WHERE id=bid
            AND estado <> 'en_proceso' AND finalizado_en IS NOT NULL) THEN
            RAISE EXCEPTION 'batch_not_finalized'; END IF;
    END LOOP;

    -- Clave de otro tenant nunca sirve de evidencia para este envío.
    eid := gen_random_uuid();
    INSERT INTO public.prospeccion_contacto_envio(id, organizacion_id, canal, estado)
    VALUES (eid, org, 'correo', 'procesando');
    INSERT INTO public.tenant_email_messages(id, organizacion_id, idempotency_key, status)
    VALUES (gen_random_uuid(), other_org, 'prospeccion-envio:' || eid, 'delivered');
    UPDATE public.prospeccion_contacto_envio SET procesamiento_iniciado_en=now()-interval '2 hours' WHERE id=eid;
    PERFORM public.worker_recover_stalled_prospeccion_envios();
    IF NOT EXISTS (SELECT 1 FROM public.prospeccion_contacto_envio WHERE id=eid
        AND estado='error' AND error='processing_expired_review_required' AND mensaje_id_interno IS NULL)
    THEN RAISE EXCEPTION 'cross_tenant_or_unknown_requeued'; END IF;

    -- Cancelados no se reabren, aun teniendo mensajes de correo asociados.
    UPDATE public.prospeccion_contacto_envio SET estado='cancelado' WHERE id=eid;
    PERFORM public.worker_recover_stalled_prospeccion_envios();
    IF (SELECT estado FROM public.prospeccion_contacto_envio WHERE id=eid) <> 'cancelado'
    THEN RAISE EXCEPTION 'cancelled_reopened'; END IF;
    IF has_function_privilege('anon', 'public.worker_recover_stalled_prospeccion_envios(text[],integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.worker_recover_stalled_prospeccion_envios(text[],integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.worker_recover_stalled_prospeccion_envios(text[],integer)', 'EXECUTE')
    THEN RAISE EXCEPTION 'unsafe_function_permissions'; END IF;
END;
$$;

SELECT 'stalled_envios_regression_passed' AS result;
