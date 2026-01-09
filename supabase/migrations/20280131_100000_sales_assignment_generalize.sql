BEGIN;

-- drop the WhatsApp-specific audit view before renaming things
DROP VIEW IF EXISTS public.v_asignaciones_vendedores_whatsapp;

-- rename the table and indexes so the name reflects multi-channel usage
ALTER TABLE public.asignaciones_vendedores_whatsapp
    RENAME TO asignaciones_vendedores;

ALTER INDEX IF EXISTS asignaciones_vendedores_whatsapp_notif_sid_idx
    RENAME TO asignaciones_vendedores_notif_sid_idx;
ALTER INDEX IF EXISTS asignaciones_vendedores_whatsapp_ack_idx
    RENAME TO asignaciones_vendedores_ack_idx;
ALTER INDEX IF EXISTS asignaciones_vendedores_whatsapp_ack_user_idx
    RENAME TO asignaciones_vendedores_ack_user_idx;

 -- add the channel column to track the notification channel
ALTER TABLE public.asignaciones_vendedores
    ADD COLUMN IF NOT EXISTS canal text NOT NULL;

-- recreate the view with the new table name and include the channel in the projection
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
    ct.nombre_completo AS contacto_nombre,
    ct.company_name AS contacto_empresa,
    ct.telefono_e164 AS contacto_telefono,
    ct.correo AS contacto_correo,
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
    a.metadata
FROM public.asignaciones_vendedores a
LEFT JOIN public.organizaciones org ON org.id = a.organizacion_id
LEFT JOIN public.conversaciones conv ON conv.id = a.conversacion_id
LEFT JOIN public.oportunidades opp ON opp.id = a.oportunidad_id
LEFT JOIN public.contactos ct ON ct.id = COALESCE(a.contacto_id, opp.contacto_principal_id)
LEFT JOIN public.usuarios usr ON usr.id = a.vendedor_usuario_id
LEFT JOIN public.usuarios ack_usr ON ack_usr.id = a.aceptado_por_usuario_id;

COMMENT ON VIEW public.v_asignaciones_vendedores IS
    'Vista de auditoría de asignaciones de vendedores para cualquier canal.';

COMMENT ON TABLE public.asignaciones_vendedores IS
    'Auditoría de notificaciones enviadas a vendedores desde cualquier canal.';

COMMIT;
