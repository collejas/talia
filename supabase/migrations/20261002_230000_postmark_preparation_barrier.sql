-- Postmark: la preparacion debe terminar antes de que el sender consuma
-- los envios operativos. El bulk insert no recalcula contadores: insertar
-- pendientes no es un envio aceptado y ese recalculo no debe bloquear el lote.

CREATE OR REPLACE FUNCTION public.worker_insert_postmark_contact_envios_bulk(
    p_organizacion_id uuid,
    p_entries jsonb
)
RETURNS TABLE (id uuid, batch_id uuid, prospecto_id uuid, canal text)
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

    RETURN QUERY
    SELECT i.inserted_id, i.inserted_batch_id, i.inserted_prospecto_id, i.inserted_canal
    FROM postmark_inserted_contact_envios AS i
    ORDER BY i.inserted_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tenant_sync_postmark_campaign_preparation(
    p_organizacion_id uuid,
    p_batch_id uuid
)
RETURNS TABLE(total integer, preparados integer, fallidos integer, pendientes integer, estado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_total integer;
    v_preparados integer;
    v_fallidos integer;
    v_pendientes integer;
    v_estado text;
BEGIN
    SELECT
        count(*)::integer,
        count(*) FILTER (WHERE t.status = 'preparado')::integer,
        count(*) FILTER (WHERE t.status = 'fallido')::integer,
        count(*) FILTER (WHERE t.status IN ('pendiente', 'procesando'))::integer
    INTO v_total, v_preparados, v_fallidos, v_pendientes
    FROM public.prospeccion_postmark_campaign_targets AS t
    WHERE t.organizacion_id = p_organizacion_id
      AND t.batch_id = p_batch_id;

    v_estado := CASE
        WHEN v_pendientes > 0 THEN 'procesando'
        WHEN v_fallidos > 0 AND v_preparados > 0 THEN 'parcial'
        WHEN v_fallidos > 0 THEN 'fallida'
        ELSE 'completada'
    END;

    UPDATE public.prospeccion_contacto_batch AS b
    SET preparacion_estado = v_estado,
        preparacion_total = v_total,
        preparacion_preparados = v_preparados,
        preparacion_fallidos = v_fallidos,
        preparacion_iniciada_en = COALESCE(b.preparacion_iniciada_en, now()),
        preparacion_finalizada_en = CASE
            WHEN v_pendientes = 0 AND v_fallidos = 0 THEN now()
            ELSE NULL
        END,
        preparacion_error = CASE
            WHEN v_fallidos > 0 THEN 'postmark_target_preparation_failed'
            ELSE NULL
        END,
        estado = CASE
            WHEN v_pendientes > 0 OR v_fallidos > 0 THEN 'en_proceso'
            ELSE b.estado
        END
    WHERE b.id = p_batch_id
      AND b.organizacion_id = p_organizacion_id;

    RETURN QUERY SELECT v_total, v_preparados, v_fallidos, v_pendientes, v_estado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.worker_list_pending_postmark_envios(
    p_organizacion_ids uuid[],
    p_limit integer DEFAULT 25
)
RETURNS SETOF public.prospeccion_contacto_envio
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $function$
    SELECT e.*
    FROM public.prospeccion_contacto_envio AS e
    LEFT JOIN public.prospeccion_contacto_batch AS b
      ON b.id = e.batch_id
     AND b.organizacion_id = e.organizacion_id
    WHERE e.canal = 'correo'
      AND e.estado = 'pendiente'
      AND e.programado_en <= now()
      AND e.organizacion_id = ANY(p_organizacion_ids)
      AND (
          e.batch_id IS NULL
          OR (
              b.preparacion_estado IN ('completada', 'no_requerida')
              AND COALESCE(b.preparacion_fallidos, 0) = 0
          )
      )
    ORDER BY e.programado_en ASC, e.id ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 500);
$function$;

REVOKE ALL ON FUNCTION public.worker_insert_postmark_contact_envios_bulk(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_insert_postmark_contact_envios_bulk(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.tenant_sync_postmark_campaign_preparation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_sync_postmark_campaign_preparation(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.worker_list_pending_postmark_envios(uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_list_pending_postmark_envios(uuid[], integer) TO service_role;
