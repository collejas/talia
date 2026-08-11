create table if not exists public.close_lead_policies (
    id uuid primary key default gen_random_uuid(),
    organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
    canal text not null check (canal in ('whatsapp', 'webchat')),
    activo boolean not null default true,
    nombre_requerido boolean not null default true,
    telefono_requerido boolean not null default true,
    necesidad_proposito_requerido boolean not null default true,
    notes_requerido boolean not null default true,
    correo_requerido boolean not null default false,
    company_name_requerido boolean not null default false,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint close_lead_policies_organizacion_canal_key unique (organizacion_id, canal)
);

create index if not exists close_lead_policies_organizacion_idx
    on public.close_lead_policies (organizacion_id, canal);

insert into public.close_lead_policies (organizacion_id, canal)
select o.id, channel.canal
from public.organizaciones o
cross join (values ('whatsapp'::text), ('webchat'::text)) as channel(canal)
on conflict (organizacion_id, canal) do nothing;

alter table public.close_lead_policies enable row level security;

drop policy if exists close_lead_policies_service_role on public.close_lead_policies;
create policy close_lead_policies_service_role
    on public.close_lead_policies
    for all
    to service_role
    using (true)
    with check (true);

comment on table public.close_lead_policies is
    'Reglas explícitas por tenant y canal para validar el cierre de oportunidades mediante close_lead.';
