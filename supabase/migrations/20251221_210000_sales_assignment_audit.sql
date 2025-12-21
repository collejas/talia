create table if not exists public.asignaciones_vendedores_whatsapp (
    id uuid primary key default gen_random_uuid(),
    conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
    oportunidad_id uuid references public.oportunidades(id) on delete cascade,
    contacto_id uuid references public.contactos(id) on delete set null,
    organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
    vendedor_usuario_id uuid not null references public.usuarios(id) on delete restrict,
    trigger_event text not null,
    metadata jsonb not null default '{}'::jsonb,
    creado_en timestamptz not null default now()
);

create index if not exists asignaciones_vendedores_whatsapp_conversacion_idx
    on public.asignaciones_vendedores_whatsapp (conversacion_id);

create index if not exists asignaciones_vendedores_whatsapp_oportunidad_idx
    on public.asignaciones_vendedores_whatsapp (oportunidad_id);

create index if not exists asignaciones_vendedores_whatsapp_vendedor_idx
    on public.asignaciones_vendedores_whatsapp (vendedor_usuario_id);

grant select, insert on public.asignaciones_vendedores_whatsapp to service_role;
