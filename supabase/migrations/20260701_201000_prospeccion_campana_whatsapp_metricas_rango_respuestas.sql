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
mensajes_semilla as (
    select
        m.id,
        m.conversacion_id,
        m.direccion,
        m.creado_en,
        case
            when nullif(btrim(m.datos->>'batch_id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (m.datos->>'batch_id')::uuid
        end as batch_id,
        case
            when nullif(btrim(m.datos->>'campana_id'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (m.datos->>'campana_id')::uuid
        end as campana_id
    from public.mensajes m
    cross join contexto_org co
    where m.organizacion_id = co.organizacion_id
      and lower(coalesce(m.datos->>'source', '')) = 'prospeccion'
      and (
        m.datos ? 'batch_id'
        or m.datos ? 'campana_id'
      )
      and (p_date_from is null or m.creado_en >= p_date_from)
      and (p_date_to is null or m.creado_en <= p_date_to)
),
mensajes_campana as (
    select
        ms.*,
        coalesce(pb.campana_id, ms.campana_id) as campana_resuelta_id
    from mensajes_semilla ms
    left join public.prospeccion_contacto_batch pb
      on pb.id = ms.batch_id
     and pb.organizacion_id = (select organizacion_id from contexto_org)
    left join public.campanas c
      on c.id = coalesce(pb.campana_id, ms.campana_id)
    where c.canal = 'whatsapp'
      and (p_campana_id is null or c.id = p_campana_id)
),
campanas_base as (
    select distinct
        mc.campana_resuelta_id as campana_id,
        c.nombre as campana_nombre
    from mensajes_campana mc
    join public.campanas c
      on c.id = mc.campana_resuelta_id
),
batches_base as (
    select distinct
        mc.campana_resuelta_id as campana_id,
        pb.id as batch_id,
        lower(coalesce(pb.estado, 'pendiente')) as estado,
        coalesce(pb.total_prospectos, 0)::bigint as total_prospectos
    from mensajes_campana mc
    join public.prospeccion_contacto_batch pb
      on pb.id = mc.batch_id
),
batches_rollup as (
    select
        campana_id,
        count(*)::bigint as batches_total,
        count(*) filter (where estado = 'completado')::bigint as batches_completados,
        count(*) filter (where estado = 'en_proceso')::bigint as batches_en_proceso,
        count(*) filter (where estado = 'error')::bigint as batches_error,
        coalesce(sum(total_prospectos), 0)::bigint as prospectos_total
    from batches_base
    group by campana_id
),
conversation_map as (
    select distinct on (mc.conversacion_id)
        mc.campana_resuelta_id as campana_id,
        mc.conversacion_id,
        mc.direccion,
        mc.creado_en
    from mensajes_campana mc
    where mc.conversacion_id is not null
    order by
        mc.conversacion_id,
        case when mc.direccion = 'saliente' then 0 when mc.direccion = 'entrante' then 1 else 2 end,
        mc.creado_en,
        mc.id
),
conversation_messages as (
    select
        cm.campana_id,
        m.conversacion_id,
        m.direccion,
        m.creado_en
    from conversation_map cm
    join public.mensajes m
      on m.conversacion_id = cm.conversacion_id
    cross join contexto_org co
    where m.organizacion_id = co.organizacion_id
),
conversation_rollup as (
    select
        campana_id,
        count(distinct conversacion_id)::bigint as conversaciones_total,
        count(distinct conversacion_id) filter (
            where exists (
                select 1
                from conversation_messages cm2
                where cm2.conversacion_id = conversation_messages.conversacion_id
                  and cm2.direccion = 'entrante'
            )
        )::bigint as conversaciones_respondidas
    from conversation_messages
    group by campana_id
),
message_rollup as (
    select
        campana_id,
        count(*) filter (where direccion = 'saliente')::bigint as mensajes_salientes,
        count(*) filter (where direccion = 'entrante')::bigint as mensajes_entrantes
    from conversation_messages
    group by campana_id
),
oportunidades_base as (
    select
        cm.campana_id,
        o.id,
        lower(coalesce(o.estado, '')) as estado,
        coalesce(o.monto_estimado, 0)::numeric as monto_estimado
    from conversation_map cm
    join public.oportunidades o
      on o.organizacion_id = (select organizacion_id from contexto_org)
     and (
        nullif(o.metadata->>'conversation_id', '') = cm.conversacion_id::text
        or nullif(o.metadata->>'conversacion_id', '') = cm.conversacion_id::text
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
)
select
    cb.campana_id,
    cb.campana_nombre,
    'whatsapp'::text as canal,
    coalesce(br.batches_total, 0) as batches_total,
    coalesce(br.batches_completados, 0) as batches_completados,
    coalesce(br.batches_en_proceso, 0) as batches_en_proceso,
    coalesce(br.batches_error, 0) as batches_error,
    coalesce(br.prospectos_total, 0) as prospectos_total,
    coalesce(mr.mensajes_salientes, 0) as mensajes_salientes,
    coalesce(mr.mensajes_entrantes, 0) as mensajes_entrantes,
    coalesce(cr.conversaciones_total, 0) as conversaciones_total,
    coalesce(cr.conversaciones_respondidas, 0) as conversaciones_respondidas,
    greatest(coalesce(cr.conversaciones_total, 0) - coalesce(cr.conversaciones_respondidas, 0), 0) as conversaciones_sin_respuesta,
    coalesce(orl.oportunidades_total, 0) as oportunidades_total,
    coalesce(orl.oportunidades_abiertas, 0) as oportunidades_abiertas,
    coalesce(orl.oportunidades_ganadas, 0) as oportunidades_ganadas,
    coalesce(orl.oportunidades_perdidas, 0) as oportunidades_perdidas,
    coalesce(orl.monto_estimado_total, 0) as monto_estimado_total,
    case
        when coalesce(cr.conversaciones_total, 0) = 0 then 0
        else round((coalesce(cr.conversaciones_respondidas, 0)::numeric * 100.0) / coalesce(cr.conversaciones_total, 0)::numeric, 2)
    end as tasa_respuesta_pct,
    case
        when coalesce(cr.conversaciones_respondidas, 0) = 0 then 0
        else round((coalesce(orl.oportunidades_total, 0)::numeric * 100.0) / coalesce(cr.conversaciones_respondidas, 0)::numeric, 2)
    end as tasa_oportunidad_pct,
    case
        when coalesce(orl.oportunidades_total, 0) = 0 then 0
        else round((coalesce(orl.oportunidades_ganadas, 0)::numeric * 100.0) / coalesce(orl.oportunidades_total, 0)::numeric, 2)
    end as tasa_cierre_pct
from campanas_base cb
left join batches_rollup br on br.campana_id = cb.campana_id
left join message_rollup mr on mr.campana_id = cb.campana_id
left join conversation_rollup cr on cr.campana_id = cb.campana_id
left join opportunity_rollup orl on orl.campana_id = cb.campana_id
order by coalesce(mr.mensajes_salientes, 0) desc, cb.campana_nombre nulls last
limit greatest(1, least(coalesce(p_limit, 200), 1000))
offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.prospeccion_campana_whatsapp_metricas_rango(uuid, timestamptz, timestamptz, integer, integer)
    is 'Resume metricas de campañas WhatsApp por organización, con mensajes, conversaciones, oportunidades y lotes. Incluye respuestas entrantes aunque no tengan batch_id.';

grant execute on function public.prospeccion_campana_whatsapp_metricas_rango(uuid, timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.prospeccion_campana_whatsapp_metricas_rango(uuid, timestamptz, timestamptz, integer, integer) to service_role;
