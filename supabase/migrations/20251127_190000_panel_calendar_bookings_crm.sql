BEGIN;

DROP VIEW IF EXISTS public.panel_calendar_bookings;

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
    c.nombre_completo AS contacto_nombre,
    c.correo AS contacto_correo,
    c.telefono_e164 AS contacto_telefono,
    c.company_name AS contacto_empresa,
    c.origen AS contacto_origen,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en AS conversacion_ultimo_mensaje_en,
    conv.canal AS conversacion_canal,
    o.id AS oportunidad_id
FROM public.calendar_bookings cb
LEFT JOIN public.oportunidades o ON o.id = cb.tarjeta_id
LEFT JOIN public.etapas_pipeline ep ON ep.id = o.etapa_id
LEFT JOIN public.usuarios ua ON ua.id = o.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = o.propietario_usuario_id
LEFT JOIN public.personas p ON p.id = COALESCE(cb.contact_id, o.contacto_principal_id)
LEFT JOIN public.conversaciones conv ON conv.id = cb.conversacion_id;

COMMENT ON VIEW public.panel_calendar_bookings IS
    'Citas confirmadas del calendario con contexto CRM (oportunidades, contactos y conversaciones).';

COMMIT;
