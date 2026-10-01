create or replace function public.prospeccion_campana_template_atribucion_rango(
    p_campana_id uuid default null,
    p_limit integer default 200,
    p_date_from timestamptz default null,
    p_date_to timestamptz default null,
    p_offset integer default 0
)
returns table(
    campana_id uuid,
    campana_nombre text,
    canal text,
    template_id uuid,
    template_slug text,
    template_nombre text,
    twilio_content_sid text,
    envios_totales bigint,
    envios_enviados bigint,
    envios_entregados bigint,
    envios_fallidos bigint,
    envios_omitidos bigint,
    envios_respondidos bigint,
    brevo_aperturas bigint,
    brevo_clicks bigint,
    sesiones_utm bigint,
    tasa_entrega_pct numeric,
    tasa_respuesta_pct numeric,
    click_to_session_pct numeric
)
language sql
stable
as $function$
with contexto_org as (
    select coalesce(
        nullif((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    ) as organizacion_id
),
campanas_scope as (
    select b.id as batch_id, b.campana_id, b.organizacion_id
    from public.prospeccion_contacto_batch b
    cross join contexto_org co
    where b.organizacion_id = co.organizacion_id
      and (p_campana_id is null or b.campana_id = p_campana_id)
),
envios_pre as (
    select
        e.id as envio_id,
        cs.campana_id,
        cs.organizacion_id,
        e.canal,
        lower(coalesce(e.estado, 'pendiente')) as estado,
        case
            when e.canal = 'correo' then coalesce(
                e.proveedor_aceptado_en,
                e.despacho_iniciado_en,
                e.procesado_en,
                e.creado_en,
                e.programado_en
            )
            else coalesce(e.procesado_en, e.creado_en, e.programado_en)
        end as event_ts,
        case
            when coalesce(e.payload->>'template_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (e.payload->>'template_id')::uuid
        end as template_uuid,
        lower(coalesce(
            nullif(btrim(e.payload->'metadata'->>'template_slug'), ''),
            nullif(btrim(e.payload->>'template_slug'), '')
        )) as template_slug,
        nullif(btrim(coalesce(
            e.detalle->>'template_sid',
            e.payload->'metadata'->>'template_sid',
            e.payload->>'template_sid'
        )), '') as twilio_content_sid
    from campanas_scope cs
    join public.prospeccion_contacto_envio e on e.batch_id = cs.batch_id
    where e.organizacion_id = cs.organizacion_id
),
-- Este conjunto se reutiliza para los agregados de logs, envíos y sesiones.
-- Materializarlo evita que el plan vuelva a recorrer los envíos por cada CTE
-- cuando el rango solicitado es anual.
envios_base as materialized (
    select *
    from envios_pre
    where (p_date_from is null or event_ts >= p_date_from)
      and (p_date_to is null or event_ts <= p_date_to)
),
scoped_envio_ids as (
    select envio_id
    from envios_base
),
scoped_logs as materialized (
    select l.envio_id, l.accion, l.estado, l.canal, l.detalle
    from public.prospeccion_contactos_log l
    join scoped_envio_ids s on s.envio_id = l.envio_id
    cross join contexto_org co
    where l.organizacion_id = co.organizacion_id
      and (
          lower(coalesce(l.accion, '')) in ('reply_inbound', 'respondido', 'postmark_open', 'postmark_click')
          or lower(coalesce(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) in ('unique_opened', 'opened', 'unique_click', 'click')
          or lower(coalesce(l.detalle->>'direction', '')) in ('inbound', 'incoming')
          or coalesce(l.detalle->>'respondio', '') = 'true'
          or coalesce(l.detalle->>'respuesta', '') <> ''
      )
),
respuesta_por_envio as (
    select
        l.envio_id,
        bool_or(
            lower(coalesce(l.accion, l.detalle->>'action', l.estado, '')) = any(array['respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound'])
            or lower(coalesce(l.detalle->>'direction', '')) = any(array['inbound', 'incoming'])
            or coalesce(l.detalle->>'respondio', '') = 'true'
            or coalesce(l.detalle->>'respuesta', '') <> ''
        ) as respondio
    from scoped_logs l
    group by l.envio_id
),
engagement_por_envio as (
    select
        l.envio_id,
        (
            count(*) filter (where lower(coalesce(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) in ('unique_opened', 'opened')) > 0
            or count(*) filter (where l.accion = 'postmark_open') > 0
        )::int as aperturas,
        (
            count(*) filter (where lower(coalesce(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) in ('unique_click', 'click')) > 0
            or count(*) filter (where l.accion = 'postmark_click') > 0
        )::int as clicks
    from scoped_logs l
    group by l.envio_id
),
agg_envios as (
    select
        eb.campana_id,
        c.nombre as campana_nombre,
        eb.canal,
        eb.template_uuid as template_id,
        coalesce(lower(t.slug), eb.template_slug) as template_slug,
        coalesce(t.nombre, coalesce(t.slug, eb.template_slug), 'Plantilla sin nombre') as template_nombre,
        eb.twilio_content_sid,
        count(*)::bigint as envios_totales,
        count(*) filter (where eb.estado in ('enviado', 'entregado', 'leido', 'completado', 'respondido'))::bigint as envios_enviados,
        count(*) filter (where eb.estado in ('entregado', 'leido', 'completado', 'respondido'))::bigint as envios_entregados,
        count(*) filter (where eb.estado in ('fallido', 'error', 'failed', 'undelivered'))::bigint as envios_fallidos,
        count(*) filter (where eb.estado = 'omitido')::bigint as envios_omitidos,
        count(*) filter (where coalesce(r.respondio, false))::bigint as envios_respondidos,
        coalesce(sum(ep.aperturas), 0)::bigint as brevo_aperturas,
        coalesce(sum(ep.clicks), 0)::bigint as brevo_clicks
    from envios_base eb
    left join public.campanas c on c.id = eb.campana_id
    left join public.prospeccion_contacto_templates t
        on t.organizacion_id = eb.organizacion_id
       and t.id = eb.template_uuid
    left join respuesta_por_envio r on r.envio_id = eb.envio_id
    left join engagement_por_envio ep on ep.envio_id = eb.envio_id
    group by
        eb.campana_id,
        c.nombre,
        eb.canal,
        eb.template_uuid,
        coalesce(lower(t.slug), eb.template_slug),
        coalesce(t.nombre, coalesce(t.slug, eb.template_slug), 'Plantilla sin nombre'),
        eb.twilio_content_sid
),
sesion_signals_pre as (
    select
        w.session_id,
        nullif(substring(w.landing_url from '(?:\\?|&)utm_source=([^&#]+)'), '') as raw_utm_source,
        nullif(substring(w.landing_url from '(?:\\?|&)utm_medium=([^&#]+)'), '') as raw_utm_medium,
        nullif(substring(w.landing_url from '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'), '')::uuid as envio_id
    from public.webchat_visitantes w
    cross join contexto_org co
    where w.organizacion_id = co.organizacion_id
      and coalesce(w.landing_url, '') <> ''
),
sesion_signals as (
    select
        s.session_id,
        lower(coalesce(s.raw_utm_source, '')) as utm_source,
        lower(coalesce(s.raw_utm_medium, '')) as utm_medium,
        s.envio_id
    from sesion_signals_pre s
    join scoped_envio_ids ei on ei.envio_id = s.envio_id
),
sesion_por_envio as (
    select envio_id, count(distinct session_id)::bigint as sesiones
    from sesion_signals
    where utm_source = 'prospeccion'
      and utm_medium = 'email'
      and envio_id is not null
    group by envio_id
),
sesion_atribucion as (
    select
        eb.campana_id,
        eb.template_uuid as template_id,
        coalesce(lower(t.slug), eb.template_slug) as template_slug,
        eb.twilio_content_sid,
        coalesce(sum(se.sesiones), 0)::bigint as sesiones
    from envios_base eb
    left join public.prospeccion_contacto_templates t
        on t.organizacion_id = eb.organizacion_id
       and t.id = eb.template_uuid
    left join sesion_por_envio se on se.envio_id = eb.envio_id
    group by
        eb.campana_id,
        eb.template_uuid,
        coalesce(lower(t.slug), eb.template_slug),
        eb.twilio_content_sid
)
select
    a.campana_id,
    a.campana_nombre,
    a.canal,
    a.template_id,
    a.template_slug,
    a.template_nombre,
    a.twilio_content_sid,
    a.envios_totales,
    a.envios_enviados,
    a.envios_entregados,
    a.envios_fallidos,
    a.envios_omitidos,
    a.envios_respondidos,
    a.brevo_aperturas,
    a.brevo_clicks,
    coalesce(sa.sesiones, 0)::bigint,
    case when a.envios_totales = 0 then 0 else round((a.envios_entregados::numeric * 100.0) / a.envios_totales::numeric, 2) end,
    case when a.envios_totales = 0 then 0 else round((a.envios_respondidos::numeric * 100.0) / a.envios_totales::numeric, 2) end,
    case when coalesce(sa.sesiones, 0) = 0 then 0 else round((a.brevo_clicks::numeric * 100.0) / sa.sesiones::numeric, 2) end
from agg_envios a
left join sesion_atribucion sa
    on sa.campana_id is not distinct from a.campana_id
   and sa.template_id is not distinct from a.template_id
   and sa.template_slug is not distinct from a.template_slug
   and sa.twilio_content_sid is not distinct from a.twilio_content_sid
order by a.envios_totales desc, a.campana_nombre nulls last, a.template_nombre, a.twilio_content_sid nulls last
limit greatest(1, coalesce(p_limit, 200))
offset greatest(coalesce(p_offset, 0), 0);
$function$;
