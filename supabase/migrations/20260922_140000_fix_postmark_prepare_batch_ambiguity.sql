BEGIN;

-- La función devuelve columnas llamadas message_kind/message_stream. El
-- target de ON CONFLICT debe usar la constraint explícita para que PL/pgSQL
-- no confunda esos nombres con variables de salida.
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

    SELECT b.estado INTO v_batch_state
    FROM public.prospeccion_contacto_batch AS b
    WHERE b.id = p_source_batch_id
      AND b.organizacion_id = p_organizacion_id;

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
    ON CONFLICT ON CONSTRAINT tenant_email_delivery_batches_unique
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

COMMIT;
