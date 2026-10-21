-- Las métricas operativas de WhatsApp deben depender del envío de prospección
-- y de sus eventos de Meta, no de que el prospecto ya tenga una conversación CRM.
create or replace function public.prospeccion_campana_whatsapp_metricas_rango(
    p_campana_id uuid default null,
    p_date_from timestamptz default null,
    p_date_to timestamptz default null,
    p_limit integer default 200,
    p_offset integer default 0
)
returns table (
    campana_id uuid,
    campana_nombre text,
    canal text,
    batches_total bigint,
    batches_completados bigint,
    batches_en_proceso bigint,
    batches_error bigint,
    prospectos_total bigint,
    mensajes_salientes bigint,
    mensajes_con_evento_entrega bigint,
    mensajes_entregados bigint,
    mensajes_leidos bigint,
    mensajes_fallidos bigint,
    mensajes_sin_evento_entrega bigint,
    mensajes_entrantes bigint,
    conversaciones_total bigint,
    conversaciones_respondidas bigint,
    conversaciones_sin_respuesta bigint,
    oportunidades_total bigint,
    oportunidades_abiertas bigint,
    oportunidades_ganadas bigint,
    oportunidades_perdidas bigint,
    monto_estimado_total numeric,
    tasa_respuesta_pct numeric(5,2),
    tasa_oportunidad_pct numeric(5,2),
    tasa_cierre_pct numeric(5,2)
)
language sql
stable
security invoker
set search_path = public
as $$
with contexto_org as (
    select coalesce(
        nullif((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    ) as organizacion_id
),
batches_semilla as (
    select
        pb.id as batch_id,
        pb.campana_id,
        pb.estado,
        pb.total_prospectos,
        pb.creado_en,
        c.nombre as campana_nombre
    from public.prospeccion_contacto_batch pb
    cross join contexto_org co
    join public.campanas c
      on c.id = pb.campana_id
     and c.canal = 'whatsapp'
    where pb.organizacion_id = co.organizacion_id
      and (p_campana_id is null or c.id = p_campana_id)
      and (p_date_from is null or pb.creado_en >= p_date_from)
      and (p_date_to is null or pb.creado_en <= p_date_to)
),
envios_base as (
    select
        pe.id as envio_id,
        pe.batch_id,
        bs.campana_id,
        lower(coalesce(pe.estado, 'pendiente')) as estado,
        nullif(btrim(pe.mensaje_id), '') as proveedor_mensaje_id
    from batches_semilla bs
    join public.prospeccion_contacto_envio pe
      on pe.batch_id = bs.batch_id
     and pe.organizacion_id = (select organizacion_id from contexto_org)
     and lower(coalesce(pe.canal, '')) = 'whatsapp'
),
eventos_por_envio as (
    select distinct
        eb.campana_id,
        eb.envio_id,
        lower(coalesce(ee.evento, '')) as evento
    from envios_base eb
    left join public.mensajes m
      on m.organizacion_id = (select organizacion_id from contexto_org)
     and m.twilio_message_sid = eb.proveedor_mensaje_id
    join public.eventos_entrega ee
      on ee.organizacion_id = (select organizacion_id from contexto_org)
     and (
        ee.proveedor_mensaje_id = eb.proveedor_mensaje_id
        or (m.id is not null and ee.mensaje_id = m.id)
     )
),
delivery_rollup as (
    select
        eb.campana_id,
        count(distinct ep.envio_id)::bigint as mensajes_con_evento_entrega,
        count(distinct eb.envio_id) filter (
            where eb.estado in ('entregado', 'leido', 'completado', 'respondido')
               or exists (
                    select 1
                    from eventos_por_envio history
                    where history.envio_id = eb.envio_id
                      and history.evento in ('entregado', 'delivered', 'leido', 'read')
               )
        )::bigint as mensajes_entregados,
        count(distinct eb.envio_id) filter (
            where eb.estado in ('leido', 'read')
               or exists (
                    select 1
                    from eventos_por_envio history
                    where history.envio_id = eb.envio_id
                      and history.evento in ('leido', 'read')
               )
        )::bigint as mensajes_leidos,
        count(distinct eb.envio_id) filter (
            where eb.estado in ('fallido', 'failed', 'error', 'undelivered')
               or exists (
                    select 1
                    from eventos_por_envio history
                    where history.envio_id = eb.envio_id
                      and history.evento in ('fallido', 'failed', 'undelivered')
               )
        )::bigint as mensajes_fallidos
    from envios_base eb
    left join eventos_por_envio ep on ep.envio_id = eb.envio_id
    group by eb.campana_id
),
envios_rollup as (
    select
        campana_id,
        count(*)::bigint as mensajes_salientes
    from envios_base
    group by campana_id
),
conversaciones_semilla as (
    select
        c.id as conversacion_id,
        case
            when nullif(btrim(c.inbox_context->>'batch_id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (c.inbox_context->>'batch_id')::uuid
        end as batch_id,
        case
            when nullif(btrim(c.inbox_context->>'campana_id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (c.inbox_context->>'campana_id')::uuid
        end as campana_id
    from public.conversaciones c
    cross join contexto_org co
    where c.organizacion_id = co.organizacion_id
      and c.canal = 'whatsapp'
      and lower(coalesce(c.inbox_context->>'source', '')) = 'prospeccion'
      and (c.inbox_context ? 'batch_id' or c.inbox_context ? 'campana_id')
      and (p_date_from is null or coalesce(c.ultimo_saliente_en, c.iniciada_en, c.ultimo_mensaje_en) >= p_date_from)
      and (p_date_to is null or coalesce(c.ultimo_saliente_en, c.iniciada_en, c.ultimo_mensaje_en) <= p_date_to)
),
conversaciones_campana as (
    select cs.conversacion_id, coalesce(pb.campana_id, cs.campana_id) as campana_resuelta_id
    from conversaciones_semilla cs
    left join public.prospeccion_contacto_batch pb
      on pb.id = cs.batch_id
     and pb.organizacion_id = (select organizacion_id from contexto_org)
    join public.campanas c on c.id = coalesce(pb.campana_id, cs.campana_id) and c.canal = 'whatsapp'
    where p_campana_id is null or c.id = p_campana_id
),
conversation_messages as (
    select cc.campana_resuelta_id as campana_id, m.conversacion_id, m.direccion
    from conversaciones_campana cc
    join public.mensajes m on m.conversacion_id = cc.conversacion_id
    where m.organizacion_id = (select organizacion_id from contexto_org)
),
conversation_rollup as (
    select
        campana_id,
        count(distinct conversacion_id)::bigint as conversaciones_total,
        count(distinct conversacion_id) filter (
            where exists (
                select 1 from conversation_messages cm2
                where cm2.conversacion_id = conversation_messages.conversacion_id
                  and cm2.direccion = 'entrante'
            )
        )::bigint as conversaciones_respondidas,
        count(*) filter (where direccion = 'entrante')::bigint as mensajes_entrantes
    from conversation_messages
    group by campana_id
),
oportunidades_base as (
    select
        cc.campana_resuelta_id as campana_id,
        o.id,
        lower(coalesce(o.estado, '')) as estado,
        coalesce(o.monto_estimado, 0)::numeric as monto_estimado
    from conversaciones_campana cc
    join public.oportunidades o
      on o.organizacion_id = (select organizacion_id from contexto_org)
     and (
        nullif(o.metadata->>'conversation_id', '') = cc.conversacion_id::text
        or nullif(o.metadata->>'conversacion_id', '') = cc.conversacion_id::text
     )
),
opportunity_rollup as (
    select
        campana_id,
        count(*)::bigint as oportunidades_total,
        count(*) filter (where estado = 'abierta')::bigint as oportunidades_abiertas,
        count(*) filter (where estado = 'ganada')::bigint as oportunidades_ganadas,
        count(*) filter (where estado = 'perdida')::bigint as oportunidades_perdidas,
        coalesce(sum(monto_estimado), 0)::numeric as monto_estimado_total
    from oportunidades_base
    group by campana_id
),
campanas_base as (
    select distinct campana_id, campana_nombre
    from batches_semilla
)
select
    cb.campana_id,
    cb.campana_nombre,
    'whatsapp'::text,
    count(distinct bs.batch_id)::bigint,
    count(distinct bs.batch_id) filter (where lower(coalesce(bs.estado, '')) = 'completado')::bigint,
    count(distinct bs.batch_id) filter (where lower(coalesce(bs.estado, '')) = 'en_proceso')::bigint,
    count(distinct bs.batch_id) filter (where lower(coalesce(bs.estado, '')) = 'error')::bigint,
    coalesce(sum(bs.total_prospectos), 0)::bigint,
    coalesce(er.mensajes_salientes, 0),
    coalesce(dr.mensajes_con_evento_entrega, 0),
    coalesce(dr.mensajes_entregados, 0),
    coalesce(dr.mensajes_leidos, 0),
    coalesce(dr.mensajes_fallidos, 0),
    greatest(coalesce(er.mensajes_salientes, 0) - coalesce(dr.mensajes_con_evento_entrega, 0), 0),
    coalesce(cr.mensajes_entrantes, 0),
    coalesce(cr.conversaciones_total, 0),
    coalesce(cr.conversaciones_respondidas, 0),
    greatest(coalesce(cr.conversaciones_total, 0) - coalesce(cr.conversaciones_respondidas, 0), 0),
    coalesce(orl.oportunidades_total, 0),
    coalesce(orl.oportunidades_abiertas, 0),
    coalesce(orl.oportunidades_ganadas, 0),
    coalesce(orl.oportunidades_perdidas, 0),
    coalesce(orl.monto_estimado_total, 0),
    case when coalesce(cr.conversaciones_total, 0) = 0 then 0 else round(cr.conversaciones_respondidas::numeric * 100 / cr.conversaciones_total, 2) end,
    case when coalesce(cr.conversaciones_total, 0) = 0 then 0 else round(coalesce(orl.oportunidades_total, 0)::numeric * 100 / cr.conversaciones_total, 2) end,
    case when coalesce(orl.oportunidades_total, 0) = 0 then 0 else round(coalesce(orl.oportunidades_ganadas, 0)::numeric * 100 / orl.oportunidades_total, 2) end
from campanas_base cb
join batches_semilla bs on bs.campana_id = cb.campana_id
left join envios_rollup er on er.campana_id = cb.campana_id
left join delivery_rollup dr on dr.campana_id = cb.campana_id
left join conversation_rollup cr on cr.campana_id = cb.campana_id
left join opportunity_rollup orl on orl.campana_id = cb.campana_id
group by cb.campana_id, cb.campana_nombre, er.mensajes_salientes,
         dr.mensajes_con_evento_entrega, dr.mensajes_entregados,
         dr.mensajes_leidos, dr.mensajes_fallidos, cr.mensajes_entrantes,
         cr.conversaciones_total, cr.conversaciones_respondidas,
         orl.oportunidades_total, orl.oportunidades_abiertas,
         orl.oportunidades_ganadas, orl.oportunidades_perdidas,
         orl.monto_estimado_total
order by coalesce(er.mensajes_salientes, 0) desc, cb.campana_nombre nulls last
limit greatest(1, least(coalesce(p_limit, 200), 1000))
offset greatest(0, coalesce(p_offset, 0));
$$;
