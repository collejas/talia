begin;

create extension if not exists pg_trgm;

create index if not exists personas_nombre_completo_trgm_idx
  on public.personas using gin (nombre_completo gin_trgm_ops);
create index if not exists personas_correo_principal_trgm_idx
  on public.personas using gin (correo_principal gin_trgm_ops);
create index if not exists mensajes_texto_trgm_idx
  on public.mensajes using gin (texto gin_trgm_ops);

create or replace function public.panel_inbox_threads_persisted_search(
  p_estado text default null,
  p_asignado uuid default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_message_limit integer default 1,
  p_source text default null,
  p_channel text default null,
  p_batch_id uuid default null,
  p_campana_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null
) returns table(
  conversacion_id uuid, contacto_id uuid, contacto_nombre text, contacto_correo text,
  contacto_telefono text, canal text, source text, batch_id uuid, campana_id uuid,
  estado text, prioridad integer, iniciada_en timestamptz, ultimo_mensaje_en timestamptz,
  no_leidos integer, asignado_id uuid, asignado_nombre text, tags text[], manual_override boolean,
  oportunidad_id uuid, parent_opportunity_id uuid, restart_sequence integer,
  conversation_history text[], last_message_preview text, last_message_at timestamptz,
  messages jsonb, total_rows bigint, reengage_attempts integer, inbox_context jsonb
)
language sql
stable
security definer
set search_path = public
as $$
with search_input as (
  select nullif(btrim(p_search), '') as term,
         regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g') as digits
), visible as (
  select t.*, count(*) over () as matched_total
  from public.inbox_threads t
  cross join search_input s
  where t.organizacion_id = public.usuario_organizacion_id((select auth.uid()))
    and public.puede_ver_inbox_thread(t.id)
    and (p_estado is null or lower(t.estado) = lower(p_estado))
    and (p_asignado is null or t.asignado_a_usuario_id = p_asignado)
    and (p_source is null or lower(coalesce(t.source, '')) = lower(p_source))
    and (p_channel is null or lower(t.canal) = lower(p_channel))
    and (p_batch_id is null or t.batch_id = p_batch_id)
    and (p_campana_id is null or t.campana_id = p_campana_id)
    and (p_from is null or t.ultimo_mensaje_en >= p_from)
    and (p_to is null or t.ultimo_mensaje_en <= p_to)
    and (
      s.term is null
      or coalesce(t.ultimo_mensaje_preview, '') ilike '%' || s.term || '%'
      or coalesce(t.telefono_normalizado, '') ilike '%' || s.term || '%'
      or (
        s.digits <> ''
        and regexp_replace(coalesce(t.telefono_normalizado, ''), '[^0-9]', '', 'g') like '%' || s.digits || '%'
      )
      or exists (
        select 1
        from public.personas p
        where p.organizacion_id = t.organizacion_id
          and p.id = t.persona_id
          and (
            coalesce(p.nombre_completo, '') ilike '%' || s.term || '%'
            or coalesce(p.correo_principal, '') ilike '%' || s.term || '%'
            or coalesce(p.correo, '') ilike '%' || s.term || '%'
            or coalesce(p.telefono_principal_e164, '') ilike '%' || s.term || '%'
            or coalesce(p.telefono_movil_1_e164, '') ilike '%' || s.term || '%'
            or coalesce(p.telefono_secundario_e164, '') ilike '%' || s.term || '%'
            or (
              s.digits <> ''
              and (
                regexp_replace(coalesce(p.telefono_principal_e164, ''), '[^0-9]', '', 'g') like '%' || s.digits || '%'
                or regexp_replace(coalesce(p.telefono_movil_1_e164, ''), '[^0-9]', '', 'g') like '%' || s.digits || '%'
                or regexp_replace(coalesce(p.telefono_secundario_e164, ''), '[^0-9]', '', 'g') like '%' || s.digits || '%'
              )
            )
          )
      )
      or exists (
        select 1
        from public.inbox_thread_conversations rel
        join public.conversaciones cv on cv.id = rel.conversacion_id
        left join public.personas cp on cp.organizacion_id = cv.organizacion_id
                                      and cp.id = coalesce(cv.persona_id, cv.contacto_id)
        where rel.organizacion_id = t.organizacion_id
          and rel.inbox_thread_id = t.id
          and (
            coalesce(cv.nombre_remitente, '') ilike '%' || s.term || '%'
            or coalesce(cv.correo_remitente, '') ilike '%' || s.term || '%'
            or coalesce(cv.inbox_context->>'contacto_telefono', '') ilike '%' || s.term || '%'
            or coalesce(cp.nombre_completo, '') ilike '%' || s.term || '%'
            or coalesce(cp.correo_principal, '') ilike '%' || s.term || '%'
          )
      )
      or exists (
        select 1
        from public.inbox_thread_conversations rel
        join public.mensajes m on m.conversacion_id = rel.conversacion_id
        where rel.organizacion_id = t.organizacion_id
          and rel.inbox_thread_id = t.id
          and coalesce(m.texto, '') ilike '%' || s.term || '%'
      )
    )
), paged as (
  select * from visible
  order by ultimo_mensaje_en desc nulls last, id desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1)
  offset greatest(coalesce(p_offset, 0), 0)
)
select
  t.conversacion_canonica_id,
  t.persona_id,
  coalesce(p.nombre_completo, nullif(c.nombre_remitente, ''), nullif(c.correo_remitente, ''), 'Visitante'),
  coalesce(p.correo_principal, p.correo, nullif(c.correo_remitente, '')),
  coalesce(p.telefono_principal_e164, p.telefono_movil_1_e164, p.telefono_secundario_e164,
           nullif(c.inbox_context->>'contacto_telefono', '')),
  t.canal, t.source, t.batch_id, t.campana_id, t.estado, t.prioridad, t.iniciada_en,
  t.ultimo_mensaje_en, t.no_leidos, t.asignado_a_usuario_id, u.nombre_completo,
  coalesce(tags.tags, array[]::text[]), coalesce(ctrl.manual_override, false),
  opp.id, (opp.metadata->>'parent_opportunity_id')::uuid,
  coalesce(opp.restart_sequence, c.restart_sequence, 1), history.ids,
  t.ultimo_mensaje_preview, t.ultimo_mensaje_en, coalesce(msg.items, '[]'::jsonb),
  t.matched_total, coalesce((opp.metadata->'whatsapp_followup'->'reengage'->>'attempts')::integer, 0),
  jsonb_strip_nulls(jsonb_build_object(
    'source', t.source, 'batch_id', t.batch_id, 'campana_id', t.campana_id,
    'template_id', t.template_id, 'template_slug', t.template_slug,
    'template_label', t.template_label, 'cuenta_id', t.cuenta_id
  ))
from paged t
join public.conversaciones c on c.id = t.conversacion_canonica_id
left join public.personas p on p.id = t.persona_id
left join public.usuarios u on u.id = t.asignado_a_usuario_id
left join public.conversaciones_controles ctrl on ctrl.conversacion_id = t.conversacion_canonica_id
left join lateral (
  select array_agg(distinct x.tag order by x.tag) as tags
  from public.inbox_thread_conversations rel
  join public.conversaciones_insights ci on ci.conversacion_id = rel.conversacion_id
  cross join lateral jsonb_array_elements_text(coalesce(ci.tags, '[]'::jsonb)) x(tag)
  where rel.inbox_thread_id = t.id
) tags on true
left join lateral (
  select o.* from public.oportunidades o
  where o.organizacion_id = t.organizacion_id
    and (o.persona_id = t.persona_id or o.contacto_principal_id = t.persona_id
      or o.metadata->>'conversation_id' = t.conversacion_canonica_id::text)
  order by (o.metadata->>'conversation_id' = t.conversacion_canonica_id::text) desc,
    o.actualizado_en desc, o.id desc limit 1
) opp on true
left join lateral (
  select array_agg(rel.conversacion_id::text order by cv.iniciada_en, rel.conversacion_id) as ids
  from public.inbox_thread_conversations rel
  join public.conversaciones cv on cv.id = rel.conversacion_id
  where rel.inbox_thread_id = t.id
) history on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'message_id', q.id,
    'author', case when q.direccion = 'entrante' then coalesce(p.nombre_completo, 'Visitante') else coalesce(u.nombre_completo, 'Equipo Tal-IA') end,
    'role', case when q.direccion = 'entrante' then 'contacto' else 'usuario' end,
    'timestamp', q.creado_en, 'body', array[coalesce(nullif(q.texto, ''), '(mensaje sin texto)')],
    'tipo_contenido', q.tipo_contenido, 'datos', q.datos,
    'attachments', coalesce(q.attachments, '[]'::jsonb)
  ) order by q.creado_en) as items
  from (
    select m.*,
      (select jsonb_agg(jsonb_build_object('id', a.id, 'url', a.url, 'mime', a.mime,
        'size', coalesce(a.size_bytes, a.tamano_bytes), 'name', a.nombre,
        'provider_id', a.proveedor_id, 'path', a.path) order by a.creado_en)
       from public.adjuntos a where a.mensaje_id = m.id) attachments
    from public.inbox_thread_conversations rel
    join public.mensajes m on m.conversacion_id = rel.conversacion_id
    where rel.inbox_thread_id = t.id
    order by m.creado_en desc, m.id desc
    limit greatest(least(coalesce(p_message_limit, 1), 50), 1)
  ) q
) msg on true
order by t.ultimo_mensaje_en desc nulls last, t.id desc;
$$;

grant execute on function public.panel_inbox_threads_persisted_search(
  text, uuid, integer, integer, integer, text, text, uuid, uuid, timestamptz, timestamptz, text
) to authenticated, service_role;

commit;
