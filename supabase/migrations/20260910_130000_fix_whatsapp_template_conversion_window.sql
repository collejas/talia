-- Usa la conversión como cohorte de la métrica por plantilla.
-- Un envío anterior puede generar una conversión dentro del periodo actual.
create or replace function public.prospeccion_campana_whatsapp_template_metricas_rango(
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
    template_id uuid,
    template_nombre text,
    template_slug text,
    version_id uuid,
    envios_totales bigint,
    mensajes_salientes bigint,
    conversaciones_total bigint,
    conversaciones_respondidas bigint,
    oportunidades_total bigint,
    oportunidades_ganadas bigint
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
envios_base as (
    select
        e.id as envio_id,
        b.campana_id,
        c.nombre as campana_nombre,
        coalesce(
            e.whatsapp_template_id,
            e.plantilla_id,
            case when nullif(e.payload->>'template_id', '') ~* '^[0-9a-f-]{36}$'
                then (e.payload->>'template_id')::uuid end,
            b.whatsapp_template_id
        ) as template_id,
        coalesce(
            e.version_id,
            case when nullif(e.payload->>'version_id', '') ~* '^[0-9a-f-]{36}$'
                then (e.payload->>'version_id')::uuid end
        ) as version_id,
        lower(coalesce(e.estado, 'pendiente')) as estado,
        b.creado_en
    from public.prospeccion_contacto_envio e
    join public.prospeccion_contacto_batch b on b.id = e.batch_id
    join public.campanas c on c.id = b.campana_id and c.canal = 'whatsapp'
    cross join contexto_org co
    where e.organizacion_id = co.organizacion_id
      and b.organizacion_id = co.organizacion_id
      and (p_campana_id is null or b.campana_id = p_campana_id)
),
template_catalog as (
    select eb.*, t.nombre as template_nombre, t.slug as template_slug
    from envios_base eb
    left join public.prospeccion_contacto_templates t
      on t.id = eb.template_id
     and t.organizacion_id = (select organizacion_id from contexto_org)
),
message_template as (
    select distinct on (a.campana_id, a.conversacion_id)
        a.campana_id, a.conversacion_id, tc.template_id,
        tc.template_nombre, tc.template_slug, tc.version_id
    from public.campana_mensaje_atribucion a
    join template_catalog tc on tc.envio_id = a.envio_id
    where a.organizacion_id = (select organizacion_id from contexto_org)
      and a.direccion = 'saliente'
      and a.conversacion_id is not null
    order by a.campana_id, a.conversacion_id, a.es_mensaje_inicial desc nulls last, a.creado_en asc
),
conversation_rollup as (
    select
        coalesce(cc.campana_id, mt.campana_id) as campana_id,
        mt.template_id,
        max(mt.template_nombre) as template_nombre,
        max(mt.template_slug) as template_slug,
        max(mt.version_id) as version_id,
        count(distinct coalesce(cc.conversacion_id, mt.conversacion_id))::bigint as conversaciones_total,
        count(distinct coalesce(cc.conversacion_id, mt.conversacion_id)
            ) filter (where cc.respondio_en is not null)::bigint as conversaciones_respondidas,
        count(distinct cc.oportunidad_id) filter (where cc.oportunidad_id is not null)::bigint as oportunidades_total,
        count(distinct cc.oportunidad_id) filter (where cc.estado_atribucion = 'ganada')::bigint as oportunidades_ganadas
    from message_template mt
    full join (
        select *
        from public.campana_conversion
        where organizacion_id = (select organizacion_id from contexto_org)
          and (p_campana_id is null or campana_id = p_campana_id)
          and (p_date_from is null or coalesce(respondio_en, creado_en) >= p_date_from)
          and (p_date_to is null or coalesce(respondio_en, creado_en) < p_date_to)
    ) cc
      on cc.campana_id = mt.campana_id
     and cc.conversacion_id = mt.conversacion_id
    where cc.campana_id is not null
       or (p_date_from is null and p_date_to is null)
    group by coalesce(cc.campana_id, mt.campana_id), mt.template_id
),
send_rollup as (
    select tc.campana_id, tc.template_id,
        count(*)::bigint as envios_totales,
        count(*) filter (where tc.estado in ('enviado','entregado','leido','completado','respondido'))::bigint as mensajes_salientes
    from template_catalog tc
    where (p_date_from is null or tc.creado_en >= p_date_from)
      and (p_date_to is null or tc.creado_en < p_date_to)
    group by tc.campana_id, tc.template_id
),
cohort as (
    select
        coalesce(sr.campana_id, cr.campana_id) as campana_id,
        coalesce(sr.template_id, cr.template_id) as template_id,
        coalesce(sr.envios_totales, 0)::bigint as envios_totales,
        coalesce(sr.mensajes_salientes, 0)::bigint as mensajes_salientes,
        coalesce(cr.template_nombre, tc.template_nombre) as template_nombre,
        coalesce(cr.template_slug, tc.template_slug) as template_slug,
        coalesce(cr.version_id, tc.version_id) as version_id,
        coalesce(cr.conversaciones_total, 0)::bigint as conversaciones_total,
        coalesce(cr.conversaciones_respondidas, 0)::bigint as conversaciones_respondidas,
        coalesce(cr.oportunidades_total, 0)::bigint as oportunidades_total,
        coalesce(cr.oportunidades_ganadas, 0)::bigint as oportunidades_ganadas
    from send_rollup sr
    full join conversation_rollup cr
      on cr.campana_id = sr.campana_id
     and cr.template_id is not distinct from sr.template_id
    left join lateral (
        select tc2.template_nombre, tc2.template_slug, tc2.version_id
        from template_catalog tc2
        where tc2.campana_id = coalesce(sr.campana_id, cr.campana_id)
          and tc2.template_id is not distinct from coalesce(sr.template_id, cr.template_id)
        limit 1
    ) tc on true
)
select
    ch.campana_id, c.nombre, 'whatsapp'::text, ch.template_id,
    ch.template_nombre, ch.template_slug, ch.version_id,
    ch.envios_totales, ch.mensajes_salientes, ch.conversaciones_total,
    ch.conversaciones_respondidas, ch.oportunidades_total, ch.oportunidades_ganadas
from cohort ch
join public.campanas c on c.id = ch.campana_id
where ch.oportunidades_total > 0 or ch.conversaciones_total > 0 or ch.envios_totales > 0
order by ch.oportunidades_total desc, ch.conversaciones_total desc, ch.envios_totales desc, c.nombre, ch.template_nombre
limit greatest(1, least(coalesce(p_limit, 200), 1000))
offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.prospeccion_campana_whatsapp_template_metricas_rango(uuid, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.prospeccion_campana_whatsapp_template_metricas_rango(uuid, timestamptz, timestamptz, integer, integer) to authenticated, service_role;
