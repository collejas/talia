begin;

-- Cola durable para webhooks Meta. El payload JSONB se conserva únicamente
-- como carga externa variable; estado, tenant, idempotencia y reintentos son
-- columnas explícitas y consultables.
create table if not exists public.whatsapp_webhook_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  processed_at timestamptz,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'done', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  last_error text,
  provider text not null check (provider in ('meta')),
  event_key text not null,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  payload jsonb not null,
  unique (provider, organizacion_id, event_key)
);

create index if not exists whatsapp_webhook_jobs_ready_idx
  on public.whatsapp_webhook_jobs (state, available_at, created_at);

create index if not exists whatsapp_webhook_jobs_processing_lease_idx
  on public.whatsapp_webhook_jobs (state, lease_until);

create index if not exists whatsapp_webhook_jobs_org_created_idx
  on public.whatsapp_webhook_jobs (organizacion_id, created_at desc);

alter table public.whatsapp_webhook_jobs enable row level security;

drop policy if exists whatsapp_webhook_jobs_service_all on public.whatsapp_webhook_jobs;
create policy whatsapp_webhook_jobs_service_all
  on public.whatsapp_webhook_jobs
  for all
  to service_role
  using (true)
  with check (true);

commit;
