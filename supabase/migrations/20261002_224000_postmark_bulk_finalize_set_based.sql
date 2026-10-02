-- Finaliza los resultados de Postmark en operaciones agrupadas. La versión
-- anterior invocaba lógica por envío dentro de un FOR y podía superar el
-- statement_timeout con un bloque de 500 mensajes, dejando el proveedor
-- aceptado pero Talia en estado procesando.

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
    v_updated_count integer := 0;
    v_log_count integer := 0;
    v_batch_count integer := 0;
    v_row_count integer := 0;
BEGIN
    IF p_organizacion_id IS NULL
       OR p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0
       OR jsonb_array_length(p_items) > 500 THEN
        RAISE EXCEPTION 'postmark_envios_bulk_invalid_input'
            USING ERRCODE = '22023';
    END IF;

    -- El JSON solamente transporta resultados validados por el worker.
    -- La información de negocio continúa en columnas explícitas.
    CREATE TEMP TABLE postmark_finalize_items (
        envio_id uuid PRIMARY KEY,
        update_payload jsonb NOT NULL,
        log_entry jsonb NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO postmark_finalize_items (envio_id, update_payload, log_entry)
    SELECT DISTINCT ON (NULLIF(item->>'envio_id', '')::uuid)
        NULLIF(item->>'envio_id', '')::uuid,
        item->'update_payload',
        CASE
            WHEN jsonb_typeof(item->'log_entry') = 'object' THEN item->'log_entry'
            ELSE '{}'::jsonb
        END
    FROM jsonb_array_elements(p_items) AS source(item)
    WHERE NULLIF(item->>'envio_id', '') IS NOT NULL
      AND jsonb_typeof(item->'update_payload') = 'object';

    IF NOT EXISTS (SELECT 1 FROM postmark_finalize_items) THEN
        RAISE EXCEPTION 'postmark_envios_bulk_missing_payload'
            USING ERRCODE = '22023';
    END IF;

    -- Evita recalcular totales por cada fila durante el UPDATE.
    PERFORM set_config('app.skip_prospecto_envio_totals', 'on', true);

    UPDATE public.prospeccion_contacto_envio AS e
    SET estado = COALESCE(NULLIF(i.update_payload->>'estado', ''), e.estado),
        detalle = CASE
            WHEN i.update_payload ? 'detalle' THEN COALESCE(i.update_payload->'detalle', '{}'::jsonb)
            ELSE e.detalle
        END,
        procesado_en = CASE
            WHEN i.update_payload ? 'procesado_en' THEN NULLIF(i.update_payload->>'procesado_en', '')::timestamptz
            ELSE e.procesado_en
        END,
        error = CASE
            WHEN i.update_payload ? 'error' THEN i.update_payload->>'error'
            ELSE e.error
        END,
        mensaje_id = CASE
            WHEN i.update_payload ? 'mensaje_id' THEN i.update_payload->>'mensaje_id'
            ELSE e.mensaje_id
        END,
        mensaje_id_interno = CASE
            WHEN i.update_payload ? 'mensaje_id_interno' THEN i.update_payload->>'mensaje_id_interno'
            ELSE e.mensaje_id_interno
        END,
        proveedor_aceptado_en = CASE
            WHEN i.update_payload ? 'proveedor_aceptado_en' THEN NULLIF(i.update_payload->>'proveedor_aceptado_en', '')::timestamptz
            ELSE e.proveedor_aceptado_en
        END,
        programado_en = CASE
            WHEN i.update_payload ? 'programado_en' THEN NULLIF(i.update_payload->>'programado_en', '')::timestamptz
            ELSE e.programado_en
        END
    FROM postmark_finalize_items AS i
    WHERE e.id = i.envio_id
      AND e.organizacion_id = p_organizacion_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    INSERT INTO public.prospeccion_contactos_log (
        prospecto_id, organizacion_id, canal, accion, estado, detalle,
        error, batch_id, envio_id
    )
    SELECT
        e.prospecto_id,
        p_organizacion_id,
        COALESCE(NULLIF(i.log_entry->>'canal', ''), 'correo'),
        COALESCE(NULLIF(i.log_entry->>'accion', ''), 'postmark_queued'),
        COALESCE(NULLIF(i.log_entry->>'estado', ''), i.update_payload->>'estado', 'enviado'),
        COALESCE(i.log_entry->'detalle', i.update_payload->'detalle', '{}'::jsonb),
        i.log_entry->>'error',
        e.batch_id,
        e.id
    FROM public.prospeccion_contacto_envio AS e
    JOIN postmark_finalize_items AS i ON i.envio_id = e.id
    WHERE e.organizacion_id = p_organizacion_id
      AND NOT EXISTS (
          SELECT 1
          FROM public.prospeccion_contactos_log AS l
          WHERE l.envio_id = e.id
            AND l.accion = COALESCE(NULLIF(i.log_entry->>'accion', ''), 'postmark_queued')
      );

    GET DIAGNOSTICS v_log_count = ROW_COUNT;

    WITH affected_batches AS (
        SELECT DISTINCT e.batch_id
        FROM public.prospeccion_contacto_envio AS e
        JOIN postmark_finalize_items AS i ON i.envio_id = e.id
        WHERE e.organizacion_id = p_organizacion_id
          AND e.batch_id IS NOT NULL
    ), batch_state AS (
        SELECT b.batch_id,
               bool_or(e.estado IN ('pendiente', 'procesando')) AS has_pending
        FROM affected_batches AS b
        JOIN public.prospeccion_contacto_envio AS e
          ON e.batch_id = b.batch_id
         AND e.organizacion_id = p_organizacion_id
        GROUP BY b.batch_id
    )
    UPDATE public.prospeccion_contacto_batch AS b
    SET estado = CASE WHEN s.has_pending THEN 'en_proceso' ELSE 'completado' END,
        finalizado_en = CASE WHEN s.has_pending THEN b.finalizado_en ELSE now() END
    FROM batch_state AS s
    WHERE b.id = s.batch_id
      AND b.organizacion_id = p_organizacion_id;

    GET DIAGNOSTICS v_batch_count = ROW_COUNT;

    -- Recalcula los contadores de prospectos afectados en una sola consulta.
    -- Esto conserva el resultado de la función anterior sin ejecutar una
    -- consulta completa independiente por cada prospecto.
    WITH affected_prospectos AS (
        SELECT DISTINCT e.prospecto_id
        FROM public.prospeccion_contacto_envio AS e
        JOIN postmark_finalize_items AS i ON i.envio_id = e.id
        WHERE e.organizacion_id = p_organizacion_id
          AND e.prospecto_id IS NOT NULL
    ), stats AS (
        SELECT
            e.prospecto_id,
            count(*) FILTER (
                WHERE lower(coalesce(e.canal, '')) = 'correo'
                  AND lower(coalesce(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
            )::bigint AS correo_total,
            count(*) FILTER (
                WHERE lower(coalesce(e.canal, '')) = 'whatsapp'
                  AND (e.proveedor_aceptado_en IS NOT NULL OR nullif(trim(e.mensaje_id), '') IS NOT NULL)
            )::bigint AS whatsapp_total,
            count(*) FILTER (
                WHERE lower(coalesce(e.canal, '')) IN ('llamada', 'voz', 'voice', 'call')
                  AND lower(coalesce(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
            )::bigint AS voz_total,
            count(*) FILTER (
                WHERE lower(coalesce(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
                   OR e.proveedor_aceptado_en IS NOT NULL
                   OR nullif(trim(e.mensaje_id), '') IS NOT NULL
            )::bigint AS total_envios
        FROM public.prospeccion_contacto_envio AS e
        JOIN affected_prospectos AS a ON a.prospecto_id = e.prospecto_id
        WHERE e.organizacion_id = p_organizacion_id
        GROUP BY e.prospecto_id
    )
    UPDATE public.prospeccion_prospectos AS p
    SET envios_correo_total = coalesce(s.correo_total, 0),
        envios_whatsapp_total = coalesce(s.whatsapp_total, 0),
        envios_voz_total = coalesce(s.voz_total, 0),
        envios_total = coalesce(s.total_envios, 0)
    FROM stats AS s
    WHERE p.organizacion_id = p_organizacion_id
      AND p.id = s.prospecto_id;

    RETURN QUERY SELECT v_updated_count, v_log_count, v_batch_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_finalize_postmark_envios_bulk(uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_finalize_postmark_envios_bulk(uuid, jsonb)
    TO service_role;
