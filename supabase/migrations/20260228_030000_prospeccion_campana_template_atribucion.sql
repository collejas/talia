CREATE OR REPLACE FUNCTION public.prospeccion_campana_template_atribucion(
    p_campana_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 200
)
RETURNS TABLE (
    campana_id uuid,
    campana_nombre text,
    canal text,
    template_id uuid,
    template_slug text,
    template_nombre text,
    envios_totales bigint,
    envios_enviados bigint,
    envios_entregados bigint,
    envios_fallidos bigint,
    envios_omitidos bigint,
    envios_respondidos bigint,
    brevo_aperturas bigint,
    brevo_clicks bigint,
    tasa_entrega_pct numeric(5,2),
    tasa_respuesta_pct numeric(5,2)
)
LANGUAGE sql
STABLE
AS $$
WITH envios_base AS (
    SELECT
        e.id AS envio_id,
        b.campana_id,
        b.organizacion_id,
        e.canal,
        lower(COALESCE(e.estado, 'pendiente')) AS estado,
        CASE
            WHEN COALESCE(e.payload->>'template_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN (e.payload->>'template_id')::uuid
            ELSE NULL
        END AS template_uuid,
        COALESCE(
            NULLIF(btrim(e.payload->'metadata'->>'template_slug'), ''),
            NULLIF(btrim(e.payload->>'template_slug'), '')
        ) AS template_slug
    FROM public.prospeccion_contacto_envio e
    JOIN public.prospeccion_contacto_batch b ON b.id = e.batch_id
    WHERE e.organizacion_id = public.usuario_organizacion_id(auth.uid())
      AND b.organizacion_id = public.usuario_organizacion_id(auth.uid())
      AND (p_campana_id IS NULL OR b.campana_id = p_campana_id)
),
respuesta_por_envio AS (
    SELECT
        l.envio_id,
        BOOL_OR(
            lower(COALESCE(l.accion, l.detalle->>'action', l.estado, '')) = ANY (
                ARRAY['respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound']
            )
            OR lower(COALESCE(l.detalle->>'direction', '')) = ANY (ARRAY['inbound', 'incoming'])
            OR COALESCE(l.detalle->>'respondio', '') = 'true'
            OR COALESCE(l.detalle->>'respuesta', '') <> ''
        ) AS respondio
    FROM public.prospeccion_contactos_log l
    WHERE l.organizacion_id = public.usuario_organizacion_id(auth.uid())
      AND l.envio_id IS NOT NULL
    GROUP BY l.envio_id
),
brevo_por_envio AS (
    SELECT
        l.envio_id,
        COUNT(*) FILTER (
            WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) IN ('opened', 'unique_opened')
        )::bigint AS aperturas,
        COUNT(*) FILTER (
            WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) IN ('click', 'unique_click')
        )::bigint AS clicks
    FROM public.prospeccion_contactos_log l
    WHERE l.organizacion_id = public.usuario_organizacion_id(auth.uid())
      AND l.envio_id IS NOT NULL
      AND l.canal = 'correo'
    GROUP BY l.envio_id
)
SELECT
    eb.campana_id,
    c.nombre AS campana_nombre,
    eb.canal,
    eb.template_uuid AS template_id,
    COALESCE(t.slug, eb.template_slug) AS template_slug,
    COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre') AS template_nombre,
    COUNT(*)::bigint AS envios_totales,
    COUNT(*) FILTER (WHERE eb.estado IN ('enviado', 'entregado'))::bigint AS envios_enviados,
    COUNT(*) FILTER (WHERE eb.estado = 'entregado')::bigint AS envios_entregados,
    COUNT(*) FILTER (WHERE eb.estado IN ('fallido', 'error', 'failed', 'undelivered'))::bigint AS envios_fallidos,
    COUNT(*) FILTER (WHERE eb.estado = 'omitido')::bigint AS envios_omitidos,
    COUNT(*) FILTER (WHERE COALESCE(r.respondio, FALSE))::bigint AS envios_respondidos,
    COALESCE(SUM(bp.aperturas), 0)::bigint AS brevo_aperturas,
    COALESCE(SUM(bp.clicks), 0)::bigint AS brevo_clicks,
    CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE eb.estado = 'entregado')::numeric * 100.0) / COUNT(*)::numeric, 2)
    END AS tasa_entrega_pct,
    CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE COALESCE(r.respondio, FALSE))::numeric * 100.0) / COUNT(*)::numeric, 2)
    END AS tasa_respuesta_pct
FROM envios_base eb
LEFT JOIN public.campanas c ON c.id = eb.campana_id
LEFT JOIN public.prospeccion_contacto_templates t
    ON t.organizacion_id = eb.organizacion_id
   AND t.id = eb.template_uuid
LEFT JOIN respuesta_por_envio r ON r.envio_id = eb.envio_id
LEFT JOIN brevo_por_envio bp ON bp.envio_id = eb.envio_id
GROUP BY eb.campana_id, c.nombre, eb.canal, eb.template_uuid, COALESCE(t.slug, eb.template_slug), COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre')
ORDER BY envios_totales DESC, campana_nombre NULLS LAST, template_nombre
LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_campana_template_atribucion(uuid, integer) TO authenticated;
