-- Inserta los envios operativos de Postmark sin disparar el recalculo de
-- contadores por fila. Los contadores de los prospectos afectados se
-- reconstruyen una sola vez al terminar el bloque.

CREATE OR REPLACE FUNCTION public.worker_insert_postmark_contact_envios_bulk(
    p_organizacion_id uuid,
    p_entries jsonb
)
RETURNS TABLE (
    id uuid,
    batch_id uuid,
    prospecto_id uuid,
    canal text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
    IF p_organizacion_id IS NULL
       OR p_entries IS NULL
       OR jsonb_typeof(p_entries) <> 'array'
       OR jsonb_array_length(p_entries) = 0
       OR jsonb_array_length(p_entries) > 500 THEN
        RAISE EXCEPTION 'postmark_contact_envios_bulk_invalid_input'
            USING ERRCODE = '22023';
    END IF;

    CREATE TEMP TABLE postmark_inserted_contact_envios (
        inserted_id uuid PRIMARY KEY,
        inserted_batch_id uuid NOT NULL,
        inserted_prospecto_id uuid NOT NULL,
        inserted_canal text NOT NULL
    ) ON COMMIT DROP;

    -- El trigger existente respeta esta bandera. Así se evita ejecutar un
    -- SELECT completo de totales por cada fila del bloque.
    PERFORM set_config('app.skip_prospecto_envio_totals', 'on', true);

    WITH input_rows AS (
        SELECT DISTINCT ON (
            NULLIF(item->>'batch_id', '')::uuid,
            NULLIF(item->>'prospecto_id', '')::uuid,
            COALESCE(NULLIF(item->>'canal', ''), 'correo')
        )
            NULLIF(item->>'batch_id', '')::uuid AS batch_id,
            NULLIF(item->>'prospecto_id', '')::uuid AS prospecto_id,
            COALESCE(NULLIF(item->>'canal', ''), 'correo') AS canal,
            COALESCE(NULLIF(item->>'payload', '')::jsonb, '{}'::jsonb) AS payload,
            COALESCE(NULLIF(item->>'detalle', '')::jsonb, '{}'::jsonb) AS detalle,
            COALESCE(NULLIF(item->>'programado_en', '')::timestamptz, now()) AS programado_en,
            NULLIF(item->>'lote_programado_en', '')::timestamptz AS lote_programado_en,
            NULLIF(item->>'plantilla_id', '')::uuid AS plantilla_id,
            NULLIF(item->>'version_id', '')::uuid AS version_id,
            GREATEST(COALESCE(NULLIF(item->>'numero_lote', '')::integer, 1), 1) AS numero_lote
        FROM jsonb_array_elements(p_entries) AS source(item)
        WHERE NULLIF(item->>'batch_id', '') IS NOT NULL
          AND NULLIF(item->>'prospecto_id', '') IS NOT NULL
    ), inserted AS (
        INSERT INTO public.prospeccion_contacto_envio (
            batch_id, prospecto_id, canal, payload, detalle, programado_en,
            organizacion_id, plantilla_id, version_id, numero_lote,
            lote_programado_en
        )
        SELECT
            i.batch_id, i.prospecto_id, i.canal, i.payload, i.detalle,
            i.programado_en, p_organizacion_id, i.plantilla_id, i.version_id,
            i.numero_lote, i.lote_programado_en
        FROM input_rows AS i
        ON CONFLICT (batch_id, prospecto_id, canal) DO NOTHING
        RETURNING public.prospeccion_contacto_envio.id,
                  public.prospeccion_contacto_envio.batch_id,
                  public.prospeccion_contacto_envio.prospecto_id,
                  public.prospeccion_contacto_envio.canal
    )
    INSERT INTO postmark_inserted_contact_envios (
        inserted_id, inserted_batch_id, inserted_prospecto_id, inserted_canal
    )
    SELECT inserted.id, inserted.batch_id, inserted.prospecto_id, inserted.canal
    FROM inserted;

    -- Un solo recálculo para todos los prospectos del bloque.
    WITH stats AS (
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
        JOIN (
            SELECT DISTINCT i.inserted_prospecto_id
            FROM postmark_inserted_contact_envios AS i
        ) AS affected
          ON affected.inserted_prospecto_id = e.prospecto_id
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

    RETURN QUERY
    SELECT i.inserted_id, i.inserted_batch_id, i.inserted_prospecto_id, i.inserted_canal
    FROM postmark_inserted_contact_envios AS i
    ORDER BY i.inserted_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_insert_postmark_contact_envios_bulk(uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_insert_postmark_contact_envios_bulk(uuid, jsonb)
    TO service_role;
