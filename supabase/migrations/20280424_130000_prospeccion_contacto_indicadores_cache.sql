-- Cache persistente para indicadores de contacto por prospecto.
-- Reduce costo repetido de la vista agregada en requests frecuentes del panel.

create table if not exists public.prospeccion_prospecto_contacto_stats_cache (
  organizacion_id uuid not null,
  prospecto_id uuid not null,
  canales jsonb not null default '{}'::jsonb,
  total_envios bigint not null default 0,
  ultimo_contacto_en timestamptz,
  total_respuestas bigint not null default 0,
  respondio boolean not null default false,
  ultima_respuesta_en timestamptz,
  actualizado_en timestamptz not null default now(),
  constraint prospeccion_prospecto_contacto_stats_cache_pkey primary key (organizacion_id, prospecto_id)
);

create index if not exists prospeccion_prospecto_contacto_stats_cache_updated_idx
  on public.prospeccion_prospecto_contacto_stats_cache (organizacion_id, actualizado_en desc);

alter table public.prospeccion_prospecto_contacto_stats_cache enable row level security;

drop policy if exists prospeccion_contacto_stats_cache_select on public.prospeccion_prospecto_contacto_stats_cache;
create policy prospeccion_contacto_stats_cache_select
  on public.prospeccion_prospecto_contacto_stats_cache
  for select
  to authenticated
  using (organizacion_id = public.usuario_organizacion_id(auth.uid()));

create or replace function public.prospeccion_contacto_indicadores_cached(
  p_prospecto_ids uuid[],
  p_max_age_seconds integer default 120
)
returns table (
  prospecto_id uuid,
  canales jsonb,
  total_envios bigint,
  ultimo_contacto_en timestamptz,
  total_respuestas bigint,
  respondio boolean,
  ultima_respuesta_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_cutoff timestamptz;
  v_ids uuid[];
  v_stale_ids uuid[];
begin
  v_org_id := public.usuario_organizacion_id(auth.uid());
  if v_org_id is null then
    return;
  end if;

  if p_prospecto_ids is null or array_length(p_prospecto_ids, 1) is null then
    return;
  end if;

  v_ids := (
    select coalesce(array_agg(distinct id), '{}')
    from unnest(p_prospecto_ids) as id
    where id is not null
  );

  if array_length(v_ids, 1) is null then
    return;
  end if;

  v_cutoff := now() - make_interval(secs => greatest(coalesce(p_max_age_seconds, 120), 5));

  select coalesce(array_agg(x.prospecto_id), '{}')
    into v_stale_ids
  from (
    select ids.id as prospecto_id
    from unnest(v_ids) as ids(id)
    left join public.prospeccion_prospecto_contacto_stats_cache c
      on c.organizacion_id = v_org_id
     and c.prospecto_id = ids.id
    where c.prospecto_id is null
       or c.actualizado_en < v_cutoff
  ) as x;

  if array_length(v_stale_ids, 1) is not null then
    insert into public.prospeccion_prospecto_contacto_stats_cache (
      organizacion_id,
      prospecto_id,
      canales,
      total_envios,
      ultimo_contacto_en,
      total_respuestas,
      respondio,
      ultima_respuesta_en,
      actualizado_en
    )
    select
      s.organizacion_id,
      s.prospecto_id,
      coalesce(s.canales, '{}'::jsonb),
      coalesce(s.total_envios, 0),
      s.ultimo_contacto_en,
      coalesce(s.total_respuestas, 0),
      coalesce(s.respondio, false),
      s.ultima_respuesta_en,
      now()
    from public.prospeccion_prospecto_contacto_stats s
    where s.organizacion_id = v_org_id
      and s.prospecto_id = any(v_stale_ids)
    on conflict (organizacion_id, prospecto_id)
    do update set
      canales = excluded.canales,
      total_envios = excluded.total_envios,
      ultimo_contacto_en = excluded.ultimo_contacto_en,
      total_respuestas = excluded.total_respuestas,
      respondio = excluded.respondio,
      ultima_respuesta_en = excluded.ultima_respuesta_en,
      actualizado_en = excluded.actualizado_en;
  end if;

  return query
  select
    c.prospecto_id,
    c.canales,
    c.total_envios,
    c.ultimo_contacto_en,
    c.total_respuestas,
    c.respondio,
    c.ultima_respuesta_en
  from public.prospeccion_prospecto_contacto_stats_cache c
  where c.organizacion_id = v_org_id
    and c.prospecto_id = any(v_ids)
  order by c.prospecto_id asc;
end;
$$;

comment on function public.prospeccion_contacto_indicadores_cached(uuid[], integer)
  is 'Devuelve indicadores por prospecto usando cache persistente y refresco incremental por antiguedad.';

grant execute on function public.prospeccion_contacto_indicadores_cached(uuid[], integer) to authenticated;
grant execute on function public.prospeccion_contacto_indicadores_cached(uuid[], integer) to service_role;
