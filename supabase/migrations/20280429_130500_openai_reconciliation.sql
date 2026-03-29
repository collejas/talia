create table if not exists public.openai_cost_api_buckets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  source_endpoint text not null default 'organization/costs',
  bucket_start timestamptz not null,
  bucket_end timestamptz not null,
  organization_id text not null,
  organization_name text null,
  openai_project_id text null,
  openai_project_name text null,
  project_bucket_key text not null,
  line_item text null,
  line_item_key text not null default '__all__',
  amount_value_usd numeric(18,8) not null default 0,
  currency text not null default 'usd',
  raw jsonb not null default '{}'::jsonb
);

create unique index if not exists openai_cost_api_buckets_unique_idx
  on public.openai_cost_api_buckets (
    source_endpoint,
    bucket_start,
    bucket_end,
    organization_id,
    project_bucket_key,
    line_item_key
  );

create index if not exists openai_cost_api_buckets_bucket_start_idx
  on public.openai_cost_api_buckets (bucket_start desc);

create index if not exists openai_cost_api_buckets_project_idx
  on public.openai_cost_api_buckets (openai_project_id, bucket_start desc);

create or replace view public.v_openai_cost_reconciliation_daily as
with internal_daily as (
  select
    usage_date::date as usage_date,
    openai_project_key as openai_project_id,
    max(openai_project_display_name) as openai_project_display_name,
    sum(requests_count) as internal_requests_count,
    sum(estimated_total_cost_usd) as internal_estimated_cost_usd
  from public.v_openai_costs_daily
  group by 1, 2
),
official_daily as (
  select
    (bucket_start at time zone 'UTC')::date as usage_date,
    openai_project_id,
    max(coalesce(openai_project_name, cat.display_name, openai_project_id, project_bucket_key)) as openai_project_display_name,
    max(organization_id) as openai_organization_id,
    max(organization_name) as openai_organization_name,
    sum(amount_value_usd) as official_cost_usd
  from public.openai_cost_api_buckets b
  left join public.openai_projects_catalog cat
    on cat.project_id = b.openai_project_id
  where source_endpoint = 'organization/costs'
  group by 1, 2
)
select
  coalesce(i.usage_date, o.usage_date) as usage_date,
  coalesce(i.openai_project_id, o.openai_project_id) as openai_project_id,
  coalesce(i.openai_project_display_name, o.openai_project_display_name) as openai_project_display_name,
  o.openai_organization_id,
  o.openai_organization_name,
  coalesce(i.internal_requests_count, 0) as internal_requests_count,
  coalesce(i.internal_estimated_cost_usd, 0::numeric) as internal_estimated_cost_usd,
  coalesce(o.official_cost_usd, 0::numeric) as official_cost_usd,
  coalesce(i.internal_estimated_cost_usd, 0::numeric) - coalesce(o.official_cost_usd, 0::numeric) as variance_usd,
  case
    when coalesce(o.official_cost_usd, 0::numeric) = 0::numeric then null
    else round(
      (
        (coalesce(i.internal_estimated_cost_usd, 0::numeric) - coalesce(o.official_cost_usd, 0::numeric))
        / nullif(o.official_cost_usd, 0::numeric)
      ) * 100::numeric,
      4
    )
  end as variance_pct
from internal_daily i
full join official_daily o
  on i.usage_date = o.usage_date
 and coalesce(i.openai_project_id, '__none__') = coalesce(o.openai_project_id, '__none__');
