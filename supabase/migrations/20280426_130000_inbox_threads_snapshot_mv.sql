-- Inbox: materialized view de snapshot por conversación para reducir costo
-- de metadata derivada y preview del último mensaje en panel_inbox_threads.

drop materialized view if exists public.inbox_conversation_snapshot_mv;

create materialized view public.inbox_conversation_snapshot_mv
as
with latest_message as (
  select distinct on (m.conversacion_id)
    m.conversacion_id,
    lower(
      nullif(
        coalesce(m.datos->>'channel', m.datos->>'canal'),
        ''
      )
    ) as channel,
    lower(nullif(m.datos->>'source', '')) as source,
    case
      when (m.datos->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (m.datos->>'batch_id')::uuid
      else null
    end as batch_id,
    case
      when (m.datos->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (m.datos->>'campana_id')::uuid
      else null
    end as campana_id,
    m.texto as last_message_preview,
    m.creado_en as last_message_at
  from public.mensajes m
  order by m.conversacion_id, m.creado_en desc
)
select
  c.id as conversacion_id,
  coalesce(nullif(lm.channel, ''), c.canal) as canal,
  lm.source,
  lm.batch_id,
  lm.campana_id,
  lm.last_message_preview,
  lm.last_message_at,
  coalesce(lm.last_message_at, c.ultimo_mensaje_en, c.iniciada_en) as sort_key
from public.conversaciones c
left join latest_message lm on lm.conversacion_id = c.id
with data;

create unique index if not exists inbox_conversation_snapshot_mv_uk
  on public.inbox_conversation_snapshot_mv (conversacion_id);

create index if not exists inbox_conversation_snapshot_mv_sort_idx
  on public.inbox_conversation_snapshot_mv (sort_key desc);

create index if not exists inbox_conversation_snapshot_mv_filter_idx
  on public.inbox_conversation_snapshot_mv (canal, source, batch_id, campana_id);

drop function if exists public.panel_inbox_threads(
  text,
  uuid,
  integer,
  integer,
  integer,
  text,
  text,
  uuid,
  uuid,
  timestamptz,
  timestamptz
);

create or replace function public.panel_inbox_threads(
    p_estado text default null,
    p_asignado uuid default null,
    p_limit integer default 50,
    p_offset integer default 0,
    p_message_limit integer default 20,
    p_source text default null,
    p_channel text default null,
    p_batch_id uuid default null,
    p_campana_id uuid default null,
    p_from timestamptz default null,
    p_to timestamptz default null
) returns table(
    conversacion_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    canal text,
    source text,
    batch_id uuid,
    campana_id uuid,
    estado text,
    prioridad integer,
    iniciada_en timestamptz,
    ultimo_mensaje_en timestamptz,
    no_leidos integer,
    asignado_id uuid,
    asignado_nombre text,
    tags text[],
    manual_override boolean,
    oportunidad_id uuid,
    parent_opportunity_id uuid,
    restart_sequence integer,
    conversation_history text[],
    last_message_preview text,
    last_message_at timestamptz,
    messages jsonb,
    total_rows bigint,
    reengage_attempts integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
with filtered as (
    select
        c.id as conversacion_id,
        c.contacto_id,
        ct.nombre_completo as contacto_nombre,
        nullif(ct.correo, '') as contacto_correo,
        nullif(ct.telefono_e164, '') as contacto_telefono,
        coalesce(snap.canal, c.canal) as canal,
        snap.source,
        snap.batch_id,
        snap.campana_id,
        c.estado,
        c.prioridad,
        c.iniciada_en,
        c.ultimo_mensaje_en,
        coalesce(c.no_leidos, 0) as no_leidos,
        c.asignado_a_usuario_id as asignado_id,
        asignado.nombre_completo as asignado_nombre,
        array(
            select jsonb_array_elements_text(coalesce(ci.tags, '[]'::jsonb))
        ) as tags,
        coalesce(cc.manual_override, false) as manual_override,
        opp.oportunidad_id,
        (opp.oportunidad_metadata->>'parent_opportunity_id')::uuid as parent_opportunity_id,
        coalesce(
            (opp.oportunidad_metadata->>'restart_sequence')::integer,
            c.restart_sequence,
            1
        ) as restart_sequence,
        coalesce(
            (opp.oportunidad_metadata->'whatsapp_followup'->'reengage'->>'attempts')::integer,
            0
        ) as reengage_attempts,
        coalesce(
            array(
                select jsonb_array_elements_text(
                    coalesce(opp.oportunidad_metadata->'conversation_history', '[]'::jsonb)
                )
            ),
            array[c.id::text]
        ) as conversation_history,
        snap.last_message_preview,
        snap.last_message_at,
        coalesce(snap.sort_key, c.ultimo_mensaje_en, c.iniciada_en) as sort_key
    from public.conversaciones c
    join public.contactos ct on ct.id = c.contacto_id
    left join public.usuarios asignado on asignado.id = c.asignado_a_usuario_id
    left join public.conversaciones_insights ci on ci.conversacion_id = c.id
    left join public.conversaciones_controles cc on cc.conversacion_id = c.id
    left join public.inbox_conversation_snapshot_mv snap on snap.conversacion_id = c.id
    left join lateral (
        select o.id as oportunidad_id, o.metadata as oportunidad_metadata
        from public.oportunidades o
        where o.metadata->>'conversation_id' = c.id::text
        order by o.creado_en desc
        limit 1
    ) opp on true
    where public.puede_ver_conversacion(c.id)
      and (p_estado is null or lower(c.estado) = lower(p_estado))
      and (p_asignado is null or c.asignado_a_usuario_id = p_asignado)
      and (
        p_channel is null
        or lower(coalesce(nullif(snap.canal, ''), c.canal)) = lower(p_channel)
      )
      and (p_source is null or lower(coalesce(snap.source, '')) = lower(p_source))
      and (p_batch_id is null or coalesce(snap.batch_id::text, '') = p_batch_id::text)
      and (p_campana_id is null or coalesce(snap.campana_id::text, '') = p_campana_id::text)
      and (p_from is null or coalesce(c.ultimo_mensaje_en, c.iniciada_en) >= p_from)
      and (p_to is null or coalesce(c.ultimo_mensaje_en, c.iniciada_en) <= p_to)
),
annotated as (
    select
        f.*,
        count(*) over () as total_rows
    from filtered f
),
messages_by_thread as (
    select
        a.conversacion_id,
        jsonb_agg(
            jsonb_build_object(
                'message_id', msg.id,
                'author', case
                    when msg.direccion = 'entrante' then coalesce(a.contacto_nombre, 'Visitante')
                    else coalesce(a.asignado_nombre, 'Equipo Tal-IA')
                end,
                'role', case when msg.direccion = 'entrante' then 'contacto' else 'usuario' end,
                'timestamp', msg.creado_en,
                'body', array[coalesce(nullif(msg.texto, ''), '(mensaje sin texto)')],
                'tipo_contenido', msg.tipo_contenido,
                'datos', msg.datos,
                'attachments', coalesce(
                    (
                        select jsonb_agg(
                            jsonb_build_object(
                                'id', adj.id,
                                'url', adj.url,
                                'mime', adj.mime,
                                'size', coalesce(adj.size_bytes, adj.tamano_bytes),
                                'name', adj.nombre,
                                'provider_id', adj.proveedor_id,
                                'path', adj.path
                            ) order by adj.creado_en asc
                        )
                        from public.adjuntos adj
                        where adj.mensaje_id = msg.id
                    ),
                    '[]'::jsonb
                )
            )
            order by msg.creado_en
        ) filter (where msg.id is not null) as items
    from annotated a
    left join lateral (
        select m.*
        from public.mensajes m
        where m.conversacion_id = a.conversacion_id
        order by m.creado_en desc
        limit greatest(coalesce(p_message_limit, 20), 1)
    ) as msg on true
    group by a.conversacion_id
)
select
    a.conversacion_id,
    a.contacto_id,
    a.contacto_nombre,
    a.contacto_correo,
    a.contacto_telefono,
    a.canal,
    a.source,
    a.batch_id,
    a.campana_id,
    a.estado,
    a.prioridad,
    a.iniciada_en,
    a.ultimo_mensaje_en,
    a.no_leidos,
    a.asignado_id,
    a.asignado_nombre,
    a.tags,
    a.manual_override,
    a.oportunidad_id,
    a.parent_opportunity_id,
    a.restart_sequence,
    a.conversation_history,
    a.last_message_preview,
    a.last_message_at,
    coalesce(messages.items, '[]'::jsonb) as messages,
    a.total_rows,
    a.reengage_attempts
from annotated a
left join messages_by_thread messages on messages.conversacion_id = a.conversacion_id
order by a.sort_key desc
limit coalesce(nullif(p_limit, 0), 50)
offset greatest(p_offset, 0);
$function$;

create or replace function public.inbox_conversation_snapshot_mv_refresh()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view public.inbox_conversation_snapshot_mv;
$$;

grant execute on function public.inbox_conversation_snapshot_mv_refresh() to service_role;
