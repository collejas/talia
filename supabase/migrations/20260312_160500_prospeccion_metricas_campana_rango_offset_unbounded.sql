DROP FUNCTION IF EXISTS public.prospeccion_campana_template_atribucion_rango(uuid, integer, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.prospeccion_campana_template_atribucion_rango(
    p_campana_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 200,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    campana_id uuid,
    campana_nombre text,
    canal text,
    template_id uuid,
    template_slug text,
    template_nombre text,
    twilio_content_sid text,
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
WITH contexto_org AS (
    SELECT
      COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
      ) AS organizacion_id
),
envios_base AS (
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
        ) AS template_slug,
        NULLIF(
            btrim(
                COALESCE(
                    e.detalle->>'template_sid',
                    e.payload->'metadata'->>'template_sid',
                    e.payload->>'template_sid'
                )
            ),
            ''
        ) AS twilio_content_sid,
        COALESCE(e.procesado_en, e.creado_en, e.programado_en) AS event_ts
    FROM public.prospeccion_contacto_envio e
    JOIN public.prospeccion_contacto_batch b ON b.id = e.batch_id
    CROSS JOIN contexto_org co
    WHERE e.organizacion_id = co.organizacion_id
      AND b.organizacion_id = co.organizacion_id
      AND (p_campana_id IS NULL OR b.campana_id = p_campana_id)
      AND (p_date_from IS NULL OR COALESCE(e.procesado_en, e.creado_en, e.programado_en) >= p_date_from)
      AND (p_date_to IS NULL OR COALESCE(e.procesado_en, e.creado_en, e.programado_en) <= p_date_to)
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
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
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
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
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
        eb.twilio_content_sid,
        COUNT(*)::bigint AS envios_totales,
        COUNT(*) FILTER (WHERE eb.estado IN ('enviado', 'entregado', 'leido', 'completado', 'respondido'))::bigint AS envios_enviados,
        COUNT(*) FILTER (WHERE eb.estado IN ('entregado', 'leido', 'completado', 'respondido'))::bigint AS envios_entregados,
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
    GROUP BY
      eb.campana_id,
      c.nombre,
      eb.canal,
      eb.template_uuid,
      COALESCE(lower(t.slug), eb.template_slug),
      COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre'),
      eb.twilio_content_sid
),
sesion_signals AS (
    SELECT
        w.session_id,
        lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)utm_source=([^&#]+)'), '')) AS utm_source,
        lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)utm_medium=([^&#]+)'), '')) AS utm_medium,
        NULLIF(substring(w.landing_url FROM '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'), '')::uuid AS envio_id
    FROM public.webchat_visitantes w
    CROSS JOIN contexto_org co
    WHERE w.organizacion_id = co.organizacion_id
      AND COALESCE(w.landing_url, '') <> ''
),
sesion_por_envio AS (
    SELECT
        envio_id,
        COUNT(DISTINCT session_id)::bigint AS sesiones
    FROM sesion_signals
    WHERE utm_source = 'prospeccion'
      AND utm_medium = 'email'
      AND envio_id IS NOT NULL
    GROUP BY envio_id
),
sesion_atribucion AS (
    SELECT
        eb.campana_id,
        eb.template_uuid AS template_id,
        COALESCE(lower(t.slug), eb.template_slug) AS template_slug,
        eb.twilio_content_sid,
        COALESCE(SUM(se.sesiones), 0)::bigint AS sesiones
    FROM envios_base eb
    LEFT JOIN public.prospeccion_contacto_templates t
      ON t.organizacion_id = eb.organizacion_id
     AND t.id = eb.template_uuid
    LEFT JOIN sesion_por_envio se ON se.envio_id = eb.envio_id
    GROUP BY eb.campana_id, eb.template_uuid, COALESCE(lower(t.slug), eb.template_slug), eb.twilio_content_sid
)
SELECT
    a.campana_id,
    a.campana_nombre,
    a.canal,
    a.template_id,
    a.template_slug,
    a.template_nombre,
    a.twilio_content_sid,
    a.envios_totales,
    a.envios_enviados,
    a.envios_entregados,
    a.envios_fallidos,
    a.envios_omitidos,
    a.envios_respondidos,
    a.brevo_aperturas,
    a.brevo_clicks,
    COALESCE(sa.sesiones, 0)::bigint AS sesiones_utm,
    CASE
        WHEN a.envios_totales = 0 THEN 0
        ELSE ROUND((a.envios_entregados::numeric * 100.0) / a.envios_totales::numeric, 2)
    END AS tasa_entrega_pct,
    CASE
        WHEN a.envios_totales = 0 THEN 0
        ELSE ROUND((a.envios_respondidos::numeric * 100.0) / a.envios_totales::numeric, 2)
    END AS tasa_respuesta_pct,
    CASE
        WHEN COALESCE(sa.sesiones, 0) = 0 THEN 0
        ELSE ROUND((a.brevo_clicks::numeric * 100.0) / sa.sesiones::numeric, 2)
    END AS click_to_session_pct
FROM agg_envios a
LEFT JOIN sesion_atribucion sa
  ON sa.campana_id IS NOT DISTINCT FROM a.campana_id
 AND sa.template_id IS NOT DISTINCT FROM a.template_id
 AND sa.template_slug IS NOT DISTINCT FROM a.template_slug
 AND sa.twilio_content_sid IS NOT DISTINCT FROM a.twilio_content_sid
ORDER BY a.envios_totales DESC, a.campana_nombre NULLS LAST, a.template_nombre, a.twilio_content_sid NULLS LAST
LIMIT GREATEST(1, COALESCE(p_limit, 200))
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_campana_template_atribucion_rango(uuid, integer, timestamptz, timestamptz, integer) TO authenticated;
