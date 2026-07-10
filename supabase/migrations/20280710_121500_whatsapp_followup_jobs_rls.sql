begin;

alter table if exists public.whatsapp_followup_jobs enable row level security;

drop policy if exists whatsapp_followup_jobs_service_all on public.whatsapp_followup_jobs;

create policy whatsapp_followup_jobs_service_all
  on public.whatsapp_followup_jobs
  for all
  to service_role
  using (true)
  with check (true);

commit;
