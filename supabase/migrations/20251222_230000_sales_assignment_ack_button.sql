-- Agrega columnas para rastrear acuses de recibo de los vendedores y expone la información en la vista.
drop view if exists public.v_asignaciones_vendedores_whatsapp;

alter table if exists public.asignaciones_vendedores_whatsapp
    add column if not exists notificacion_message_sid text,
    add column if not exists aceptado_en timestamptz,
    add column if not exists aceptado_por_usuario_id uuid references public.usuarios(id) on delete set null,
    add column if not exists aceptado_via text;

create index if not exists asignaciones_vendedores_whatsapp_notif_sid_idx
    on public.asignaciones_vendedores_whatsapp (notificacion_message_sid);

create index if not exists asignaciones_vendedores_whatsapp_ack_idx
    on public.asignaciones_vendedores_whatsapp (aceptado_en);

create index if not exists asignaciones_vendedores_whatsapp_ack_user_idx
    on public.asignaciones_vendedores_whatsapp (aceptado_por_usuario_id);

create or replace view public.v_asignaciones_vendedores_whatsapp as
select
    a.id,
    a.creado_en,
    a.organizacion_id,
    org.nombre as organizacion_nombre,
    a.conversacion_id,
    conv.canal as conversacion_canal,
    a.oportunidad_id,
    opp.titulo as oportunidad_titulo,
    a.contacto_id,
    ct.nombre_completo as contacto_nombre,
    ct.company_name as contacto_empresa,
    ct.telefono_e164 as contacto_telefono,
    ct.correo as contacto_correo,
    a.vendedor_usuario_id,
    usr.nombre_completo as vendedor_nombre,
    usr.correo as vendedor_correo,
    usr.telefono_e164 as vendedor_telefono,
    a.trigger_event,
    a.notificacion_message_sid,
    a.aceptado_en,
    a.aceptado_por_usuario_id,
    ack_usr.nombre_completo as aceptado_por_nombre,
    ack_usr.correo as aceptado_por_correo,
    ack_usr.telefono_e164 as aceptado_por_telefono,
    a.aceptado_via,
    a.metadata
from public.asignaciones_vendedores_whatsapp a
left join public.organizaciones org on org.id = a.organizacion_id
left join public.conversaciones conv on conv.id = a.conversacion_id
left join public.oportunidades opp on opp.id = a.oportunidad_id
left join public.contactos ct on ct.id = coalesce(a.contacto_id, opp.contacto_principal_id)
left join public.usuarios usr on usr.id = a.vendedor_usuario_id
left join public.usuarios ack_usr on ack_usr.id = a.aceptado_por_usuario_id;

comment on view public.v_asignaciones_vendedores_whatsapp is
    'Vista de auditoría de asignaciones de vendedores para WhatsApp.';
