BEGIN;

-- ============================================================================
-- Renombrar tipo ENUM de estados de cita
-- ============================================================================

ALTER TYPE public.cita_demo_estado RENAME TO cita_estado;
GRANT USAGE ON TYPE public.cita_estado TO postgres, service_role, authenticated;

-- ============================================================================
-- Renombrar tabla principal y sus objetos dependientes
-- ============================================================================

ALTER TABLE public.lead_citas_demo RENAME TO citas;
COMMENT ON TABLE public.citas IS
    'Citas de demostración asociadas a leads; sincroniza con calendario externo.';
COMMENT ON COLUMN public.citas.provider IS
    'Origen de la cita (hosting propio vs Google Calendar).';

-- Constraints
ALTER TABLE public.citas
    RENAME CONSTRAINT lead_citas_demo_provider_check TO citas_provider_check;
ALTER TABLE public.citas
    RENAME CONSTRAINT lead_citas_demo_time_check TO citas_time_check;
ALTER TABLE public.citas
    RENAME CONSTRAINT lead_citas_demo_tarjeta_id_fkey TO citas_tarjeta_id_fkey;
ALTER TABLE public.citas
    RENAME CONSTRAINT lead_citas_demo_contacto_id_fkey TO citas_contacto_id_fkey;
ALTER TABLE public.citas
    RENAME CONSTRAINT lead_citas_demo_conversacion_id_fkey TO citas_conversacion_id_fkey;
ALTER TABLE public.citas
    RENAME CONSTRAINT lead_citas_demo_created_by_fkey TO citas_created_by_fkey;
ALTER TABLE public.citas
    RENAME CONSTRAINT lead_citas_demo_updated_by_fkey TO citas_updated_by_fkey;

-- Índices
ALTER INDEX IF EXISTS public.lead_citas_demo_pkey RENAME TO citas_pkey;
ALTER INDEX IF EXISTS public.lead_citas_demo_start_idx RENAME TO citas_start_idx;
ALTER INDEX IF EXISTS public.lead_citas_demo_estado_idx RENAME TO citas_estado_idx;
ALTER INDEX IF EXISTS public.lead_citas_demo_tarjeta_idx RENAME TO citas_tarjeta_idx;
ALTER INDEX IF EXISTS public.lead_citas_demo_active_unique RENAME TO citas_active_unique;

-- Triggers
ALTER TRIGGER lead_citas_demo_touch_updated_at ON public.citas RENAME TO citas_touch_updated_at;
ALTER TRIGGER lead_citas_demo_sync_stage ON public.citas RENAME TO citas_sync_stage;

-- ============================================================================
-- Renombrar función de trigger y comentarios asociados
-- ============================================================================

ALTER FUNCTION public.tg_lead_citas_demo_sync_stage() RENAME TO tg_citas_sync_stage;
COMMENT ON FUNCTION public.tg_citas_sync_stage()
    IS 'Asegura que la tarjeta se mueva a la etapa Demo cuando hay una cita activa.';

-- ============================================================================
-- Renombrar políticas RLS
-- ============================================================================

ALTER POLICY lead_citas_demo_admin_all ON public.citas RENAME TO citas_admin_all;
ALTER POLICY lead_citas_demo_select ON public.citas RENAME TO citas_select;
ALTER POLICY lead_citas_demo_modify ON public.citas RENAME TO citas_modify;
ALTER POLICY lead_citas_demo_insert ON public.citas RENAME TO citas_insert;
ALTER POLICY lead_citas_demo_delete ON public.citas RENAME TO citas_delete;

-- ============================================================================
-- Actualizar vistas dependientes
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
