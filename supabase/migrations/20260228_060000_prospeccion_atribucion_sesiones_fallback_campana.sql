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
    sesiones_utm bigint,
    tasa_entrega_pct numeric(5,2),
    tasa_respuesta_pct numeric(5,2),
    click_to_session_pct numeric(5,2)
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
        lower(
            COALESCE(
                NULLIF(btrim(e.payload->'metadata'->>'template_slug'), ''),
                NULLIF(btrim(e.payload->>'template_slug'), '')
            )
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
        CASE
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'unique_opened'
            ) > 0 THEN 1
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'opened'
            ) > 0 THEN 1
            ELSE 0
        END::bigint AS aperturas,
        CASE
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'unique_click'
            ) > 0 THEN 1
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'click'
            ) > 0 THEN 1
            ELSE 0
        END::bigint AS clicks
    FROM public.prospeccion_contactos_log l
    WHERE l.organizacion_id = public.usuario_organizacion_id(auth.uid())
      AND l.envio_id IS NOT NULL
      AND l.canal = 'correo'
    GROUP BY l.envio_id
),
agg_envios AS (
    SELECT
        eb.campana_id,
        c.nombre AS campana_nombre,
        eb.canal,
        eb.template_uuid AS template_id,
        COALESCE(lower(t.slug), eb.template_slug) AS template_slug,
        COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre') AS template_nombre,
        COUNT(*)::bigint AS envios_totales,
        COUNT(*) FILTER (WHERE eb.estado IN ('enviado', 'entregado'))::bigint AS envios_enviados,
        COUNT(*) FILTER (WHERE eb.estado = 'entregado')::bigint AS envios_entregados,
        COUNT(*) FILTER (WHERE eb.estado IN ('fallido', 'error', 'failed', 'undelivered'))::bigint AS envios_fallidos,
        COUNT(*) FILTER (WHERE eb.estado = 'omitido')::bigint AS envios_omitidos,
        COUNT(*) FILTER (WHERE COALESCE(r.respondio, FALSE))::bigint AS envios_respondidos,
        COALESCE(SUM(bp.aperturas), 0)::bigint AS brevo_aperturas,
        COALESCE(SUM(bp.clicks), 0)::bigint AS brevo_clicks
    FROM envios_base eb
    LEFT JOIN public.campanas c ON c.id = eb.campana_id
    LEFT JOIN public.prospeccion_contacto_templates t
        ON t.organizacion_id = eb.organizacion_id
       AND t.id = eb.template_uuid
    LEFT JOIN respuesta_por_envio r ON r.envio_id = eb.envio_id
    LEFT JOIN brevo_por_envio bp ON bp.envio_id = eb.envio_id
    GROUP BY eb.campana_id, c.nombre, eb.canal, eb.template_uuid, COALESCE(lower(t.slug), eb.template_slug), COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre')
),
sesion_signals AS (
    SELECT
        w.session_id,
        lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)utm_source=([^&#]+)'), '')) AS utm_source,
        lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)utm_medium=([^&#]+)'), '')) AS utm_medium,
        COALESCE(substring(w.landing_url FROM '(?:\\?|&)(?:cid|campana_id)=([0-9a-fA-F-]{36})'), '') AS campana_id,
        COALESCE(substring(w.landing_url FROM '(?:\\?|&)(?:tid|template_id)=([0-9a-fA-F-]{36})'), '') AS template_id,
        lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)kw=([^&#]+)'), '')) AS kw
    FROM public.webchat_visitantes w
    WHERE w.organizacion_id = public.usuario_organizacion_id(auth.uid())
      AND COALESCE(w.landing_url, '') <> ''
),
sesion_atribucion AS (
    SELECT
        NULLIF(campana_id, '') AS campana_id,
        NULLIF(template_id, '') AS template_id,
        NULLIF(kw, '') AS kw,
        COUNT(DISTINCT session_id)::bigint AS sesiones
    FROM sesion_signals
    WHERE utm_source = 'prospeccion'
      AND utm_medium = 'email'
    GROUP BY NULLIF(campana_id, ''), NULLIF(template_id, ''), NULLIF(kw, '')
),
sesion_atribucion_campana AS (
    SELECT campana_id, SUM(sesiones)::bigint AS sesiones
    FROM sesion_atribucion
    WHERE campana_id IS NOT NULL
    GROUP BY campana_id
)
SELECT
    a.campana_id,
    a.campana_nombre,
    a.canal,
    a.template_id,
    a.template_slug,
    a.template_nombre,
    a.envios_totales,
    a.envios_enviados,
    a.envios_entregados,
    a.envios_fallidos,
    a.envios_omitidos,
    a.envios_respondidos,
    a.brevo_aperturas,
    a.brevo_clicks,
    COALESCE(sa_exact.sesiones, sa_campaign.sesiones, 0)::bigint AS sesiones_utm,
    CASE
        WHEN a.envios_totales = 0 THEN 0
        ELSE ROUND((a.envios_entregados::numeric * 100.0) / a.envios_totales::numeric, 2)
    END AS tasa_entrega_pct,
    CASE
        WHEN a.envios_totales = 0 THEN 0
        ELSE ROUND((a.envios_respondidos::numeric * 100.0) / a.envios_totales::numeric, 2)
    END AS tasa_respuesta_pct,
    CASE
        WHEN COALESCE(sa_exact.sesiones, sa_campaign.sesiones, 0) = 0 THEN 0
        ELSE ROUND((a.brevo_clicks::numeric * 100.0) / COALESCE(sa_exact.sesiones, sa_campaign.sesiones)::numeric, 2)
    END AS click_to_session_pct
FROM agg_envios a
LEFT JOIN LATERAL (
    SELECT sesiones
    FROM sesion_atribucion s
    WHERE (
        a.template_id IS NOT NULL
        AND s.template_id = a.template_id::text
    ) OR (
        a.template_slug IS NOT NULL
        AND s.kw = a.template_slug
        AND (
            (a.campana_id IS NOT NULL AND s.campana_id = a.campana_id::text)
            OR s.campana_id IS NULL
        )
    )
    ORDER BY
        CASE
            WHEN a.template_id IS NOT NULL AND s.template_id = a.template_id::text THEN 1
            WHEN a.template_slug IS NOT NULL AND s.kw = a.template_slug THEN 2
            ELSE 3
        END
    LIMIT 1
) sa_exact ON TRUE
LEFT JOIN sesion_atribucion_campana sa_campaign
  ON a.campana_id IS NOT NULL
 AND sa_campaign.campana_id = a.campana_id::text
ORDER BY a.envios_totales DESC, a.campana_nombre NULLS LAST, a.template_nombre
LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_campana_template_atribucion(uuid, integer) TO authenticated;
