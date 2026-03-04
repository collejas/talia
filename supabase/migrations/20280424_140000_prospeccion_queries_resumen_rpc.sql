-- Optimiza /prospeccion/prospectos/queries moviendo agregados a SQL (RPC) y agregando índices.

create index if not exists prospeccion_prospectos_org_creado_idx
  on public.prospeccion_prospectos (organizacion_id, creado_en desc);

create index if not exists prospeccion_prospectos_org_fuente_creado_idx
  on public.prospeccion_prospectos (organizacion_id, fuente, creado_en desc);

create index if not exists prospeccion_prospectos_org_actividad_idx
  on public.prospeccion_prospectos (organizacion_id, actividad);

create index if not exists prospeccion_prospectos_org_query_expr_idx
  on public.prospeccion_prospectos (
    organizacion_id,
    (
      coalesce(
        nullif(trim(metadata->>'busqueda_id'), ''),
        nullif(trim(metadata->>'busqueda_query'), ''),
        nullif(trim(metadata->>'query'), ''),
        nullif(trim(metadata->'busqueda_meta'->>'query'), '')
      )
    )
  );

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
  created_at timestamptz
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
    p.creado_en
  from public.prospeccion_prospectos p
  join ctx on p.organizacion_id = ctx.org_id
  where ctx.org_id is not null
    and (p_fuente is null or p_fuente = '' or p.fuente::text = p_fuente)
    and (p_date_from is null or p.creado_en >= p_date_from)
    and (p_date_to is null or p.creado_en < p_date_to)
),
filtered as (
  select *
  from base
  where q_value is not null
    and (
      p_query_filters is null
      or array_length(p_query_filters, 1) is null
      or q_value = any(p_query_filters)
    )
)
select
  q_value as value,
  min(q_label) as label,
  count(*)::bigint as count,
  max(creado_en) as created_at
from filtered
group by q_value
order by min(q_label) asc;
$$;

comment on function public.prospeccion_queries_resumen(text[], text, timestamptz, timestamptz)
  is 'Resume queries de prospección por tenant/filtros con conteo y última fecha.';

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
),
base as (
  select
    trim(p.actividad) as actividad,
    coalesce(
      nullif(trim(p.metadata->>'busqueda_id'), ''),
      nullif(trim(p.metadata->>'busqueda_query'), ''),
      nullif(trim(p.metadata->>'query'), ''),
      nullif(trim(p.metadata->'busqueda_meta'->>'query'), '')
    ) as q_value
  from public.prospeccion_prospectos p
  join ctx on p.organizacion_id = ctx.org_id
  where ctx.org_id is not null
    and (p_fuente is null or p_fuente = '' or p.fuente::text = p_fuente)
    and (p_date_from is null or p.creado_en >= p_date_from)
    and (p_date_to is null or p.creado_en < p_date_to)
)
select distinct actividad as activity
from base
where actividad is not null
  and actividad <> ''
  and (
    p_query_filters is null
    or array_length(p_query_filters, 1) is null
    or (q_value is not null and q_value = any(p_query_filters))
  )
order by actividad asc;
$$;

comment on function public.prospeccion_activities_resumen(text[], text, timestamptz, timestamptz)
  is 'Lista actividades distintas de prospección por tenant/filtros.';

grant execute on function public.prospeccion_activities_resumen(text[], text, timestamptz, timestamptz) to authenticated;
grant execute on function public.prospeccion_activities_resumen(text[], text, timestamptz, timestamptz) to service_role;
