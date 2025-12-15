BEGIN;

DROP VIEW IF EXISTS public.prospeccion_prospecto_contacto_stats;

CREATE VIEW public.prospeccion_prospecto_contacto_stats
WITH (security_barrier = true) AS
WITH envios AS (
    SELECT
        e.prospecto_id,
        e.organizacion_id,
        e.canal,
        LOWER(COALESCE(e.estado, 'pendiente')) AS estado,
        COALESCE(e.procesado_en, e.programado_en, e.creado_en) AS actividad_en
    FROM public.prospeccion_contacto_envio AS e
),
canal_stats AS (
    SELECT
        prospecto_id,
        organizacion_id,
        canal,
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (
            WHERE estado IN ('pendiente', 'procesando', 'en_proceso')
        )::bigint AS pendientes,
        COUNT(*) FILTER (
            WHERE estado IN ('enviado', 'entregado', 'leido', 'completado', 'procesando', 'en_proceso', 'answered', 'completed', 'completed-with-recording')
        )::bigint AS exitosos,
        COUNT(*) FILTER (
            WHERE estado IN ('error', 'fallido', 'failed', 'undelivered', 'no-answer', 'canceled', 'cancelado')
        )::bigint AS fallidos,
        COUNT(*) FILTER (WHERE estado = 'omitido')::bigint AS omitidos,
        COUNT(*) FILTER (WHERE estado = 'cancelado')::bigint AS cancelados,
        MAX(actividad_en) AS ultima_actividad_en,
        (
            ARRAY_AGG(estado ORDER BY actividad_en DESC NULLS LAST)
        )[1] AS ultimo_estado
    FROM envios
    GROUP BY prospecto_id, organizacion_id, canal
),
grouped AS (
    SELECT
        prospecto_id,
        organizacion_id,
        jsonb_object_agg(
            canal,
            jsonb_build_object(
                'total', total,
                'pendientes', pendientes,
                'exitosos', exitosos,
                'fallidos', fallidos,
                'omitidos', omitidos,
                'cancelados', cancelados,
                'ultimo_estado', ultimo_estado,
                'ultima_actividad_en', ultima_actividad_en
            )
            ORDER BY canal
        ) AS canales,
        SUM(total)::bigint AS total_envios,
        MAX(ultima_actividad_en) AS ultimo_contacto_en
    FROM canal_stats
    GROUP BY prospecto_id, organizacion_id
),
respuestas AS (
    SELECT
        prospecto_id,
        COUNT(*)::bigint AS total_respuestas,
        MAX(creado_en) AS ultima_respuesta_en
    FROM public.prospeccion_contactos_log
    WHERE prospecto_id IS NOT NULL
      AND (
          LOWER(COALESCE(accion, detalle->> 'action', estado, '')) IN ('respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound')
          OR LOWER(COALESCE(detalle->> 'direction', '')) IN ('inbound', 'incoming')
          OR COALESCE(detalle->> 'respondio', '') = 'true'
          OR COALESCE(detalle->> 'respuesta', '') <> ''
      )
    GROUP BY prospecto_id
)
SELECT
    g.prospecto_id,
    g.organizacion_id,
    g.canales,
    g.total_envios,
    g.ultimo_contacto_en,
    COALESCE(r.total_respuestas, 0)::bigint AS total_respuestas,
    (COALESCE(r.total_respuestas, 0) > 0) AS respondio,
    r.ultima_respuesta_en
FROM grouped AS g
LEFT JOIN respuestas AS r ON r.prospecto_id = g.prospecto_id;

COMMENT ON VIEW public.prospeccion_prospecto_contacto_stats IS
    'Conteo agregado de envíos y respuestas por prospecto/canal para la vista de prospección.';

GRANT SELECT ON public.prospeccion_prospecto_contacto_stats TO authenticated;
GRANT SELECT ON public.prospeccion_prospecto_contacto_stats TO service_role;

COMMIT;
