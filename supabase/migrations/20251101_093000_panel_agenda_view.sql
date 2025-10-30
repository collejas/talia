BEGIN;

-- Asegura que la vista del panel quede disponible incluso si la migración anterior ya corrió
DROP VIEW IF EXISTS public.panel_agenda_demos;

CREATE VIEW public.panel_agenda_demos AS
SELECT
    lcd.id,
    lcd.tarjeta_id,
    lcd.contacto_id,
    lcd.conversacion_id,
    lcd.start_at,
    lcd.end_at,
    lcd.timezone,
    lcd.estado,
    lcd.provider,
    lcd.provider_calendar_id,
    lcd.provider_event_id,
    lcd.meeting_url,
    lcd.location,
    lcd.notes,
    lcd.metadata,
    lcd.created_by,
    lcd.updated_by,
    lcd.cancel_reason,
    lcd.creado_en,
    lcd.actualizado_en,
    lt.tablero_id AS tarjeta_tablero_id,
    lt.etapa_id AS tarjeta_etapa_id,
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
FROM public.lead_citas_demo lcd
JOIN public.lead_tarjetas lt ON lt.id = lcd.tarjeta_id
LEFT JOIN public.lead_etapas le ON le.id = lt.etapa_id
LEFT JOIN public.usuarios ua ON ua.id = lt.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = lt.propietario_usuario_id
LEFT JOIN public.contactos c ON c.id = lcd.contacto_id
LEFT JOIN public.conversaciones conv ON conv.id = lcd.conversacion_id;

COMMENT ON VIEW public.panel_agenda_demos IS
    'Agregación de citas demo con datos de tarjetas, contactos y conversaciones para el panel.';

DROP VIEW IF EXISTS public.panel_agenda_calendario;
CREATE VIEW public.panel_agenda_calendario AS
SELECT
    lcd.id,
    lcd.tarjeta_id,
    lcd.contacto_id,
    c.nombre_completo AS contacto_nombre,
    lcd.start_at,
    lcd.end_at,
    lcd.timezone,
    lcd.estado,
    lcd.provider,
    lcd.meeting_url,
    lcd.location,
    lcd.notes,
    lcd.provider_event_id,
    lcd.provider_calendar_id,
    lcd.metadata,
    COALESCE(c.nombre_completo, 'Lead') || ' • Demo' AS titulo,
    lt.tablero_id,
    lt.etapa_id,
    le.codigo AS etapa_codigo,
    le.nombre AS etapa_nombre,
    lt.asignado_a_usuario_id,
    ua.nombre_completo AS asignado_nombre,
    lt.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre
FROM public.lead_citas_demo lcd
JOIN public.lead_tarjetas lt ON lt.id = lcd.tarjeta_id
LEFT JOIN public.lead_etapas le ON le.id = lt.etapa_id
LEFT JOIN public.usuarios ua ON ua.id = lt.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = lt.propietario_usuario_id
LEFT JOIN public.contactos c ON c.id = lcd.contacto_id;

COMMENT ON VIEW public.panel_agenda_calendario IS
    'Vista simplificada para mostrar eventos de demo en calendarios.';

COMMIT;
