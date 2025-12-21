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
    a.metadata
from public.asignaciones_vendedores_whatsapp a
left join public.organizaciones org on org.id = a.organizacion_id
left join public.conversaciones conv on conv.id = a.conversacion_id
left join public.oportunidades opp on opp.id = a.oportunidad_id
left join public.contactos ct on ct.id = coalesce(a.contacto_id, opp.contacto_principal_id)
left join public.usuarios usr on usr.id = a.vendedor_usuario_id;

comment on view public.v_asignaciones_vendedores_whatsapp is
    'Vista de auditoría de asignaciones de vendedores para WhatsApp.';
