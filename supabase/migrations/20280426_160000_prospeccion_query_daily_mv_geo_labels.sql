-- Extiende la MV diaria de prospección para incluir etiquetas geo por query
-- sin regresar al fallback de escaneo completo en Python.

drop materialized view if exists public.prospeccion_query_daily_mv;

create materialized view public.prospeccion_query_daily_mv
as
with normalized as (
  select
    p.organizacion_id,
    p.fuente::text as fuente,
    coalesce(
      nullif(trim(p.metadata->>'busqueda_id'), ''),
      nullif(trim(p.metadata->>'busqueda_query'), ''),
      nullif(trim(p.metadata->>'query'), ''),
      nullif(trim(p.metadata->'busqueda_meta'->>'query'), '')
    ) as q_value,
    coalesce(
      nullif(trim(p.metadata->'busqueda_meta'->'advanced_filters'->>'texto_busqueda'), ''),
      nullif(trim(p.metadata->>'busqueda_query'), ''),
      nullif(trim(p.metadata->>'query'), ''),
      nullif(trim(p.metadata->'busqueda_meta'->>'query'), ''),
      coalesce(
        nullif(trim(p.metadata->>'busqueda_id'), ''),
        nullif(trim(p.metadata->>'busqueda_query'), ''),
        nullif(trim(p.metadata->>'query'), ''),
        nullif(trim(p.metadata->'busqueda_meta'->>'query'), '')
      )
    ) as q_label,
    nullif(trim(p.actividad), '') as actividad,
    nullif(trim(p.segmento), '') as segmento,
    case
      when geo.state_distinct = 1 then geo.state_code_single
      else null
    end as estado_cve,
    (geo.state_distinct > 1) as estado_multi,
    case
      when geo.muni_distinct = 1 then geo.muni_state_single
      else null
    end as municipio_estado_cve,
    case
      when geo.muni_distinct = 1 then geo.muni_code_single
      else null
    end as municipio_cve,
    (geo.muni_distinct > 1) as municipio_multi,
    (p.creado_en at time zone 'utc')::date as created_day
  from public.prospeccion_prospectos p
  left join lateral (
    with advanced as (
      select coalesce(p.metadata->'busqueda_meta'->'advanced_filters', '{}'::jsonb) as filters
    ),
    parts as (
      select
        case
          when state_digits <> '' then right(lpad(state_digits, 2, '0'), 2)
          else null
        end as state_code,
        null::text as muni_state,
        null::text as muni_code
      from advanced,
      lateral jsonb_array_elements_text(coalesce(filters->'geo_estados', '[]'::jsonb)) raw_state(value),
      lateral (
        select regexp_replace(coalesce(raw_state.value, ''), '\\D', '', 'g') as state_digits
      ) norm_state

      union all

      select
        case
          when state_digits <> '' then right(lpad(state_digits, 2, '0'), 2)
          else null
        end as state_code,
        case
          when state_digits <> '' then right(lpad(state_digits, 2, '0'), 2)
          else null
        end as muni_state,
        case
          when muni_digits <> '' then right(lpad(muni_digits, 3, '0'), 3)
          else null
        end as muni_code
      from advanced,
      lateral jsonb_array_elements_text(coalesce(filters->'geo_municipios', '[]'::jsonb)) raw_muni(value),
      lateral (
        select
          regexp_replace(split_part(coalesce(raw_muni.value, ''), '::', 1), '\\D', '', 'g') as state_digits,
          regexp_replace(split_part(coalesce(raw_muni.value, ''), '::', 2), '\\D', '', 'g') as muni_digits
      ) norm_muni
    )
    select
      count(distinct state_code) filter (where state_code is not null) as state_distinct,
      min(state_code) filter (where state_code is not null) as state_code_single,
      count(distinct (muni_state || '::' || muni_code)) filter (
        where muni_state is not null and muni_code is not null
      ) as muni_distinct,
      min(muni_state) filter (
        where muni_state is not null and muni_code is not null
      ) as muni_state_single,
      min(muni_code) filter (
        where muni_state is not null and muni_code is not null
      ) as muni_code_single
    from parts
  ) geo on true
)
select
  organizacion_id,
  fuente,
  q_value,
  q_label,
  actividad,
  segmento,
  estado_cve,
  estado_multi,
  municipio_estado_cve,
  municipio_cve,
  municipio_multi,
  created_day,
  count(*)::bigint as total
from normalized
where q_value is not null
group by
  organizacion_id,
  fuente,
  q_value,
  q_label,
  actividad,
  segmento,
  estado_cve,
  estado_multi,
  municipio_estado_cve,
  municipio_cve,
  municipio_multi,
  created_day
with data;

create unique index if not exists prospeccion_query_daily_mv_uk
  on public.prospeccion_query_daily_mv (
    organizacion_id,
    fuente,
    q_value,
    coalesce(actividad, ''),
    coalesce(segmento, ''),
    coalesce(estado_cve, ''),
    estado_multi,
    coalesce(municipio_estado_cve, ''),
    coalesce(municipio_cve, ''),
    municipio_multi,
    created_day
  );

create index if not exists prospeccion_query_daily_mv_org_day_idx
  on public.prospeccion_query_daily_mv (organizacion_id, created_day desc);

create index if not exists prospeccion_query_daily_mv_org_fuente_day_idx
  on public.prospeccion_query_daily_mv (organizacion_id, fuente, created_day desc);

create index if not exists prospeccion_query_daily_mv_org_query_idx
  on public.prospeccion_query_daily_mv (organizacion_id, q_value);

drop function if exists public.prospeccion_queries_resumen(text[], text, timestamptz, timestamptz);

create or replace function public.prospeccion_queries_resumen(
  p_query_filters text[] default null,
  p_fuente text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  value text,
  label text,
  count bigint,
  created_at timestamptz,
  estado text,
  municipio text
)
language sql
security definer
set search_path = public
as $$
with ctx as (
  select public.usuario_organizacion_id(auth.uid()) as org_id
),
base as (
  select
    mv.q_value,
    mv.q_label,
    mv.created_day,
    mv.total,
    mv.estado_cve,
    mv.estado_multi,
    mv.municipio_estado_cve,
    mv.municipio_cve,
    mv.municipio_multi
  from public.prospeccion_query_daily_mv mv
  join ctx on mv.organizacion_id = ctx.org_id
  where ctx.org_id is not null
    and (p_fuente is null or p_fuente = '' or mv.fuente = p_fuente)
    and (
      p_date_from is null
      or mv.created_day >= (p_date_from at time zone 'utc')::date
    )
    and (
      p_date_to is null
      or mv.created_day < (p_date_to at time zone 'utc')::date
    )
    and (
      p_query_filters is null
      or array_length(p_query_filters, 1) is null
      or mv.q_value = any(p_query_filters)
    )
)
select
  q_value as value,
  min(q_label) as label,
  sum(total)::bigint as count,
  (max(created_day)::timestamp at time zone 'utc') as created_at,
  case
    when bool_or(estado_multi)
      or count(distinct estado_cve) filter (where estado_cve is not null) > 1
      then 'MULTIPLE'
    else min(estado_cve) filter (where estado_cve is not null)
  end as estado,
  case
    when bool_or(municipio_multi)
      or count(distinct (municipio_estado_cve || '::' || municipio_cve)) filter (
        where municipio_estado_cve is not null and municipio_cve is not null
      ) > 1
      then 'MULTIPLE'
    else min(municipio_estado_cve || '::' || municipio_cve) filter (
      where municipio_estado_cve is not null and municipio_cve is not null
    )
  end as municipio
from base
group by q_value
order by min(q_label) asc;
$$;

comment on function public.prospeccion_queries_resumen(text[], text, timestamptz, timestamptz)
  is 'Resume queries de prospección por tenant/filtros desde materialized view diaria, incluyendo geo agregado por query.';

grant execute on function public.prospeccion_queries_resumen(text[], text, timestamptz, timestamptz) to authenticated;
grant execute on function public.prospeccion_queries_resumen(text[], text, timestamptz, timestamptz) to service_role;

create or replace function public.prospeccion_activities_resumen(
  p_query_filters text[] default null,
  p_fuente text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  activity text
)
language sql
security definer
set search_path = public
as $$
with ctx as (
  select public.usuario_organizacion_id(auth.uid()) as org_id
)
select distinct mv.actividad as activity
from public.prospeccion_query_daily_mv mv
join ctx on mv.organizacion_id = ctx.org_id
where ctx.org_id is not null
  and mv.actividad is not null
  and (
    p_fuente is null or p_fuente = '' or mv.fuente = p_fuente
  )
  and (
    p_date_from is null
    or mv.created_day >= (p_date_from at time zone 'utc')::date
  )
  and (
    p_date_to is null
    or mv.created_day < (p_date_to at time zone 'utc')::date
  )
  and (
    p_query_filters is null
    or array_length(p_query_filters, 1) is null
    or mv.q_value = any(p_query_filters)
  )
order by mv.actividad asc;
$$;

comment on function public.prospeccion_activities_resumen(text[], text, timestamptz, timestamptz)
  is 'Lista actividades distintas de prospección por tenant/filtros desde materialized view diaria.';

grant execute on function public.prospeccion_activities_resumen(text[], text, timestamptz, timestamptz) to authenticated;
grant execute on function public.prospeccion_activities_resumen(text[], text, timestamptz, timestamptz) to service_role;

create or replace function public.prospeccion_segmentos_resumen(
  p_query_filters text[] default null,
  p_fuente text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  segmento text
)
language sql
security definer
set search_path = public
as $$
with ctx as (
  select public.usuario_organizacion_id(auth.uid()) as org_id
)
select distinct mv.segmento
from public.prospeccion_query_daily_mv mv
join ctx on mv.organizacion_id = ctx.org_id
where ctx.org_id is not null
  and mv.segmento is not null
  and (
    p_fuente is null or p_fuente = '' or mv.fuente = p_fuente
  )
  and (
    p_date_from is null
    or mv.created_day >= (p_date_from at time zone 'utc')::date
  )
  and (
    p_date_to is null
    or mv.created_day < (p_date_to at time zone 'utc')::date
  )
  and (
    p_query_filters is null
    or array_length(p_query_filters, 1) is null
    or mv.q_value = any(p_query_filters)
  )
order by mv.segmento asc;
$$;

grant execute on function public.prospeccion_segmentos_resumen(text[], text, timestamptz, timestamptz) to authenticated;
grant execute on function public.prospeccion_segmentos_resumen(text[], text, timestamptz, timestamptz) to service_role;

create or replace function public.prospeccion_query_daily_mv_refresh()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view public.prospeccion_query_daily_mv;
$$;

grant execute on function public.prospeccion_query_daily_mv_refresh() to service_role;
