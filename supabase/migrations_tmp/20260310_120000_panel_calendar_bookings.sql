BEGIN;

DROP VIEW IF EXISTS public.panel_agenda_demos;

CREATE VIEW public.panel_calendar_bookings AS
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
    lt.tablero_id,
    lt.etapa_id,
    le.codigo AS etapa_codigo,
    le.nombre AS etapa_nombre,
    lt.canal AS tarjeta_canal,
    lt.lead_score AS tarjeta_lead_score,
    lt.tags AS tarjeta_tags,
    lt.metadata AS tarjeta_metadata,
    lt.asignado_a_usuario_id,
    ua.nombre_completo AS asignado_nombre,
    lt.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre,
    c.nombre_completo AS contacto_nombre,
    c.correo AS contacto_correo,
    c.telefono_e164 AS contacto_telefono,
    c.company_name AS contacto_empresa,
    c.origen AS contacto_origen,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en AS conversacion_ultimo_mensaje_en,
    conv.canal AS conversacion_canal
FROM public.calendar_bookings cb
LEFT JOIN public.lead_tarjetas lt ON lt.id = cb.tarjeta_id
LEFT JOIN public.lead_etapas le ON le.id = lt.etapa_id
LEFT JOIN public.usuarios ua ON ua.id = lt.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = lt.propietario_usuario_id
LEFT JOIN public.contactos c ON c.id = cb.contact_id
LEFT JOIN public.conversaciones conv ON conv.id = cb.conversacion_id;

COMMENT ON VIEW public.panel_calendar_bookings IS
    'Citas confirmadas del calendario con contexto de tarjeta, contacto y conversación para el panel.';

COMMIT;
