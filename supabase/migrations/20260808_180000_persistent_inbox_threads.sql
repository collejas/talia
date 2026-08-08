begin;

create table if not exists public.inbox_threads (
    id uuid primary key default gen_random_uuid(),
    organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
    group_key text not null,
    canal text not null,
    telefono_normalizado text,
    conversacion_canonica_id uuid,
    persona_id uuid,
    cuenta_id uuid,
    estado text not null default 'abierta',
    prioridad integer not null default 0,
    asignado_a_usuario_id uuid,
    iniciada_en timestamptz not null,
    ultimo_mensaje_id uuid,
    ultimo_mensaje_en timestamptz,
    ultimo_mensaje_preview text,
    no_leidos integer not null default 0 check (no_leidos >= 0),
    source text,
    batch_id uuid,
    campana_id uuid,
    template_id uuid,
    template_slug text,
    template_label text,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint inbox_threads_group_key_nonempty check (btrim(group_key) <> ''),
    constraint inbox_threads_org_group_key_key unique (organizacion_id, group_key),
    constraint inbox_threads_org_id_key unique (organizacion_id, id),
    constraint inbox_threads_conversation_org_fkey
      foreign key (organizacion_id, conversacion_canonica_id)
      references public.conversaciones(organizacion_id, id) on delete set null deferrable initially deferred,
    constraint inbox_threads_persona_org_fkey
      foreign key (organizacion_id, persona_id)
      references public.personas(organizacion_id, id) on delete set null,
    constraint inbox_threads_cuenta_org_fkey
      foreign key (organizacion_id, cuenta_id)
      references public.cuentas(organizacion_id, id) on delete set null,
    constraint inbox_threads_asignado_org_fkey
      foreign key (organizacion_id, asignado_a_usuario_id)
      references public.usuarios(organizacion_id, id) on delete set null,
    constraint inbox_threads_message_org_fkey
      foreign key (organizacion_id, ultimo_mensaje_id)
      references public.mensajes(organizacion_id, id) on delete set null deferrable initially deferred
);

create table if not exists public.inbox_thread_conversations (
    id uuid primary key default gen_random_uuid(),
    organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
    inbox_thread_id uuid not null,
    conversacion_id uuid not null,
    agregado_en timestamptz not null default now(),
    constraint inbox_thread_conversations_thread_org_fkey
      foreign key (organizacion_id, inbox_thread_id)
      references public.inbox_threads(organizacion_id, id) on delete cascade,
    constraint inbox_thread_conversations_conversation_org_fkey
      foreign key (organizacion_id, conversacion_id)
      references public.conversaciones(organizacion_id, id) on delete cascade,
    constraint inbox_thread_conversations_conversation_key unique (conversacion_id),
    constraint inbox_thread_conversations_thread_conversation_key unique (inbox_thread_id, conversacion_id)
);

create index if not exists inbox_threads_org_last_idx
  on public.inbox_threads (organizacion_id, ultimo_mensaje_en desc nulls last, id desc);
create index if not exists inbox_threads_org_channel_last_idx
  on public.inbox_threads (organizacion_id, canal, ultimo_mensaje_en desc nulls last, id desc);
create index if not exists inbox_threads_org_status_last_idx
  on public.inbox_threads (organizacion_id, estado, ultimo_mensaje_en desc nulls last, id desc);
create index if not exists inbox_threads_org_assignee_last_idx
  on public.inbox_threads (organizacion_id, asignado_a_usuario_id, ultimo_mensaje_en desc nulls last, id desc);
create index if not exists inbox_threads_org_source_last_idx
  on public.inbox_threads (organizacion_id, source, ultimo_mensaje_en desc nulls last, id desc)
  where source is not null;
create index if not exists inbox_threads_org_batch_idx
  on public.inbox_threads (organizacion_id, batch_id) where batch_id is not null;
create index if not exists inbox_threads_org_campaign_idx
  on public.inbox_threads (organizacion_id, campana_id) where campana_id is not null;
create index if not exists inbox_threads_persona_idx on public.inbox_threads (persona_id) where persona_id is not null;
create index if not exists inbox_threads_cuenta_idx on public.inbox_threads (cuenta_id) where cuenta_id is not null;
create index if not exists inbox_thread_conversations_thread_idx
  on public.inbox_thread_conversations (inbox_thread_id, conversacion_id);
create index if not exists inbox_thread_conversations_org_idx
  on public.inbox_thread_conversations (organizacion_id, inbox_thread_id);

create or replace function public.inbox_normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    case
      when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) = 13
       and left(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 3) = '521'
      then '52' || substr(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 4)
      else regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    end,
    ''
  );
$$;

create or replace function public.inbox_recompute_thread(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.inbox_thread_conversations
  where inbox_thread_id = p_thread_id;

  if v_count = 0 then
    delete from public.inbox_threads where id = p_thread_id;
    return;
  end if;

  with ranked as (
    select
      c.*,
      coalesce(c.persona_id, c.contacto_id) as resolved_persona_id,
      row_number() over (
        order by coalesce(c.ultimo_mensaje_en, c.iniciada_en) desc nulls last, c.id desc
      ) as rn,
      sum(coalesce(c.no_leidos, 0)) over ()::integer as total_unread
    from public.inbox_thread_conversations itc
    join public.conversaciones c on c.id = itc.conversacion_id
    where itc.inbox_thread_id = p_thread_id
  ), canonical as (
    select * from ranked where rn = 1
  )
  update public.inbox_threads t
  set
    conversacion_canonica_id = c.id,
    persona_id = c.resolved_persona_id,
    cuenta_id = account.cuenta_id,
    canal = lower(c.canal),
    estado = c.estado,
    prioridad = c.prioridad,
    asignado_a_usuario_id = c.asignado_a_usuario_id,
    iniciada_en = c.iniciada_en,
    ultimo_mensaje_id = c.ultimo_mensaje_id,
    ultimo_mensaje_en = coalesce(c.ultimo_mensaje_en, c.iniciada_en),
    ultimo_mensaje_preview = nullif(m.texto, ''),
    no_leidos = c.total_unread,
    source = nullif(c.inbox_context->>'source', ''),
    batch_id = case when (c.inbox_context->>'batch_id') ~* '^[0-9a-f-]{36}$' then (c.inbox_context->>'batch_id')::uuid end,
    campana_id = case when (c.inbox_context->>'campana_id') ~* '^[0-9a-f-]{36}$' then (c.inbox_context->>'campana_id')::uuid end,
    template_id = case when (c.inbox_context->>'template_id') ~* '^[0-9a-f-]{36}$' then (c.inbox_context->>'template_id')::uuid end,
    template_slug = nullif(c.inbox_context->>'template_slug', ''),
    template_label = nullif(c.inbox_context->>'template_label', ''),
    actualizado_en = now()
  from canonical c
  left join public.mensajes m on m.id = c.ultimo_mensaje_id
  left join lateral (
    select cp.cuenta_id
    from public.cuenta_personas cp
    where cp.organizacion_id = c.organizacion_id
      and cp.persona_id = c.resolved_persona_id
      and cp.activo
    order by cp.es_contacto_principal desc, cp.actualizado_en desc, cp.id
    limit 1
  ) account on true
  where t.id = p_thread_id;
end;
$$;

create or replace function public.inbox_sync_conversation(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_channel text;
  v_phone text;
  v_group_key text;
  v_thread_id uuid;
  v_old_thread_id uuid;
begin
  select
    c.organizacion_id,
    lower(c.canal),
    public.inbox_normalize_phone(coalesce(
      p.telefono_principal_e164,
      p.telefono_movil_1_e164,
      p.telefono_secundario_e164,
      c.inbox_context->>'contacto_telefono'
    ))
  into v_org, v_channel, v_phone
  from public.conversaciones c
  left join public.personas p on p.id = coalesce(c.persona_id, c.contacto_id)
  where c.id = p_conversation_id;

  if v_org is null then
    return null;
  end if;

  v_group_key := case
    when v_channel = 'whatsapp' and v_phone is not null then 'whatsapp:' || v_phone
    else 'conversation:' || p_conversation_id::text
  end;

  select inbox_thread_id into v_old_thread_id
  from public.inbox_thread_conversations
  where conversacion_id = p_conversation_id;

  insert into public.inbox_threads (
    organizacion_id, group_key, canal, telefono_normalizado, conversacion_canonica_id, iniciada_en
  )
  select c.organizacion_id, v_group_key, v_channel, v_phone, c.id, c.iniciada_en
  from public.conversaciones c where c.id = p_conversation_id
  on conflict (organizacion_id, group_key) do update
    set telefono_normalizado = excluded.telefono_normalizado,
        actualizado_en = now()
  returning id into v_thread_id;

  insert into public.inbox_thread_conversations (organizacion_id, inbox_thread_id, conversacion_id)
  values (v_org, v_thread_id, p_conversation_id)
  on conflict (conversacion_id) do update
    set organizacion_id = excluded.organizacion_id,
        inbox_thread_id = excluded.inbox_thread_id;

  perform public.inbox_recompute_thread(v_thread_id);
  if v_old_thread_id is not null and v_old_thread_id <> v_thread_id then
    perform public.inbox_recompute_thread(v_old_thread_id);
  end if;
  return v_thread_id;
end;
$$;

create or replace function public.inbox_rebuild_threads(p_organizacion_id uuid default null)
returns table(threads bigint, conversations bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation record;
begin
  for v_conversation in
    select id from public.conversaciones
    where p_organizacion_id is null or organizacion_id = p_organizacion_id
    order by iniciada_en, id
  loop
    perform public.inbox_sync_conversation(v_conversation.id);
  end loop;

  delete from public.inbox_threads t
  where (p_organizacion_id is null or t.organizacion_id = p_organizacion_id)
    and not exists (
      select 1 from public.inbox_thread_conversations itc where itc.inbox_thread_id = t.id
    );

  return query
  select
    count(distinct itc.inbox_thread_id)::bigint,
    count(*)::bigint
  from public.inbox_thread_conversations itc
  where p_organizacion_id is null or itc.organizacion_id = p_organizacion_id;
end;
$$;

create or replace function public.inbox_conversation_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.inbox_sync_conversation(new.id);
  return new;
end;
$$;

drop trigger if exists inbox_conversation_projection_sync on public.conversaciones;
create trigger inbox_conversation_projection_sync
after insert or update of persona_id, contacto_id, canal, estado, asignado_a_usuario_id,
  prioridad, no_leidos, ultimo_mensaje_id, ultimo_mensaje_en, inbox_context
on public.conversaciones
for each row execute function public.inbox_conversation_projection_trigger();

create or replace function public.inbox_message_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.inbox_sync_conversation(coalesce(new.conversacion_id, old.conversacion_id));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists inbox_message_projection_sync on public.mensajes;
create trigger inbox_message_projection_sync
after insert or update of texto, creado_en, estado or delete on public.mensajes
for each row execute function public.inbox_message_projection_trigger();

create or replace function public.inbox_persona_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  for v_id in
    select c.id from public.conversaciones c
    where coalesce(c.persona_id, c.contacto_id) = new.id
  loop
    perform public.inbox_sync_conversation(v_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists inbox_persona_projection_sync on public.personas;
create trigger inbox_persona_projection_sync
after update of telefono_principal_e164, telefono_movil_1_e164, telefono_secundario_e164,
  nombre_completo, correo_principal
on public.personas
for each row execute function public.inbox_persona_projection_trigger();

create or replace function public.inbox_account_relation_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_persona_id uuid := coalesce(new.persona_id, old.persona_id); v_id uuid;
begin
  for v_id in
    select c.id from public.conversaciones c
    where coalesce(c.persona_id, c.contacto_id) = v_persona_id
  loop
    perform public.inbox_sync_conversation(v_id);
  end loop;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists inbox_account_relation_projection_sync on public.cuenta_personas;
create trigger inbox_account_relation_projection_sync
after insert or update of cuenta_id, persona_id, activo, es_contacto_principal or delete
on public.cuenta_personas
for each row execute function public.inbox_account_relation_projection_trigger();

create or replace function public.panel_inbox_threads_persisted(
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
  p_to timestamptz default null
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
with visible as (
  select t.*, count(*) over () as matched_total
  from public.inbox_threads t
  where t.organizacion_id = public.usuario_organizacion_id((select auth.uid()))
    and (p_estado is null or lower(t.estado) = lower(p_estado))
    and (p_asignado is null or t.asignado_a_usuario_id = p_asignado)
    and (p_source is null or lower(coalesce(t.source, '')) = lower(p_source))
    and (p_channel is null or lower(t.canal) = lower(p_channel))
    and (p_batch_id is null or t.batch_id = p_batch_id)
    and (p_campana_id is null or t.campana_id = p_campana_id)
    and (p_from is null or t.ultimo_mensaje_en >= p_from)
    and (p_to is null or t.ultimo_mensaje_en <= p_to)
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
  coalesce(
    p.telefono_principal_e164,
    p.telefono_movil_1_e164,
    p.telefono_secundario_e164,
    nullif(c.inbox_context->>'contacto_telefono', '')
  ),
  t.canal, t.source, t.batch_id, t.campana_id, t.estado, t.prioridad, t.iniciada_en,
  t.ultimo_mensaje_en, t.no_leidos, t.asignado_a_usuario_id, u.nombre_completo,
  coalesce(tags.tags, array[]::text[]), coalesce(ctrl.manual_override, false),
  opp.id, (opp.metadata->>'parent_opportunity_id')::uuid,
  coalesce(opp.restart_sequence, c.restart_sequence, 1),
  history.ids, t.ultimo_mensaje_preview, t.ultimo_mensaje_en,
  coalesce(msg.items, '[]'::jsonb), t.matched_total,
  coalesce((opp.metadata->'whatsapp_followup'->'reengage'->>'attempts')::integer, 0),
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
    'timestamp', q.creado_en,
    'body', array[coalesce(nullif(q.texto, ''), '(mensaje sin texto)')],
    'tipo_contenido', q.tipo_contenido,
    'datos', q.datos,
    'attachments', coalesce(q.attachments, '[]'::jsonb)
  ) order by q.creado_en) as items
  from (
    select m.*,
      (select jsonb_agg(jsonb_build_object('id',a.id,'url',a.url,'mime',a.mime,
        'size',coalesce(a.size_bytes,a.tamano_bytes),'name',a.nombre,'provider_id',a.proveedor_id,'path',a.path)
        order by a.creado_en) from public.adjuntos a where a.mensaje_id=m.id) attachments
    from public.inbox_thread_conversations rel
    join public.mensajes m on m.conversacion_id = rel.conversacion_id
    where rel.inbox_thread_id = t.id
    order by m.creado_en desc, m.id desc
    limit greatest(least(coalesce(p_message_limit, 1), 50), 1)
  ) q
) msg on true
order by t.ultimo_mensaje_en desc nulls last, t.id desc;
$$;

create or replace function public.panel_inbox_filter_options_persisted(
  p_source text default null,
  p_channel text default null
) returns table(option_type text, option_id uuid, option_label text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct 'batch'::text, t.batch_id,
    coalesce(nullif(b.titulo,''), 'Batch ' || left(t.batch_id::text,8))
  from public.inbox_threads t
  left join public.prospeccion_contacto_batch b on b.id=t.batch_id
  where t.organizacion_id=public.usuario_organizacion_id((select auth.uid()))
    and t.batch_id is not null
    and (p_source is null or lower(coalesce(t.source,''))=lower(p_source))
    and (p_channel is null or lower(t.canal)=lower(p_channel))
  union all
  select distinct 'campaign'::text, t.campana_id,
    coalesce(nullif(c.nombre,''), 'Campaña ' || left(t.campana_id::text,8))
  from public.inbox_threads t
  left join public.campanas c on c.id=t.campana_id
  where t.organizacion_id=public.usuario_organizacion_id((select auth.uid()))
    and t.campana_id is not null
    and (p_source is null or lower(coalesce(t.source,''))=lower(p_source))
    and (p_channel is null or lower(t.canal)=lower(p_channel));
$$;

alter table public.inbox_threads enable row level security;
alter table public.inbox_thread_conversations enable row level security;

drop policy if exists inbox_threads_tenant_select on public.inbox_threads;
create policy inbox_threads_tenant_select on public.inbox_threads for select to authenticated
using (organizacion_id = public.usuario_organizacion_id((select auth.uid())));
drop policy if exists inbox_thread_conversations_tenant_select on public.inbox_thread_conversations;
create policy inbox_thread_conversations_tenant_select on public.inbox_thread_conversations for select to authenticated
using (organizacion_id = public.usuario_organizacion_id((select auth.uid())));

revoke all on public.inbox_threads from anon;
revoke all on public.inbox_thread_conversations from anon;
grant select on public.inbox_threads, public.inbox_thread_conversations to authenticated;
grant all on public.inbox_threads, public.inbox_thread_conversations to service_role;
revoke all on function public.inbox_rebuild_threads(uuid) from public, anon, authenticated;
grant execute on function public.inbox_rebuild_threads(uuid) to service_role;
grant execute on function public.panel_inbox_threads_persisted(text,uuid,integer,integer,integer,text,text,uuid,uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.panel_inbox_filter_options_persisted(text,text) to authenticated, service_role;

select * from public.inbox_rebuild_threads(null);

commit;
