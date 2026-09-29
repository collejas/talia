-- Evita recalcular toda la vista agregada de envios/logs para cada pagina del
-- listado de prospectos. La consulta queda limitada al tenant y a los IDs
-- visibles solicitados por el panel.
CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_prospecto_canal_idx
    ON public.prospeccion_contacto_envio (organizacion_id, prospecto_id, canal);

CREATE INDEX IF NOT EXISTS prospeccion_contactos_log_org_prospecto_creado_idx
    ON public.prospeccion_contactos_log (organizacion_id, prospecto_id, creado_en DESC)
    WHERE prospecto_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prospeccion_contacto_indicadores_por_ids(
    p_prospecto_ids uuid[]
)
RETURNS TABLE (
    prospecto_id uuid,
    canales jsonb,
    total_envios bigint,
    ultimo_contacto_en timestamptz,
    total_respuestas bigint,
    respondio boolean,
    ultima_respuesta_en timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
WITH contexto_org AS (
    SELECT public.usuario_organizacion_id(auth.uid()) AS organizacion_id
), ids AS (
    SELECT DISTINCT value AS prospecto_id
    FROM unnest(COALESCE(p_prospecto_ids, '{}'::uuid[])) AS value
    WHERE value IS NOT NULL
), envios AS (
    SELECT
        e.prospecto_id,
        e.canal,
        lower(COALESCE(e.estado, 'pendiente')) AS estado,
        COALESCE(e.procesado_en, e.programado_en, e.creado_en) AS actividad_en
    FROM public.prospeccion_contacto_envio e
    JOIN ids ON ids.prospecto_id = e.prospecto_id
    CROSS JOIN contexto_org co
    WHERE e.organizacion_id = co.organizacion_id
), canal_stats AS (
    SELECT
        e.prospecto_id,
        e.canal,
        count(*)::bigint AS total,
        count(*) FILTER (WHERE e.estado IN ('pendiente', 'procesando', 'en_proceso'))::bigint AS pendientes,
        count(*) FILTER (WHERE e.estado IN ('enviado', 'entregado', 'leido', 'completado', 'procesando', 'en_proceso', 'answered', 'completed', 'completed-with-recording'))::bigint AS exitosos,
        count(*) FILTER (WHERE e.estado IN ('error', 'fallido', 'failed', 'undelivered', 'no-answer', 'canceled', 'cancelado'))::bigint AS fallidos,
        count(*) FILTER (WHERE e.estado = 'omitido')::bigint AS omitidos,
        count(*) FILTER (WHERE e.estado = 'cancelado')::bigint AS cancelados,
        max(e.actividad_en) AS ultima_actividad_en,
        (array_agg(e.estado ORDER BY e.actividad_en DESC NULLS LAST))[1] AS ultimo_estado
    FROM envios e
    GROUP BY e.prospecto_id, e.canal
), grouped AS (
    SELECT
        c.prospecto_id,
        jsonb_object_agg(
            c.canal,
            jsonb_build_object(
                'total', c.total,
                'pendientes', c.pendientes,
                'exitosos', c.exitosos,
                'fallidos', c.fallidos,
                'omitidos', c.omitidos,
                'cancelados', c.cancelados,
                'ultimo_estado', c.ultimo_estado,
                'ultima_actividad_en', c.ultima_actividad_en
            ) ORDER BY c.canal
        ) AS canales,
        sum(c.total)::bigint AS total_envios,
        max(c.ultima_actividad_en) AS ultimo_contacto_en
    FROM canal_stats c
    GROUP BY c.prospecto_id
), respuestas AS (
    SELECT
        l.prospecto_id,
        count(*)::bigint AS total_respuestas,
        max(l.creado_en) AS ultima_respuesta_en
    FROM public.prospeccion_contactos_log l
    JOIN ids ON ids.prospecto_id = l.prospecto_id
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
      AND (
        lower(COALESCE(l.accion, l.detalle->>'action', l.estado, '')) IN ('respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound')
        OR lower(COALESCE(l.detalle->>'direction', '')) IN ('inbound', 'incoming')
        OR COALESCE(l.detalle->>'respondio', '') = 'true'
        OR COALESCE(l.detalle->>'respuesta', '') <> ''
      )
    GROUP BY l.prospecto_id
)
SELECT
    g.prospecto_id,
    g.canales,
    g.total_envios,
    g.ultimo_contacto_en,
    COALESCE(r.total_respuestas, 0)::bigint,
    COALESCE(r.total_respuestas, 0) > 0,
    r.ultima_respuesta_en
FROM grouped g
LEFT JOIN respuestas r ON r.prospecto_id = g.prospecto_id
ORDER BY g.prospecto_id;
$function$;

REVOKE ALL ON FUNCTION public.prospeccion_contacto_indicadores_por_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prospeccion_contacto_indicadores_por_ids(uuid[]) TO authenticated;
