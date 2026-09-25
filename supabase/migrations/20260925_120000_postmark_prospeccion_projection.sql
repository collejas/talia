-- Proyecta los eventos normalizados de Postmark en el modelo operativo que
-- consumen los lotes y las métricas de Prospección. El vínculo es el UUID
-- interno de tenant_email_messages, nunca el MessageID del proveedor.

CREATE OR REPLACE FUNCTION public.tenant_email_project_postmark_event(
    p_organizacion_id uuid,
    p_message_id uuid,
    p_event_type text,
    p_event_at timestamptz,
    p_event_id text DEFAULT NULL,
    p_error_code text DEFAULT NULL,
    p_error_description text DEFAULT NULL,
    p_bounce_type text DEFAULT NULL
)
RETURNS TABLE (updated_count integer, log_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_envio public.prospeccion_contacto_envio%ROWTYPE;
    v_action text;
    v_state text;
    v_detail jsonb;
    v_updated integer := 0;
    v_logged integer := 0;
BEGIN
    IF p_organizacion_id IS NULL OR p_message_id IS NULL THEN
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;

    SELECT e.*
      INTO v_envio
      FROM public.prospeccion_contacto_envio e
      JOIN public.tenant_email_messages m
        ON m.id::text = e.mensaje_id_interno
       AND m.organizacion_id = e.organizacion_id
     WHERE e.organizacion_id = p_organizacion_id
       AND e.canal = 'correo'
       AND m.id = p_message_id
     FOR UPDATE OF e;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;

    v_action := CASE p_event_type
        WHEN 'Delivery' THEN 'postmark_delivery'
        WHEN 'Bounce' THEN 'postmark_bounce'
        WHEN 'Open' THEN 'postmark_open'
        WHEN 'Click' THEN 'postmark_click'
        WHEN 'SpamComplaint' THEN 'postmark_spam_complaint'
        WHEN 'SubscriptionChange' THEN 'postmark_subscription_change'
        ELSE NULL
    END;

    IF v_action IS NULL THEN
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;

    v_state := CASE p_event_type
        WHEN 'Delivery' THEN 'entregado'
        WHEN 'Open' THEN 'leido'
        WHEN 'Click' THEN 'leido'
        WHEN 'Bounce' THEN 'fallido'
        WHEN 'SpamComplaint' THEN 'fallido'
        ELSE NULL
    END;

    v_detail := jsonb_strip_nulls(jsonb_build_object(
        'provider', 'postmark',
        'event_type', p_event_type,
        'event_id', NULLIF(p_event_id, ''),
        'event_at', p_event_at,
        'error_code', NULLIF(p_error_code, ''),
        'error_description', NULLIF(p_error_description, ''),
        'bounce_type', NULLIF(p_bounce_type, '')
    ));

    UPDATE public.prospeccion_contacto_envio e
       SET estado = CASE
             WHEN p_event_type IN ('Open', 'Click')
                  AND e.estado IN ('respondido', 'completado') THEN e.estado
             WHEN p_event_type = 'Delivery'
                  AND e.estado IN ('respondido', 'completado', 'leido') THEN e.estado
             ELSE COALESCE(v_state, e.estado)
           END,
           entregado_en = CASE
             WHEN p_event_type IN ('Delivery', 'Open', 'Click')
               THEN COALESCE(e.entregado_en, p_event_at)
             ELSE e.entregado_en
           END,
           leido_en = CASE
             WHEN p_event_type IN ('Open', 'Click')
               THEN COALESCE(e.leido_en, p_event_at)
             ELSE e.leido_en
           END,
           procesado_en = GREATEST(COALESCE(e.procesado_en, p_event_at), p_event_at),
           error = CASE
             WHEN p_event_type IN ('Bounce', 'SpamComplaint')
               THEN COALESCE(NULLIF(p_error_description, ''), NULLIF(p_bounce_type, ''), p_event_type)
             WHEN p_event_type IN ('Delivery', 'Open', 'Click') THEN NULL
             ELSE e.error
           END,
           detalle = COALESCE(e.detalle, '{}'::jsonb) || jsonb_build_object(
             'postmark_last_event', v_detail
           )
     WHERE e.id = v_envio.id
       AND e.organizacion_id = p_organizacion_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 AND NOT EXISTS (
        SELECT 1
          FROM public.prospeccion_contactos_log l
         WHERE l.organizacion_id = p_organizacion_id
           AND l.envio_id = v_envio.id
           AND l.accion = v_action
    ) THEN
        INSERT INTO public.prospeccion_contactos_log (
            prospecto_id, organizacion_id, canal, accion, estado, detalle,
            error, batch_id, envio_id
        ) VALUES (
            v_envio.prospecto_id,
            p_organizacion_id,
            'correo',
            v_action,
            COALESCE(v_state, v_envio.estado),
            v_detail,
            CASE WHEN p_event_type IN ('Bounce', 'SpamComplaint')
                 THEN COALESCE(NULLIF(p_error_description, ''), NULLIF(p_bounce_type, ''), p_event_type)
                 ELSE NULL END,
            v_envio.batch_id,
            v_envio.id
        );
        v_logged := 1;
    END IF;

    RETURN QUERY SELECT v_updated, v_logged;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_email_project_postmark_event(
    uuid, uuid, text, timestamptz, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_email_project_postmark_event(
    uuid, uuid, text, timestamptz, text, text, text, text
) TO service_role;

-- Los contadores históricos de Prospección también deben incluir engagement de
-- Postmark. Se mantiene la salida existente (brevo_aperturas/brevo_clicks) para
-- no romper el contrato del panel; el nombre es histórico y ahora representa
-- aperturas/clics de correo de ambos proveedores.
CREATE OR REPLACE FUNCTION public.prospeccion_campana_template_atribucion_rango(
    p_campana_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 200,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    campana_id uuid, campana_nombre text, canal text, template_id uuid,
    template_slug text, template_nombre text, twilio_content_sid text,
    envios_totales bigint, envios_enviados bigint, envios_entregados bigint,
    envios_fallidos bigint, envios_omitidos bigint, envios_respondidos bigint,
    brevo_aperturas bigint, brevo_clicks bigint, sesiones_utm bigint,
    tasa_entrega_pct numeric(5,2), tasa_respuesta_pct numeric(5,2),
    click_to_session_pct numeric(5,2)
)
LANGUAGE sql STABLE AS $$
WITH contexto_org AS (
    SELECT COALESCE(NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
                    public.usuario_organizacion_id(auth.uid())) AS organizacion_id
), envios_base AS (
    SELECT e.id envio_id, b.campana_id, b.organizacion_id, e.canal,
        lower(COALESCE(e.estado, 'pendiente')) estado,
        CASE WHEN COALESCE(e.payload->>'template_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             THEN (e.payload->>'template_id')::uuid END template_uuid,
        lower(COALESCE(NULLIF(btrim(e.payload->'metadata'->>'template_slug'), ''), NULLIF(btrim(e.payload->>'template_slug'), ''))) template_slug,
        NULLIF(btrim(COALESCE(e.detalle->>'template_sid', e.payload->'metadata'->>'template_sid', e.payload->>'template_sid')), '') twilio_content_sid,
        COALESCE(e.procesado_en, e.creado_en, e.programado_en) event_ts
    FROM public.prospeccion_contacto_envio e
    JOIN public.prospeccion_contacto_batch b ON b.id=e.batch_id
    CROSS JOIN contexto_org co
    WHERE e.organizacion_id=co.organizacion_id AND b.organizacion_id=co.organizacion_id
      AND (p_campana_id IS NULL OR b.campana_id=p_campana_id)
      AND (p_date_from IS NULL OR COALESCE(e.procesado_en,e.creado_en,e.programado_en)>=p_date_from)
      AND (p_date_to IS NULL OR COALESCE(e.procesado_en,e.creado_en,e.programado_en)<=p_date_to)
), respuesta_por_envio AS (
    SELECT l.envio_id, BOOL_OR(lower(COALESCE(l.accion,l.detalle->>'action',l.estado,'')) = ANY(ARRAY['respuesta','respondio','respondido','reply','reply_inbound']) OR lower(COALESCE(l.detalle->>'direction','')) = ANY(ARRAY['inbound','incoming']) OR COALESCE(l.detalle->>'respondio','')='true' OR COALESCE(l.detalle->>'respuesta','') <> '') respondio
    FROM public.prospeccion_contactos_log l CROSS JOIN contexto_org co
    WHERE l.organizacion_id=co.organizacion_id AND l.envio_id IS NOT NULL GROUP BY l.envio_id
), engagement_por_envio AS (
    SELECT l.envio_id,
      (COUNT(*) FILTER (WHERE lower(COALESCE(l.detalle->>'event',l.detalle->'brevo'->>'event','')) IN ('unique_opened','opened')) > 0 OR COUNT(*) FILTER (WHERE l.accion='postmark_open') > 0)::int aperturas,
      (COUNT(*) FILTER (WHERE lower(COALESCE(l.detalle->>'event',l.detalle->'brevo'->>'event','')) IN ('unique_click','click')) > 0 OR COUNT(*) FILTER (WHERE l.accion='postmark_click') > 0)::int clicks
    FROM public.prospeccion_contactos_log l CROSS JOIN contexto_org co
    WHERE l.organizacion_id=co.organizacion_id AND l.envio_id IS NOT NULL AND l.canal='correo'
    GROUP BY l.envio_id
), agg_envios AS (
    SELECT eb.campana_id, c.nombre campana_nombre, eb.canal, eb.template_uuid template_id,
      COALESCE(lower(t.slug),eb.template_slug) template_slug,
      COALESCE(t.nombre,COALESCE(t.slug,eb.template_slug),'Plantilla sin nombre') template_nombre,
      eb.twilio_content_sid, COUNT(*)::bigint envios_totales,
      COUNT(*) FILTER (WHERE eb.estado IN ('enviado','entregado','leido','completado','respondido'))::bigint envios_enviados,
      COUNT(*) FILTER (WHERE eb.estado IN ('entregado','leido','completado','respondido'))::bigint envios_entregados,
      COUNT(*) FILTER (WHERE eb.estado IN ('fallido','error','failed','undelivered'))::bigint envios_fallidos,
      COUNT(*) FILTER (WHERE eb.estado='omitido')::bigint envios_omitidos,
      COUNT(*) FILTER (WHERE COALESCE(r.respondio,FALSE))::bigint envios_respondidos,
      COALESCE(SUM(ep.aperturas),0)::bigint brevo_aperturas, COALESCE(SUM(ep.clicks),0)::bigint brevo_clicks
    FROM envios_base eb LEFT JOIN public.campanas c ON c.id=eb.campana_id
      LEFT JOIN public.prospeccion_contacto_templates t ON t.organizacion_id=eb.organizacion_id AND t.id=eb.template_uuid
      LEFT JOIN respuesta_por_envio r ON r.envio_id=eb.envio_id LEFT JOIN engagement_por_envio ep ON ep.envio_id=eb.envio_id
    GROUP BY eb.campana_id,c.nombre,eb.canal,eb.template_uuid,COALESCE(lower(t.slug),eb.template_slug),COALESCE(t.nombre,COALESCE(t.slug,eb.template_slug),'Plantilla sin nombre'),eb.twilio_content_sid
), sesion_signals AS (
    SELECT w.session_id,lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)utm_source=([^&#]+)'),'')) utm_source,lower(COALESCE(substring(w.landing_url FROM '(?:\\?|&)utm_medium=([^&#]+)'),'')) utm_medium,NULLIF(substring(w.landing_url FROM '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'),'')::uuid envio_id
    FROM public.webchat_visitantes w CROSS JOIN contexto_org co WHERE w.organizacion_id=co.organizacion_id AND COALESCE(w.landing_url,'')<>''
), sesion_por_envio AS (
    SELECT envio_id,COUNT(DISTINCT session_id)::bigint sesiones FROM sesion_signals WHERE utm_source='prospeccion' AND utm_medium='email' AND envio_id IS NOT NULL GROUP BY envio_id
), sesion_atribucion AS (
    SELECT eb.campana_id,eb.template_uuid template_id,COALESCE(lower(t.slug),eb.template_slug) template_slug,eb.twilio_content_sid,COALESCE(SUM(se.sesiones),0)::bigint sesiones
    FROM envios_base eb LEFT JOIN public.prospeccion_contacto_templates t ON t.organizacion_id=eb.organizacion_id AND t.id=eb.template_uuid LEFT JOIN sesion_por_envio se ON se.envio_id=eb.envio_id
    GROUP BY eb.campana_id,eb.template_uuid,COALESCE(lower(t.slug),eb.template_slug),eb.twilio_content_sid
)
SELECT a.campana_id,a.campana_nombre,a.canal,a.template_id,a.template_slug,a.template_nombre,a.twilio_content_sid,a.envios_totales,a.envios_enviados,a.envios_entregados,a.envios_fallidos,a.envios_omitidos,a.envios_respondidos,a.brevo_aperturas,a.brevo_clicks,COALESCE(sa.sesiones,0)::bigint,
  CASE WHEN a.envios_totales=0 THEN 0 ELSE ROUND((a.envios_entregados::numeric*100.0)/a.envios_totales::numeric,2) END,
  CASE WHEN a.envios_totales=0 THEN 0 ELSE ROUND((a.envios_respondidos::numeric*100.0)/a.envios_totales::numeric,2) END,
  CASE WHEN COALESCE(sa.sesiones,0)=0 THEN 0 ELSE ROUND((a.brevo_clicks::numeric*100.0)/sa.sesiones::numeric,2) END
FROM agg_envios a LEFT JOIN sesion_atribucion sa ON sa.campana_id IS NOT DISTINCT FROM a.campana_id AND sa.template_id IS NOT DISTINCT FROM a.template_id AND sa.template_slug IS NOT DISTINCT FROM a.template_slug AND sa.twilio_content_sid IS NOT DISTINCT FROM a.twilio_content_sid
ORDER BY a.envios_totales DESC,a.campana_nombre NULLS LAST,a.template_nombre,a.twilio_content_sid NULLS LAST
LIMIT GREATEST(1,COALESCE(p_limit,200)) OFFSET GREATEST(COALESCE(p_offset,0),0);
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_campana_template_atribucion_rango(uuid,integer,timestamptz,timestamptz,integer) TO authenticated;
