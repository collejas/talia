BEGIN;

-- Bloques persistentes de entrega Postmark. La información estructural del
-- bloque se mantiene en columnas explícitas; el payload crudo del webhook se
-- conserva únicamente como respaldo variable.
CREATE TABLE IF NOT EXISTS public.tenant_email_delivery_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    source_batch_id uuid NOT NULL REFERENCES public.prospeccion_contacto_batch(id) ON DELETE CASCADE,
    message_kind text NOT NULL,
    message_stream text NOT NULL,
    sequence_number integer NOT NULL,
    message_count integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'ready',
    attempt_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    prepared_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    submitted_at timestamptz,
    last_error_code text,
    last_error_message text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_delivery_batches_kind_check
        CHECK (message_kind IN ('transactional', 'broadcast')),
    CONSTRAINT tenant_email_delivery_batches_sequence_check
        CHECK (sequence_number >= 0),
    CONSTRAINT tenant_email_delivery_batches_count_check
        CHECK (message_count >= 0 AND message_count <= 500),
    CONSTRAINT tenant_email_delivery_batches_status_check
        CHECK (status IN ('ready', 'sending', 'retry_wait', 'submitted', 'failed')),
    CONSTRAINT tenant_email_delivery_batches_unique
        UNIQUE (organizacion_id, source_batch_id, message_kind, message_stream, sequence_number)
);

ALTER TABLE public.tenant_email_messages
    ADD COLUMN IF NOT EXISTS delivery_batch_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenant_email_messages_delivery_batch_fkey'
          AND conrelid = 'public.tenant_email_messages'::regclass
    ) THEN
        ALTER TABLE public.tenant_email_messages
            ADD CONSTRAINT tenant_email_messages_delivery_batch_fkey
            FOREIGN KEY (delivery_batch_id)
            REFERENCES public.tenant_email_delivery_batches(id)
            ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS tenant_email_delivery_batches_ready_idx
    ON public.tenant_email_delivery_batches (organizacion_id, status, prepared_at, id)
    WHERE status IN ('ready', 'retry_wait');

CREATE INDEX IF NOT EXISTS tenant_email_delivery_batches_source_idx
    ON public.tenant_email_delivery_batches (organizacion_id, source_batch_id, message_kind, message_stream, sequence_number);

CREATE INDEX IF NOT EXISTS tenant_email_messages_delivery_batch_idx
    ON public.tenant_email_messages (organizacion_id, delivery_batch_id, status, queued_at);

-- Crea bloques sólo cuando Talia terminó de preparar el lote de negocio.
-- Los mensajes de bloques nuevos quedan fuera del claim legado por
-- source_batch_id y sólo pueden salir por el claim del bloque.
CREATE OR REPLACE FUNCTION public.tenant_email_prepare_delivery_batches(
    p_organizacion_id uuid,
    p_source_batch_id uuid,
    p_max_messages integer DEFAULT 500
)
RETURNS TABLE (
    delivery_batch_id uuid,
    message_kind text,
    message_stream text,
    sequence_number integer,
    message_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_batch_state text;
    v_limit integer := LEAST(GREATEST(COALESCE(p_max_messages, 500), 1), 500);
BEGIN
    IF p_organizacion_id IS NULL OR p_source_batch_id IS NULL THEN
        RAISE EXCEPTION 'postmark_prepare_invalid_input' USING ERRCODE = '22023';
    END IF;

    SELECT estado INTO v_batch_state
    FROM public.prospeccion_contacto_batch
    WHERE id = p_source_batch_id
      AND organizacion_id = p_organizacion_id;

    IF v_batch_state IS NULL THEN
        RAISE EXCEPTION 'postmark_prepare_batch_not_found' USING ERRCODE = '22023';
    END IF;
    IF v_batch_state <> 'completado' THEN
        RETURN;
    END IF;

    WITH candidates AS (
        SELECT
            m.id,
            m.organizacion_id,
            m.source_batch_id,
            m.message_kind,
            m.stream_name AS message_stream,
            (row_number() OVER (
                PARTITION BY m.message_kind, m.stream_name
                ORDER BY m.queued_at, m.id
            ) - 1) AS zero_index
        FROM public.tenant_email_messages AS m
        WHERE m.organizacion_id = p_organizacion_id
          AND m.source_batch_id = p_source_batch_id
          AND m.delivery_batch_id IS NULL
          AND m.status = 'queued'
    ), grouped AS (
        SELECT
            c.organizacion_id,
            c.source_batch_id,
            c.message_kind,
            c.message_stream,
            (c.zero_index / v_limit)::integer AS sequence_number,
            count(*)::integer AS message_count
        FROM candidates AS c
        GROUP BY c.organizacion_id, c.source_batch_id, c.message_kind,
                 c.message_stream, (c.zero_index / v_limit)::integer
    )
    INSERT INTO public.tenant_email_delivery_batches (
        organizacion_id, source_batch_id, message_kind, message_stream,
        sequence_number, message_count, status, prepared_at, updated_at
    )
    SELECT g.organizacion_id, g.source_batch_id, g.message_kind,
           g.message_stream, g.sequence_number, g.message_count,
           'ready', now(), now()
    FROM grouped AS g
    ON CONFLICT (organizacion_id, source_batch_id, message_kind, message_stream, sequence_number)
    DO UPDATE SET
        message_count = EXCLUDED.message_count,
        updated_at = now()
    WHERE tenant_email_delivery_batches.status IN ('ready', 'retry_wait');

    WITH candidates AS (
        SELECT
            m.id,
            m.message_kind,
            m.stream_name AS message_stream,
            ((row_number() OVER (
                PARTITION BY m.message_kind, m.stream_name
                ORDER BY m.queued_at, m.id
            ) - 1) / v_limit)::integer AS sequence_number
        FROM public.tenant_email_messages AS m
        WHERE m.organizacion_id = p_organizacion_id
          AND m.source_batch_id = p_source_batch_id
          AND m.delivery_batch_id IS NULL
          AND m.status = 'queued'
    )
    UPDATE public.tenant_email_messages AS m
    SET delivery_batch_id = b.id,
        updated_at = now()
    FROM candidates AS c
    JOIN public.tenant_email_delivery_batches AS b
      ON b.organizacion_id = p_organizacion_id
     AND b.source_batch_id = p_source_batch_id
     AND b.message_kind = c.message_kind
     AND b.message_stream = c.message_stream
     AND b.sequence_number = c.sequence_number
    WHERE m.id = c.id
      AND m.delivery_batch_id IS NULL
      AND m.status = 'queued';

    RETURN QUERY
    SELECT b.id, b.message_kind, b.message_stream, b.sequence_number, b.message_count
    FROM public.tenant_email_delivery_batches AS b
    WHERE b.organizacion_id = p_organizacion_id
      AND b.source_batch_id = p_source_batch_id
    ORDER BY b.message_kind, b.message_stream, b.sequence_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_prepare_delivery_batches(uuid, uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_prepare_delivery_batches(uuid, uuid, integer)
    TO service_role;

CREATE OR REPLACE FUNCTION public.tenant_email_claim_delivery_batch(
    p_organizacion_id uuid,
    p_delivery_batch_id uuid,
    p_limit integer DEFAULT 500,
    p_stale_after_seconds integer DEFAULT 600
)
RETURNS TABLE (message_id uuid, organizacion_id uuid, delivery_batch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
BEGIN
    IF p_organizacion_id IS NULL OR p_delivery_batch_id IS NULL THEN
        RAISE EXCEPTION 'postmark_claim_batch_invalid_input' USING ERRCODE = '22023';
    END IF;
    IF p_stale_after_seconds < 60 OR p_stale_after_seconds > 86400 THEN
        RAISE EXCEPTION 'postmark_claim_batch_invalid_stale_window' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH selected_batch AS (
        SELECT b.id
        FROM public.tenant_email_delivery_batches AS b
        WHERE b.id = p_delivery_batch_id
          AND b.organizacion_id = p_organizacion_id
          AND (
              b.status IN ('ready', 'retry_wait')
              OR (b.status = 'sending' AND b.updated_at < now() - make_interval(secs => p_stale_after_seconds))
          )
        FOR UPDATE SKIP LOCKED
    ), candidates AS (
        SELECT m.id
        FROM public.tenant_email_messages AS m
        JOIN selected_batch AS b ON b.id = m.delivery_batch_id
        WHERE m.organizacion_id = p_organizacion_id
          AND m.status IN ('queued', 'processing')
          AND (m.status = 'queued' OR m.updated_at < now() - make_interval(secs => p_stale_after_seconds))
        ORDER BY m.queued_at, m.id
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    ), marked_messages AS (
        UPDATE public.tenant_email_messages AS m
        SET status = 'processing', updated_at = now()
        FROM candidates AS c
        WHERE m.id = c.id
        RETURNING m.id, m.organizacion_id, m.delivery_batch_id
    ), marked_batch AS (
        UPDATE public.tenant_email_delivery_batches AS b
        SET status = 'sending',
            attempt_count = b.attempt_count + 1,
            claimed_at = now(),
            updated_at = now()
        FROM selected_batch AS s
        WHERE b.id = s.id
        RETURNING b.id
    )
    SELECT mm.id, mm.organizacion_id, mb.id
    FROM marked_messages AS mm
    JOIN marked_batch AS mb ON mb.id = mm.delivery_batch_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_claim_delivery_batch(uuid, uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_claim_delivery_batch(uuid, uuid, integer, integer)
    TO service_role;

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
    FROM public.tenant_email_messages
    WHERE organizacion_id = p_organizacion_id
      AND delivery_batch_id = p_delivery_batch_id
      AND status IN ('queued', 'processing');

    v_status := CASE WHEN v_pending > 0 THEN 'retry_wait' ELSE 'submitted' END;

    RETURN QUERY
    UPDATE public.tenant_email_delivery_batches
    SET status = v_status,
        submitted_at = CASE WHEN v_pending = 0 THEN now() ELSE submitted_at END,
        last_error_code = p_error_code,
        last_error_message = left(p_error_message, 2000),
        updated_at = now()
    WHERE id = p_delivery_batch_id
      AND organizacion_id = p_organizacion_id
    RETURNING id, status, v_pending;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_finish_delivery_batch(uuid, uuid, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_finish_delivery_batch(uuid, uuid, text, text)
    TO service_role;

-- Cola durable de webhooks: el endpoint sólo inserta y responde; el worker
-- ejecuta process_postmark_event con reintentos e idempotencia.
CREATE TABLE IF NOT EXISTS public.tenant_email_webhook_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    server_id uuid NOT NULL,
    message_stream text NOT NULL,
    event_type text NOT NULL,
    event_key text NOT NULL,
    external_message_id text,
    webhook_trace_id text,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    attempt_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_until timestamptz,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    last_error_code text,
    last_error_message text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_webhook_jobs_status_check
        CHECK (status IN ('queued', 'processing', 'processed', 'failed')),
    CONSTRAINT tenant_email_webhook_jobs_unique
        UNIQUE (organizacion_id, server_id, message_stream, event_type, event_key)
);

CREATE INDEX IF NOT EXISTS tenant_email_webhook_jobs_ready_idx
    ON public.tenant_email_webhook_jobs (organizacion_id, status, available_at, id)
    WHERE status IN ('queued', 'processing');

CREATE OR REPLACE FUNCTION public.tenant_email_enqueue_webhook_job(
    p_organizacion_id uuid,
    p_server_id uuid,
    p_message_stream text,
    p_event_type text,
    p_event_key text,
    p_external_message_id text,
    p_webhook_trace_id text,
    p_payload jsonb
)
RETURNS TABLE (job_id uuid, created boolean, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF p_organizacion_id IS NULL OR p_server_id IS NULL OR btrim(p_event_key) = '' OR p_payload IS NULL THEN
        RAISE EXCEPTION 'postmark_webhook_job_invalid_input' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH inserted AS (
        INSERT INTO public.tenant_email_webhook_jobs (
            organizacion_id, server_id, message_stream, event_type, event_key,
            external_message_id, webhook_trace_id, payload
        ) VALUES (
            p_organizacion_id, p_server_id, p_message_stream, p_event_type, p_event_key,
            p_external_message_id, p_webhook_trace_id, p_payload
        )
        ON CONFLICT (organizacion_id, server_id, message_stream, event_type, event_key)
        DO NOTHING
        RETURNING id, true AS created, status
    )
    SELECT id, created, status FROM inserted
    UNION ALL
    SELECT j.id, false, j.status
    FROM public.tenant_email_webhook_jobs AS j
    WHERE j.organizacion_id = p_organizacion_id
      AND j.server_id = p_server_id
      AND j.message_stream = p_message_stream
      AND j.event_type = p_event_type
      AND j.event_key = p_event_key
      AND NOT EXISTS (SELECT 1 FROM inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_enqueue_webhook_job(uuid, uuid, text, text, text, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_enqueue_webhook_job(uuid, uuid, text, text, text, text, text, jsonb)
    TO service_role;

CREATE OR REPLACE FUNCTION public.tenant_email_claim_webhook_jobs(
    p_organizacion_id uuid,
    p_limit integer DEFAULT 25,
    p_stale_after_seconds integer DEFAULT 300
)
RETURNS SETOF public.tenant_email_webhook_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF p_limit < 1 OR p_limit > 100 OR p_stale_after_seconds < 60 OR p_stale_after_seconds > 86400 THEN
        RAISE EXCEPTION 'postmark_webhook_claim_invalid_input' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT j.id
        FROM public.tenant_email_webhook_jobs AS j
        WHERE j.organizacion_id = p_organizacion_id
          AND (
              (j.status = 'queued' AND j.available_at <= now())
              OR (j.status = 'processing' AND j.lease_until < now() - make_interval(secs => p_stale_after_seconds))
          )
        ORDER BY j.received_at, j.id
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.tenant_email_webhook_jobs AS j
    SET status = 'processing',
        attempt_count = j.attempt_count + 1,
        lease_until = now() + interval '5 minutes',
        updated_at = now()
    FROM candidates AS c
    WHERE j.id = c.id
    RETURNING j.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_claim_webhook_jobs(uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_claim_webhook_jobs(uuid, integer, integer)
    TO service_role;

CREATE OR REPLACE FUNCTION public.tenant_email_finish_webhook_job(
    p_job_id uuid,
    p_success boolean,
    p_error_code text DEFAULT NULL,
    p_error_message text DEFAULT NULL,
    p_retry_seconds integer DEFAULT 60
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    UPDATE public.tenant_email_webhook_jobs
    SET status = CASE
            WHEN p_success THEN 'processed'
            WHEN attempt_count >= max_attempts THEN 'failed'
            ELSE 'queued'
        END,
        available_at = CASE
            WHEN p_success OR attempt_count >= max_attempts THEN available_at
            ELSE now() + make_interval(secs => greatest(p_retry_seconds, 1))
        END,
        lease_until = NULL,
        processed_at = CASE WHEN p_success THEN now() ELSE processed_at END,
        last_error_code = CASE WHEN p_success THEN NULL ELSE left(p_error_code, 200) END,
        last_error_message = CASE WHEN p_success THEN NULL ELSE left(p_error_message, 2000) END,
        updated_at = now()
    WHERE id = p_job_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_finish_webhook_job(uuid, boolean, text, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_finish_webhook_job(uuid, boolean, text, text, integer)
    TO service_role;

ALTER TABLE public.tenant_email_delivery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_delivery_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_webhook_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_webhook_jobs FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tenant_email_delivery_batches IS
    'Bloques Postmark preparados fuera de la API, de hasta 500 mensajes homogéneos.';
COMMENT ON TABLE public.tenant_email_webhook_jobs IS
    'Cola durable de eventos Postmark recibidos por el endpoint público.';

COMMIT;
