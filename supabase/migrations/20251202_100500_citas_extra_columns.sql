BEGIN;

-- ============================================================================
-- Ampliación de la tabla citas con columnas de recordatorios y enlaces externos
-- ============================================================================

ALTER TABLE public.citas
ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS reminder_status text NOT NULL DEFAULT 'pendiente'
    CHECK (reminder_status = ANY (ARRAY['pendiente','programado','enviado','fallido'])),
ADD COLUMN IF NOT EXISTS external_join_url text,
ADD COLUMN IF NOT EXISTS scheduled_via text NOT NULL DEFAULT 'humano'
    CHECK (scheduled_via = ANY (ARRAY['humano','ia','api']));

COMMENT ON COLUMN public.citas.reminder_sent_at IS 'Último recordatorio automático enviado para la cita.';
COMMENT ON COLUMN public.citas.reminder_status IS 'Estado del recordatorio automático (pendiente, programado, enviado, fallido).';
COMMENT ON COLUMN public.citas.external_join_url IS 'Enlace externo generado por integraciones (Zoom, Meet, etc.).';
COMMENT ON COLUMN public.citas.scheduled_via IS 'Indica si la cita la creó un humano, la IA o una integración API.';

-- ============================================================================
-- Actualizar vistas dependientes para incluir las nuevas columnas
-- ============================================================================

DROP VIEW IF EXISTS public.panel_agenda_demos;
CREATE VIEW public.panel_agenda_demos AS
SELECT
    c.id,
    c.tarjeta_id,
    c.contacto_id,
    c.conversacion_id,
    c.start_at,
    c.end_at,
    c.timezone,
    c.estado,
    c.provider,
    c.provider_calendar_id,
    c.provider_event_id,
    c.meeting_url,
    c.location,
    c.notes,
    c.metadata,
    c.created_by,
    c.updated_by,
    c.cancel_reason,
    c.reminder_sent_at,
    c.reminder_status,
    c.external_join_url,
    c.scheduled_via,
    c.creado_en,
    c.actualizado_en,
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
    cto.nombre_completo AS contacto_nombre,
    cto.correo AS contacto_correo,
    cto.telefono_e164 AS contacto_telefono,
    cto.company_name AS contacto_empresa,
    cto.origen AS contacto_origen,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en AS conversacion_ultimo_mensaje_en,
    conv.canal AS conversacion_canal
FROM public.citas c
JOIN public.lead_tarjetas lt ON lt.id = c.tarjeta_id
LEFT JOIN public.lead_etapas le ON le.id = lt.etapa_id
LEFT JOIN public.usuarios ua ON ua.id = lt.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = lt.propietario_usuario_id
LEFT JOIN public.contactos cto ON cto.id = c.contacto_id
LEFT JOIN public.conversaciones conv ON conv.id = c.conversacion_id;

COMMENT ON VIEW public.panel_agenda_demos IS
    'Agregación de citas demo con datos de tarjetas, contactos y conversaciones para el panel.';

DROP VIEW IF EXISTS public.panel_agenda_calendario;
CREATE VIEW public.panel_agenda_calendario AS
SELECT
    c.id,
    c.tarjeta_id,
    c.contacto_id,
    cto.nombre_completo AS contacto_nombre,
    c.start_at,
    c.end_at,
    c.timezone,
    c.estado,
    c.provider,
    c.meeting_url,
    c.location,
    c.notes,
    c.provider_event_id,
    c.provider_calendar_id,
    c.metadata,
    c.reminder_sent_at,
    c.reminder_status,
    c.external_join_url,
    c.scheduled_via,
    COALESCE(cto.nombre_completo, 'Lead') || ' • Demo' AS titulo,
    lt.tablero_id,
    lt.etapa_id,
    le.codigo AS etapa_codigo,
    le.nombre AS etapa_nombre,
    lt.asignado_a_usuario_id,
    ua.nombre_completo AS asignado_nombre,
    lt.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre
FROM public.citas c
JOIN public.lead_tarjetas lt ON lt.id = c.tarjeta_id
LEFT JOIN public.lead_etapas le ON le.id = lt.etapa_id
LEFT JOIN public.usuarios ua ON ua.id = lt.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = lt.propietario_usuario_id
LEFT JOIN public.contactos cto ON cto.id = c.contacto_id;

COMMENT ON VIEW public.panel_agenda_calendario IS
    'Vista simplificada para mostrar eventos de demo en calendarios.';

COMMIT;
