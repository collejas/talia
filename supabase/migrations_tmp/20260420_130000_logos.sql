-- Tabla general de logos para todas las vistas configurables.
-- Requiere que el bucket 'logos' exista en Supabase Storage.
create table if not exists public.logos (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    descripcion text,
    file_path text not null,
    file_url text not null,
    metadata jsonb not null default '{}'::jsonb,
    uploaded_by uuid references public.usuarios(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.logos is 'Repositorio central de logos que puede utilizar cualquier documento o vista.';
comment on column public.logos.file_path is 'Ruta interna en el bucket logos.';
comment on column public.logos.file_url is 'URL pública o firmada del logo.';
comment on column public.logos.metadata is 'Información adicional (colores sugeridos, contraste, etc.).';

create index if not exists logos_created_idx on public.logos (created_at desc);

drop trigger if exists logos_touch_updated_at on public.logos;
create trigger logos_touch_updated_at
    before update on public.logos
    for each row execute function public.tg_touch_updated_at();

alter table public.logos enable row level security;

grant select, insert, update, delete on public.logos to postgres, service_role;
grant select on public.logos to authenticated;

drop policy if exists logos_select on public.logos;
create policy logos_select on public.logos
    for select
    to authenticated
    using (true);

drop policy if exists logos_write_admin on public.logos;
create policy logos_write_admin on public.logos
    for all
    to authenticated
    using (public.es_admin(auth.uid()))
    with check (public.es_admin(auth.uid()));
