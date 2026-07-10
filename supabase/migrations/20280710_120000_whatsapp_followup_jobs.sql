create table if not exists public.whatsapp_followup_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_at timestamptz not null,
  lease_until timestamptz,
  processed_at timestamptz,
  state text not null default 'pending' check (state in ('pending', 'processing', 'done', 'canceled', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  last_error text,
  cancel_reason text,
  organizacion_id uuid not null,
  conversation_id uuid not null,
  persona_id uuid not null,
  opportunity_id uuid,
  next_action text not null check (next_action in ('reengage', 'escalate')),
  scheduled_reason text not null default 'outbound_message'
);

create index if not exists whatsapp_followup_jobs_state_due_idx
  on public.whatsapp_followup_jobs(state, due_at);

create index if not exists whatsapp_followup_jobs_processing_lease_idx
  on public.whatsapp_followup_jobs(state, lease_until);

create index if not exists whatsapp_followup_jobs_conversation_idx
  on public.whatsapp_followup_jobs(conversation_id, created_at desc);

create index if not exists whatsapp_followup_jobs_org_created_idx
  on public.whatsapp_followup_jobs(organizacion_id, created_at desc);
