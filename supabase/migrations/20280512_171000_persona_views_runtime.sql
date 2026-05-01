BEGIN;

CREATE OR REPLACE VIEW public.conversaciones_en_curso AS
SELECT
    c.id AS conversacion_id,
    c.canal,
    c.estado,
    c.prioridad,
    c.iniciada_en,
    c.ultimo_mensaje_en,
    c.contacto_id,
    p.nombre_completo AS contacto_nombre,
    p.telefono_principal_e164 AS contacto_telefono,
    p.correo_principal AS contacto_correo,
    u.id AS asignado_usuario_id,
    u.nombre_completo AS asignado_usuario_nombre,
    u.correo AS asignado_usuario_correo,
    COALESCE(c.persona_id, c.contacto_id) AS persona_id,
    p.nombre_completo AS persona_nombre,
    p.telefono_principal_e164 AS persona_telefono,
    p.correo_principal AS persona_correo
FROM public.conversaciones AS c
LEFT JOIN public.personas AS p
    ON p.id = COALESCE(c.persona_id, c.contacto_id)
LEFT JOIN public.usuarios AS u
    ON u.id = c.asignado_a_usuario_id
WHERE c.estado = ANY (ARRAY['abierta'::text, 'pendiente'::text]);

COMMENT ON VIEW public.conversaciones_en_curso IS
    'Conversaciones abiertas o pendientes con datos de persona y asignación.';

CREATE OR REPLACE VIEW public.panel_calendar_bookings
WITH (security_invoker = true) AS
SELECT
    cb.id,
    cb.resource_id,
    cb.hold_id,
    cb.tarjeta_id,
    cb.contact_id,
    cb.conversacion_id,
    cb.start_at,
    cb.end_at,
    cb.timezone,
    cb.status,
    cb.notes,
    cb.meeting_url,
    cb.external_join_url,
    cb.metadata,
    cb.created_at,
    cb.updated_at,
    CASE
        WHEN (o.metadata ->> 'tablero_id') ~ '^[0-9a-fA-F-]{36}$'
            THEN (o.metadata ->> 'tablero_id')::uuid
        ELSE NULL::uuid
    END AS tablero_id,
    o.etapa_id,
    ep.codigo AS etapa_codigo,
    ep.nombre AS etapa_nombre,
    COALESCE(
        NULLIF(o.metadata ->> 'canal', ''),
        conv.canal,
        'desconocido'
    ) AS tarjeta_canal,
    CASE
        WHEN (o.metadata ->> 'lead_score') ~ '^-?\d+$'
            THEN (o.metadata ->> 'lead_score')::integer
        ELSE NULL
    END AS tarjeta_lead_score,
    CASE
        WHEN jsonb_typeof(o.metadata -> 'tags') = 'array' THEN o.metadata -> 'tags'
        ELSE '[]'::jsonb
    END AS tarjeta_tags,
    o.metadata AS tarjeta_metadata,
    o.asignado_a_usuario_id,
    ua.nombre_completo AS asignado_nombre,
    o.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre,
    p.nombre_completo AS contacto_nombre,
    p.correo_principal AS contacto_correo,
    p.telefono_principal_e164 AS contacto_telefono,
    COALESCE(
        NULLIF(p.persona_datos ->> 'company_name', ''),
        NULLIF(p.metadata ->> 'company_name', '')
    ) AS contacto_empresa,
    p.origen AS contacto_origen,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en AS conversacion_ultimo_mensaje_en,
    conv.canal AS conversacion_canal,
    o.id AS oportunidad_id,
    COALESCE(cb.contact_id, o.contacto_principal_id) AS persona_id,
    p.nombre_completo AS persona_nombre,
    p.correo_principal AS persona_correo,
    p.telefono_principal_e164 AS persona_telefono,
    COALESCE(
        NULLIF(p.persona_datos ->> 'company_name', ''),
        NULLIF(p.metadata ->> 'company_name', '')
    ) AS persona_empresa,
    p.origen AS persona_origen
FROM public.calendar_bookings AS cb
LEFT JOIN public.oportunidades AS o
    ON o.id = cb.tarjeta_id
LEFT JOIN public.etapas_pipeline AS ep
    ON ep.id = o.etapa_id
LEFT JOIN public.usuarios AS ua
    ON ua.id = o.asignado_a_usuario_id
LEFT JOIN public.usuarios AS up
    ON up.id = o.propietario_usuario_id
LEFT JOIN public.personas AS p
    ON p.id = COALESCE(cb.contact_id, o.contacto_principal_id)
LEFT JOIN public.conversaciones AS conv
    ON conv.id = cb.conversacion_id;

COMMENT ON VIEW public.panel_calendar_bookings IS
    'Citas confirmadas del calendario con contexto CRM basado en personas.';

CREATE OR REPLACE VIEW public.v_asignaciones_vendedores AS
SELECT
    a.id,
    a.creado_en,
    a.organizacion_id,
    org.nombre AS organizacion_nombre,
    a.conversacion_id,
    conv.canal AS conversacion_canal,
    a.oportunidad_id,
    opp.titulo AS oportunidad_titulo,
    a.contacto_id,
    p.nombre_completo AS contacto_nombre,
    COALESCE(
        NULLIF(p.persona_datos ->> 'company_name', ''),
        NULLIF(p.metadata ->> 'company_name', '')
    ) AS contacto_empresa,
    p.telefono_principal_e164 AS contacto_telefono,
    p.correo_principal AS contacto_correo,
    a.vendedor_usuario_id,
    usr.nombre_completo AS vendedor_nombre,
    usr.correo AS vendedor_correo,
    usr.telefono_e164 AS vendedor_telefono,
    a.trigger_event,
    a.canal AS asignacion_canal,
    a.notificacion_message_sid,
    a.aceptado_en,
    a.aceptado_por_usuario_id,
    ack_usr.nombre_completo AS aceptado_por_nombre,
    ack_usr.correo AS aceptado_por_correo,
    ack_usr.telefono_e164 AS aceptado_por_telefono,
    a.aceptado_via,
    a.metadata,
    COALESCE(a.persona_id, a.contacto_id, opp.contacto_principal_id) AS persona_id,
    p.nombre_completo AS persona_nombre,
    COALESCE(
        NULLIF(p.persona_datos ->> 'company_name', ''),
        NULLIF(p.metadata ->> 'company_name', '')
    ) AS persona_empresa,
    p.telefono_principal_e164 AS persona_telefono,
    p.correo_principal AS persona_correo
FROM public.asignaciones_vendedores AS a
LEFT JOIN public.organizaciones AS org
    ON org.id = a.organizacion_id
LEFT JOIN public.conversaciones AS conv
    ON conv.id = a.conversacion_id
LEFT JOIN public.oportunidades AS opp
    ON opp.id = a.oportunidad_id
LEFT JOIN public.personas AS p
    ON p.id = COALESCE(a.persona_id, a.contacto_id, opp.contacto_principal_id)
LEFT JOIN public.usuarios AS usr
    ON usr.id = a.vendedor_usuario_id
LEFT JOIN public.usuarios AS ack_usr
    ON ack_usr.id = a.aceptado_por_usuario_id;

COMMENT ON VIEW public.v_asignaciones_vendedores IS
    'Vista de auditoría de asignaciones de vendedores para cualquier canal, resuelta por personas.';

CREATE OR REPLACE VIEW public.v_openai_costs_by_conversation
WITH (security_invoker = true) AS
SELECT
    agg.conversation_id,
    agg.first_request_at,
    agg.last_request_at,
    agg.organizacion_id,
    agg.organizacion_nombre,
    agg.source_tenant_mode,
    agg.channel,
    agg.feature,
    agg.openai_project_key,
    agg.requests_count,
    agg.models_count,
    agg.models_used,
    agg.input_tokens,
    agg.cached_input_tokens,
    agg.output_tokens,
    agg.reasoning_tokens,
    agg.total_tokens,
    agg.estimated_total_cost_usd,
    agg.avg_latency_ms,
    agg.fallback_count,
    agg.quality_retry_count,
    agg.openai_project_display_name,
    COALESCE(
        NULLIF(TRIM(BOTH FROM p.nombre_completo), ''),
        NULLIF(TRIM(BOTH FROM p.correo_principal), ''),
        NULLIF(TRIM(BOTH FROM p.telefono_principal_e164), ''),
        CONCAT(initcap(COALESCE(agg.channel, 'Conversación')), ' · ', LEFT((agg.conversation_id)::text, 8))
    ) AS conversation_display_name,
    COALESCE(c.persona_id, c.contacto_id) AS persona_id,
    c.contacto_id
FROM (
    SELECT
        conversation_id,
        MIN(created_at) AS first_request_at,
        MAX(created_at) AS last_request_at,
        organizacion_id,
        MAX(organizacion_nombre) AS organizacion_nombre,
        MAX(source_tenant_mode) AS source_tenant_mode,
        MAX(channel) AS channel,
        MAX(feature) AS feature,
        MAX(openai_project_key) AS openai_project_key,
        MAX(openai_project_display_name) AS openai_project_display_name,
        COUNT(*) AS requests_count,
        COUNT(DISTINCT openai_model_family) AS models_count,
        ARRAY_AGG(DISTINCT openai_model_family ORDER BY openai_model_family)
            FILTER (WHERE openai_model_family IS NOT NULL) AS models_used,
        SUM(input_tokens) AS input_tokens,
        SUM(cached_input_tokens) AS cached_input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(reasoning_tokens) AS reasoning_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(estimated_total_cost_usd) AS estimated_total_cost_usd,
        AVG(latency_ms)::numeric(12,2) AS avg_latency_ms,
        COUNT(*) FILTER (WHERE fallback_used) AS fallback_count,
        COUNT(*) FILTER (WHERE quality_retry_used) AS quality_retry_count
    FROM public.v_openai_usage_enriched
    WHERE conversation_id IS NOT NULL
    GROUP BY conversation_id, organizacion_id
) AS agg
LEFT JOIN public.conversaciones AS c
    ON c.id = agg.conversation_id
LEFT JOIN public.personas AS p
    ON p.id = COALESCE(c.persona_id, c.contacto_id);

COMMENT ON VIEW public.v_openai_costs_by_conversation IS
    'Costos de OpenAI agrupados por conversación, resueltos sobre personas.';

COMMIT;
