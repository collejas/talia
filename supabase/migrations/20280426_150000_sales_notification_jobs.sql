create table if not exists public.sales_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  processed_at timestamptz,
  state text not null default 'pending' check (state in ('pending', 'processing', 'done', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  last_error text,
  organizacion_id uuid not null,
  channel text not null default 'webchat',
  trigger text not null,
  conversation_id uuid not null,
  contact_id uuid not null,
  opportunity_id uuid,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists sales_notification_jobs_state_available_idx
  on public.sales_notification_jobs(state, available_at);

create index if not exists sales_notification_jobs_processing_lease_idx
  on public.sales_notification_jobs(state, lease_until);

create index if not exists sales_notification_jobs_org_created_idx
  on public.sales_notification_jobs(organizacion_id, created_at desc);
