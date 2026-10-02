-- Corrige la referencia ambigua a estado en la sincronizacion de preparacion
-- Postmark. La columna de la tabla debe prevalecer sobre la salida/variable
-- homonima de la funcion.

CREATE OR REPLACE FUNCTION public.tenant_sync_postmark_campaign_preparation(
    p_organizacion_id uuid,
    p_batch_id uuid
)
RETURNS TABLE (
    total integer,
    preparados integer,
    fallidos integer,
    pendientes integer,
    estado text
)
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
        WHEN v_fallidos > 0 AND v_preparados = 0 THEN 'fallida'
        ELSE 'completada'
    END;

    UPDATE public.prospeccion_contacto_batch AS b
    SET preparacion_estado = v_estado,
        preparacion_total = v_total,
        preparacion_preparados = v_preparados,
        preparacion_fallidos = v_fallidos,
        preparacion_iniciada_en = COALESCE(b.preparacion_iniciada_en, now()),
        preparacion_finalizada_en = CASE
            WHEN v_pendientes = 0 THEN now()
            ELSE b.preparacion_finalizada_en
        END,
        preparacion_error = CASE
            WHEN v_fallidos > 0 THEN 'postmark_target_preparation_failed'
            ELSE NULL
        END,
        estado = CASE
            WHEN v_pendientes > 0 THEN 'en_proceso'
            ELSE b.estado
        END
    WHERE b.id = p_batch_id
      AND b.organizacion_id = p_organizacion_id;

    RETURN QUERY SELECT v_total, v_preparados, v_fallidos, v_pendientes, v_estado;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_sync_postmark_campaign_preparation(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_sync_postmark_campaign_preparation(uuid, uuid)
    TO service_role;

