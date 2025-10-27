-- Crea tabla para marcar cierres por session_id sin romper esquema existente
create table if not exists public.webchat_session_closures (
  session_id text primary key,
  closed_at timestamptz not null default now()
);

-- Índice por fecha para limpieza futura
create index if not exists idx_webchat_session_closures_closed_at
  on public.webchat_session_closures (closed_at);

-- Política mínima para service_role (la usa el backend)
alter table public.webchat_session_closures enable row level security;
do $$ begin
  create policy webchat_session_closures_service_role
    on public.webchat_session_closures for all
    to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Trigger opcional: al insertar cierre, nada más; la limpieza de conv_openai se hace desde backend

