BEGIN;

-- El arreglo sólo es transporte temporal de resultados ya validados por el
-- worker. La información estructural permanece en las tablas y columnas
-- explícitas de tenant_email_message_attempts y tenant_email_messages.
CREATE OR REPLACE FUNCTION public.tenant_email_finish_attempts_bulk(
    p_organizacion_id uuid,
    p_items jsonb
)
RETURNS TABLE (
    message_id uuid,
    message_status text,
    updated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_item jsonb;
    v_message_id uuid;
    v_attempt_id uuid;
    v_accepted boolean;
    v_external_message_id uuid;
    v_error_code text;
    v_error_message text;
    v_status text;
    v_updated boolean;
BEGIN
    IF p_organizacion_id IS NULL
       OR p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0
       OR jsonb_array_length(p_items) > 500 THEN
        RAISE EXCEPTION 'email_finish_attempts_bulk_invalid_input'
            USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        BEGIN
            v_message_id := NULLIF(v_item->>'message_id', '')::uuid;
            v_attempt_id := NULLIF(v_item->>'attempt_id', '')::uuid;
            v_accepted := COALESCE((v_item->>'accepted')::boolean, false);
            v_external_message_id := NULLIF(v_item->>'external_message_id', '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'email_finish_attempts_bulk_invalid_item'
                USING ERRCODE = '22023';
        END;

        IF v_message_id IS NULL OR v_attempt_id IS NULL THEN
            RAISE EXCEPTION 'email_finish_attempts_bulk_missing_ids'
                USING ERRCODE = '22023';
        END IF;

        v_error_code := NULLIF(left(v_item->>'error_code', 200), '');
        v_error_message := NULLIF(left(v_item->>'error_message', 2000), '');

        SELECT f.message_status, f.updated
        INTO v_status, v_updated
        FROM public.tenant_email_finish_attempt(
            p_organizacion_id,
            v_message_id,
            v_attempt_id,
            v_accepted,
            v_external_message_id,
            v_error_code,
            v_error_message
        ) AS f;

        RETURN QUERY SELECT v_message_id, v_status, v_updated;
    END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_finish_attempts_bulk(uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_finish_attempts_bulk(uuid, jsonb)
    TO service_role;

COMMENT ON FUNCTION public.tenant_email_finish_attempts_bulk IS
    'Cierra hasta 500 intentos Postmark en una transaccion idempotente.';

CREATE OR REPLACE FUNCTION public.worker_finalize_postmark_envios_bulk(
    p_organizacion_id uuid,
    p_items jsonb
)
RETURNS TABLE (
    updated_count integer,
    log_count integer,
    batch_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_item jsonb;
    v_update jsonb;
    v_log jsonb;
    v_envio_id uuid;
    v_batch_id uuid;
    v_prospecto_id uuid;
    v_updated_count integer := 0;
    v_log_count integer := 0;
    v_batch_count integer := 0;
    v_row_count integer;
    v_pending integer;
    v_batch_ids uuid[] := ARRAY[]::uuid[];
BEGIN
    IF p_organizacion_id IS NULL
       OR p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0
       OR jsonb_array_length(p_items) > 500 THEN
        RAISE EXCEPTION 'postmark_envios_bulk_invalid_input'
            USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        BEGIN
            v_envio_id := NULLIF(v_item->>'envio_id', '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'postmark_envios_bulk_invalid_item'
                USING ERRCODE = '22023';
        END;
        IF v_envio_id IS NULL OR jsonb_typeof(v_item->'update_payload') <> 'object' THEN
            RAISE EXCEPTION 'postmark_envios_bulk_missing_payload'
                USING ERRCODE = '22023';
        END IF;

        v_update := v_item->'update_payload';
        v_log := CASE
            WHEN jsonb_typeof(v_item->'log_entry') = 'object' THEN v_item->'log_entry'
            ELSE '{}'::jsonb
        END;

        UPDATE public.prospeccion_contacto_envio AS e
        SET estado = COALESCE(NULLIF(v_update->>'estado', ''), e.estado),
            detalle = CASE
                WHEN v_update ? 'detalle' THEN COALESCE(v_update->'detalle', '{}'::jsonb)
                ELSE e.detalle
            END,
            procesado_en = CASE
                WHEN v_update ? 'procesado_en' THEN NULLIF(v_update->>'procesado_en', '')::timestamptz
                ELSE e.procesado_en
            END,
            error = CASE
                WHEN v_update ? 'error' THEN v_update->>'error'
                ELSE e.error
            END,
            mensaje_id = CASE
                WHEN v_update ? 'mensaje_id' THEN v_update->>'mensaje_id'
                ELSE e.mensaje_id
            END,
            mensaje_id_interno = CASE
                WHEN v_update ? 'mensaje_id_interno' THEN v_update->>'mensaje_id_interno'
                ELSE e.mensaje_id_interno
            END,
            proveedor_aceptado_en = CASE
                WHEN v_update ? 'proveedor_aceptado_en' THEN NULLIF(v_update->>'proveedor_aceptado_en', '')::timestamptz
                ELSE e.proveedor_aceptado_en
            END,
            programado_en = CASE
                WHEN v_update ? 'programado_en' THEN NULLIF(v_update->>'programado_en', '')::timestamptz
                ELSE e.programado_en
            END
        WHERE e.id = v_envio_id
          AND e.organizacion_id = p_organizacion_id;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_updated_count := v_updated_count + v_row_count;

        IF v_row_count > 0 THEN
            SELECT e.prospecto_id, e.batch_id
            INTO v_prospecto_id, v_batch_id
            FROM public.prospeccion_contacto_envio AS e
            WHERE e.id = v_envio_id
              AND e.organizacion_id = p_organizacion_id;

            IF v_batch_id IS NOT NULL AND NOT v_batch_id = ANY(v_batch_ids) THEN
                v_batch_ids := array_append(v_batch_ids, v_batch_id);
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.prospeccion_contactos_log AS l
                WHERE l.envio_id = v_envio_id
                  AND l.accion = COALESCE(NULLIF(v_log->>'accion', ''), 'postmark_queued')
            ) THEN
                INSERT INTO public.prospeccion_contactos_log (
                    prospecto_id, organizacion_id, canal, accion, estado, detalle,
                    error, batch_id, envio_id
                )
                VALUES (
                    v_prospecto_id,
                    p_organizacion_id,
                    COALESCE(NULLIF(v_log->>'canal', ''), 'correo'),
                    COALESCE(NULLIF(v_log->>'accion', ''), 'postmark_queued'),
                    COALESCE(NULLIF(v_log->>'estado', ''), v_update->>'estado', 'enviado'),
                    COALESCE(v_log->'detalle', v_update->'detalle', '{}'::jsonb),
                    v_log->>'error',
                    v_batch_id,
                    v_envio_id
                );
                v_log_count := v_log_count + 1;
            END IF;
        END IF;
    END LOOP;

    FOREACH v_batch_id IN ARRAY v_batch_ids
    LOOP
        SELECT count(*)::integer INTO v_pending
        FROM public.prospeccion_contacto_envio AS e
        WHERE e.batch_id = v_batch_id
          AND e.organizacion_id = p_organizacion_id
          AND e.estado IN ('pendiente', 'procesando');

        IF v_pending > 0 THEN
            UPDATE public.prospeccion_contacto_batch
            SET estado = 'en_proceso'
            WHERE id = v_batch_id
              AND organizacion_id = p_organizacion_id;
        ELSE
            UPDATE public.prospeccion_contacto_batch
            SET estado = 'completado', finalizado_en = now()
            WHERE id = v_batch_id
              AND organizacion_id = p_organizacion_id;
        END IF;
        v_batch_count := v_batch_count + 1;
    END LOOP;

    RETURN QUERY SELECT v_updated_count, v_log_count, v_batch_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_finalize_postmark_envios_bulk(uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_finalize_postmark_envios_bulk(uuid, jsonb)
    TO service_role;

COMMENT ON FUNCTION public.worker_finalize_postmark_envios_bulk IS
    'Finaliza hasta 500 envios Postmark, bitacoras y lotes en una transaccion.';

COMMIT;
