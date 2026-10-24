-- Reescritura de la RPC operativa: primero reduce eventos, conversaciones y
-- oportunidades al universo de la campaña y después calcula los indicadores.
-- Conserva el contrato existente y el aislamiento por organización.

create or replace function public.prospeccion_campana_whatsapp_metricas_rango(
    p_campana_id uuid default null,
    p_date_from timestamptz default null,
    p_date_to timestamptz default null,
    p_limit integer default 200,
    p_offset integer default 0
)
returns table (
    campana_id uuid, campana_nombre text, canal text,
    batches_total bigint, batches_completados bigint,
    batches_en_proceso bigint, batches_error bigint,
    prospectos_total bigint, mensajes_salientes bigint,
    mensajes_con_evento_entrega bigint, mensajes_entregados bigint,
    mensajes_leidos bigint, mensajes_fallidos bigint,
    mensajes_sin_evento_entrega bigint, mensajes_entrantes bigint,
    conversaciones_total bigint, conversaciones_respondidas bigint,
    conversaciones_sin_respuesta bigint, oportunidades_total bigint,
    oportunidades_abiertas bigint, oportunidades_ganadas bigint,
    oportunidades_perdidas bigint, monto_estimado_total numeric,
    tasa_respuesta_pct numeric(5,2), tasa_oportunidad_pct numeric(5,2),
    tasa_cierre_pct numeric(5,2)
)
language sql
stable
security invoker
set search_path = public
as $$
with contexto_org as materialized (
    select coalesce(
        nullif((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    ) as organizacion_id
),
batches as materialized (
    select pb.id batch_id, pb.campana_id, pb.estado, pb.total_prospectos,
           pb.creado_en, c.nombre campana_nombre
    from public.prospeccion_contacto_batch pb
    join contexto_org co on co.organizacion_id = pb.organizacion_id
    join public.campanas c on c.id = pb.campana_id and c.canal = 'whatsapp'
    where (p_campana_id is null or c.id = p_campana_id)
      and (p_date_from is null or pb.creado_en >= p_date_from)
      and (p_date_to is null or pb.creado_en <= p_date_to)
),
batch_rollup as (
    select campana_id, max(campana_nombre) campana_nombre,
           count(*)::bigint batches_total,
           count(*) filter (where lower(coalesce(estado,''))='completado')::bigint batches_completados,
           count(*) filter (where lower(coalesce(estado,''))='en_proceso')::bigint batches_en_proceso,
           count(*) filter (where lower(coalesce(estado,''))='error')::bigint batches_error,
           coalesce(sum(total_prospectos),0)::bigint prospectos_total
    from batches group by campana_id
),
envios as materialized (
    select pe.id envio_id, pe.batch_id, b.campana_id,
           lower(coalesce(pe.estado,'pendiente')) estado,
           nullif(btrim(pe.mensaje_id),'') proveedor_mensaje_id
    from batches b
    join public.prospeccion_contacto_envio pe
      on pe.organizacion_id = (select organizacion_id from contexto_org)
     and pe.batch_id = b.batch_id
     and lower(coalesce(pe.canal,'')) = 'whatsapp'
),
envios_resueltos as materialized (
    select e.*, m.id mensaje_id
    from envios e
    left join public.mensajes m
      on m.organizacion_id = (select organizacion_id from contexto_org)
     and m.twilio_message_sid = e.proveedor_mensaje_id
),
eventos_por_envio as materialized (
    select e.envio_id, e.campana_id, lower(coalesce(ee.evento,'')) evento
    from envios_resueltos e
    join public.eventos_entrega ee
      on ee.organizacion_id = (select organizacion_id from contexto_org)
     and ee.proveedor_mensaje_id = e.proveedor_mensaje_id
    where e.proveedor_mensaje_id is not null
    union
    select e.envio_id, e.campana_id, lower(coalesce(ee.evento,'')) evento
    from envios_resueltos e
    join public.eventos_entrega ee
      on ee.organizacion_id = (select organizacion_id from contexto_org)
     and ee.mensaje_id = e.mensaje_id
    where e.mensaje_id is not null
),
delivery_by_envio as (
    select e.campana_id, e.envio_id, e.estado,
           count(ep.envio_id)::bigint > 0 tiene_evento,
           bool_or(ep.evento in ('entregado','delivered','leido','read')) entregado_evento,
           bool_or(ep.evento in ('leido','read')) leido_evento,
           bool_or(ep.evento in ('fallido','failed','undelivered')) fallido_evento
    from envios e left join eventos_por_envio ep on ep.envio_id = e.envio_id
    group by e.campana_id,e.envio_id,e.estado
),
delivery_rollup as (
    select campana_id,
           count(*) filter (where tiene_evento)::bigint mensajes_con_evento_entrega,
           count(*) filter (where estado in ('entregado','leido','completado','respondido') or entregado_evento)::bigint mensajes_entregados,
           count(*) filter (where estado in ('leido','read') or leido_evento)::bigint mensajes_leidos,
           count(*) filter (where estado in ('fallido','failed','error','undelivered') or fallido_evento)::bigint mensajes_fallidos,
           count(*)::bigint mensajes_salientes
    from delivery_by_envio group by campana_id
),
conversation_seed as materialized (
    select c.id conversacion_id,
           case when nullif(btrim(c.inbox_context->>'batch_id'),'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (c.inbox_context->>'batch_id')::uuid end batch_id,
           case when nullif(btrim(c.inbox_context->>'campana_id'),'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (c.inbox_context->>'campana_id')::uuid end campana_id
    from public.conversaciones c
    join contexto_org co on co.organizacion_id = c.organizacion_id
    where c.canal='whatsapp'
      and lower(coalesce(c.inbox_context->>'source',''))='prospeccion'
      and (c.inbox_context ? 'batch_id' or c.inbox_context ? 'campana_id')
      and (p_date_from is null or coalesce(c.ultimo_saliente_en,c.iniciada_en,c.ultimo_mensaje_en) >= p_date_from)
      and (p_date_to is null or coalesce(c.ultimo_saliente_en,c.iniciada_en,c.ultimo_mensaje_en) <= p_date_to)
),
conversation_campaign as materialized (
    select s.conversacion_id, coalesce(b.campana_id,s.campana_id) campana_id
    from conversation_seed s
    left join public.prospeccion_contacto_batch b
      on b.id=s.batch_id and b.organizacion_id=(select organizacion_id from contexto_org)
    join public.campanas c on c.id=coalesce(b.campana_id,s.campana_id) and c.canal='whatsapp'
    where p_campana_id is null or c.id=p_campana_id
),
conversation_rollup as (
    select cc.campana_id,
           count(distinct cc.conversacion_id)::bigint conversaciones_total,
           count(distinct cc.conversacion_id) filter (where m.direccion='entrante')::bigint conversaciones_respondidas,
           count(*) filter (where m.direccion='entrante')::bigint mensajes_entrantes
    from conversation_campaign cc
    join public.mensajes m
      on m.organizacion_id=(select organizacion_id from contexto_org)
     and m.conversacion_id=cc.conversacion_id
    group by cc.campana_id
),
opportunity_rollup as (
    select cc.campana_id,
           count(*)::bigint oportunidades_total,
           count(*) filter (where lower(coalesce(o.estado,''))='abierta')::bigint oportunidades_abiertas,
           count(*) filter (where lower(coalesce(o.estado,''))='ganada')::bigint oportunidades_ganadas,
           count(*) filter (where lower(coalesce(o.estado,''))='perdida')::bigint oportunidades_perdidas,
           coalesce(sum(coalesce(o.monto_estimado,0)),0)::numeric monto_estimado_total
    from conversation_campaign cc
    join public.oportunidades o
      on o.organizacion_id=(select organizacion_id from contexto_org)
     and coalesce(nullif(o.metadata->>'conversation_id',''),nullif(o.metadata->>'conversacion_id',''))=cc.conversacion_id::text
    group by cc.campana_id
)
select br.campana_id, br.campana_nombre, 'whatsapp'::text,
       br.batches_total, br.batches_completados, br.batches_en_proceso,
       br.batches_error, br.prospectos_total,
       coalesce(dr.mensajes_salientes,0), coalesce(dr.mensajes_con_evento_entrega,0),
       coalesce(dr.mensajes_entregados,0), coalesce(dr.mensajes_leidos,0),
       coalesce(dr.mensajes_fallidos,0), greatest(coalesce(dr.mensajes_salientes,0)-coalesce(dr.mensajes_con_evento_entrega,0),0),
       coalesce(cr.mensajes_entrantes,0), coalesce(cr.conversaciones_total,0),
       coalesce(cr.conversaciones_respondidas,0), greatest(coalesce(cr.conversaciones_total,0)-coalesce(cr.conversaciones_respondidas,0),0),
       coalesce(orr.oportunidades_total,0), coalesce(orr.oportunidades_abiertas,0),
       coalesce(orr.oportunidades_ganadas,0), coalesce(orr.oportunidades_perdidas,0),
       coalesce(orr.monto_estimado_total,0),
       case when coalesce(cr.conversaciones_total,0)=0 then 0 else round(cr.conversaciones_respondidas::numeric*100/cr.conversaciones_total,2) end,
       case when coalesce(cr.conversaciones_total,0)=0 then 0 else round(coalesce(orr.oportunidades_total,0)::numeric*100/cr.conversaciones_total,2) end,
       case when coalesce(orr.oportunidades_total,0)=0 then 0 else round(coalesce(orr.oportunidades_ganadas,0)::numeric*100/orr.oportunidades_total,2) end
from batch_rollup br
left join delivery_rollup dr on dr.campana_id=br.campana_id
left join conversation_rollup cr on cr.campana_id=br.campana_id
left join opportunity_rollup orr on orr.campana_id=br.campana_id
order by coalesce(dr.mensajes_salientes,0) desc, br.campana_nombre nulls last
limit greatest(1,least(coalesce(p_limit,200),1000))
offset greatest(0,coalesce(p_offset,0));
$$;
