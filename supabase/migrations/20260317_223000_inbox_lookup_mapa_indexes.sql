-- Optimiza cuellos de Inbox (lookup por telefono) y Mapa (joins por session_id).

create index if not exists idx_mensajes_org_session_id_creado
  on public.mensajes (organizacion_id, ((datos ->> 'session_id')), creado_en desc)
  where (datos ? 'session_id');

create index if not exists idx_mensajes_session_id_creado
  on public.mensajes (((datos ->> 'session_id')), creado_en desc)
  where (datos ? 'session_id');

create index if not exists idx_webchat_visitantes_org_ultimo_evento
  on public.webchat_visitantes (organizacion_id, ultimo_evento_en desc);

create index if not exists idx_conversaciones_org_canal_ultimo
  on public.conversaciones (organizacion_id, canal, ultimo_mensaje_en desc, iniciada_en desc);

create index if not exists idx_prospeccion_contacto_envio_phone_canal_procesado
  on public.prospeccion_contacto_envio (((detalle ->> 'phone')), canal, procesado_en desc, creado_en desc)
  where (detalle ? 'phone');

create or replace function public.prospeccion_latest_envios_by_phones(
  p_phone_values text[],
  p_canal text default null,
  p_organizacion_id uuid default null
)
returns table(
  phone text,
  id uuid,
  batch_id uuid,
  prospecto_id uuid,
  canal text,
  payload jsonb,
  detalle jsonb,
  procesado_en timestamptz,
  creado_en timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select distinct btrim(value) as phone
    from unnest(coalesce(p_phone_values, array[]::text[])) as value
    where value is not null and btrim(value) <> ''
  )
  select distinct on ((e.detalle ->> 'phone'))
    (e.detalle ->> 'phone') as phone,
    e.id,
    e.batch_id,
    e.prospecto_id,
    e.canal,
    e.payload,
    e.detalle,
    e.procesado_en,
    e.creado_en
  from public.prospeccion_contacto_envio e
  join normalized n
    on n.phone = (e.detalle ->> 'phone')
  where (
      p_canal is null
      or btrim(p_canal) = ''
      or lower(e.canal) = lower(btrim(p_canal))
    )
    and (
      p_organizacion_id is null
      or e.organizacion_id = p_organizacion_id
    )
  order by
    (e.detalle ->> 'phone'),
    e.procesado_en desc nulls last,
    e.creado_en desc;
$$;

grant execute on function public.prospeccion_latest_envios_by_phones(text[], text, uuid)
  to authenticated, service_role;
