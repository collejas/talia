-- Los filtros de Prospectos deben considerar como "con envío" únicamente un
-- envío que llegó a un estado exitoso. Los errores, pendientes y omitidos no
-- deben ocultar al prospecto en "sin envío".

CREATE OR REPLACE FUNCTION public.sync_prospeccion_prospectos_envio_totales(
    p_organizacion_id uuid,
    p_prospecto_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
    IF p_organizacion_id IS NULL OR p_prospecto_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.prospeccion_prospectos p
    SET envios_correo_total = COALESCE(s.correo_total, 0),
        envios_whatsapp_total = COALESCE(s.whatsapp_total, 0),
        envios_voz_total = COALESCE(s.voz_total, 0),
        envios_total = COALESCE(s.total_envios, 0)
    FROM (
        SELECT
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) = 'correo'
                  AND LOWER(COALESCE(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
            )::bigint AS correo_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) = 'whatsapp'
                  AND (e.proveedor_aceptado_en IS NOT NULL OR NULLIF(TRIM(e.mensaje_id), '') IS NOT NULL)
            )::bigint AS whatsapp_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.canal, '')) IN ('llamada', 'voz', 'voice', 'call')
                  AND LOWER(COALESCE(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
            )::bigint AS voz_total,
            COUNT(*) FILTER (
                WHERE LOWER(COALESCE(e.estado, '')) IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
                   OR e.proveedor_aceptado_en IS NOT NULL
                   OR NULLIF(TRIM(e.mensaje_id), '') IS NOT NULL
            )::bigint AS total_envios
        FROM public.prospeccion_contacto_envio e
        WHERE e.organizacion_id = p_organizacion_id
          AND e.prospecto_id = p_prospecto_id
    ) AS s
    WHERE p.organizacion_id = p_organizacion_id
      AND p.id = p_prospecto_id;
END;
$function$;

COMMENT ON FUNCTION public.sync_prospeccion_prospectos_envio_totales(uuid, uuid)
    IS 'Sincroniza contadores visibles con envíos exitosos/aceptados; excluye errores, pendientes, omitidos y cancelados.';

CREATE OR REPLACE VIEW public.prospeccion_prospecto_contacto_stats AS
WITH envios AS (
    SELECT
        e.prospecto_id,
        e.organizacion_id,
        e.canal,
        lower(COALESCE(e.estado, 'pendiente')) AS estado,
        e.proveedor_aceptado_en,
        NULLIF(trim(e.mensaje_id), '') AS mensaje_id,
        COALESCE(e.procesado_en, e.programado_en, e.creado_en) AS actividad_en
    FROM public.prospeccion_contacto_envio e
), canal_stats AS (
    SELECT
        envios.prospecto_id,
        envios.organizacion_id,
        envios.canal,
        count(*) FILTER (
            WHERE envios.estado IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
               OR envios.proveedor_aceptado_en IS NOT NULL
               OR envios.mensaje_id IS NOT NULL
        ) AS total,
        count(*) FILTER (WHERE envios.estado IN ('pendiente', 'procesando', 'en_proceso')) AS pendientes,
        count(*) FILTER (
            WHERE envios.estado IN ('enviado', 'entregado', 'leido', 'completado', 'respondido', 'answered', 'completed', 'completed-with-recording')
               OR envios.proveedor_aceptado_en IS NOT NULL
               OR envios.mensaje_id IS NOT NULL
        ) AS exitosos,
        count(*) FILTER (WHERE envios.estado IN ('error', 'fallido', 'failed', 'undelivered', 'no-answer', 'canceled', 'cancelado')) AS fallidos,
        count(*) FILTER (WHERE envios.estado = 'omitido') AS omitidos,
        count(*) FILTER (WHERE envios.estado = 'cancelado') AS cancelados,
        max(envios.actividad_en) AS ultima_actividad_en,
        (array_agg(envios.estado ORDER BY envios.actividad_en DESC NULLS LAST))[1] AS ultimo_estado
    FROM envios
    GROUP BY envios.prospecto_id, envios.organizacion_id, envios.canal
), grouped AS (
    SELECT
        canal_stats.prospecto_id,
        canal_stats.organizacion_id,
        jsonb_object_agg(
            canal_stats.canal,
            jsonb_build_object(
                'total', canal_stats.total,
                'pendientes', canal_stats.pendientes,
                'exitosos', canal_stats.exitosos,
                'fallidos', canal_stats.fallidos,
                'omitidos', canal_stats.omitidos,
                'cancelados', canal_stats.cancelados,
                'ultimo_estado', canal_stats.ultimo_estado,
                'ultima_actividad_en', canal_stats.ultima_actividad_en
            ) ORDER BY canal_stats.canal
        ) AS canales,
        sum(canal_stats.total)::bigint AS total_envios,
        max(canal_stats.ultima_actividad_en) AS ultimo_contacto_en
    FROM canal_stats
    GROUP BY canal_stats.prospecto_id, canal_stats.organizacion_id
), respuestas AS (
    SELECT
        l.prospecto_id,
        count(*) AS total_respuestas,
        max(l.creado_en) AS ultima_respuesta_en
    FROM public.prospeccion_contactos_log l
    WHERE l.prospecto_id IS NOT NULL
      AND (
          lower(COALESCE(l.accion, l.detalle ->> 'action', l.estado, '')) IN ('respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound')
          OR lower(COALESCE(l.detalle ->> 'direction', '')) IN ('inbound', 'incoming')
          OR COALESCE(l.detalle ->> 'respondio', '') = 'true'
          OR COALESCE(l.detalle ->> 'respuesta', '') <> ''
      )
    GROUP BY l.prospecto_id
)
SELECT
    g.prospecto_id,
    g.organizacion_id,
    g.canales,
    g.total_envios,
    g.ultimo_contacto_en,
    COALESCE(r.total_respuestas, 0::bigint) AS total_respuestas,
    COALESCE(r.total_respuestas, 0::bigint) > 0 AS respondio,
    r.ultima_respuesta_en
FROM grouped g
LEFT JOIN respuestas r ON r.prospecto_id = g.prospecto_id;
