-- Catálogo editable para bootstrap de estructura base al crear tenants.

create table if not exists public.tenant_bootstrap_catalog (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('departamento', 'puesto')),
  nombre text not null,
  orden integer not null default 100,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tipo, nombre)
);

create index if not exists tenant_bootstrap_catalog_tipo_activo_orden_idx
  on public.tenant_bootstrap_catalog (tipo, activo, orden, nombre);

create or replace function public.touch_tenant_bootstrap_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_bootstrap_catalog_updated_at on public.tenant_bootstrap_catalog;
create trigger trg_tenant_bootstrap_catalog_updated_at
before update on public.tenant_bootstrap_catalog
for each row execute function public.touch_tenant_bootstrap_catalog_updated_at();

insert into public.tenant_bootstrap_catalog (tipo, nombre, orden, activo)
values
  ('departamento', 'Administración', 10, true),
  ('departamento', 'Comercial', 20, true),
  ('departamento', 'Marketing', 30, true),
  ('departamento', 'Operaciones', 40, true),
  ('departamento', 'Soporte', 50, true),
  ('departamento', 'Finanzas', 60, true),
  ('puesto', 'Administrador General', 10, true),
  ('puesto', 'Gerente Comercial', 20, true),
  ('puesto', 'Supervisor Comercial', 30, true),
  ('puesto', 'Ejecutivo de Ventas', 40, true),
  ('puesto', 'Analista de Marketing', 50, true),
  ('puesto', 'Especialista de Soporte', 60, true),
  ('puesto', 'Coordinador Operativo', 70, true),
  ('puesto', 'Auxiliar Administrativo', 80, true)
on conflict (tipo, nombre) do update
set
  orden = excluded.orden,
  activo = excluded.activo,
  actualizado_en = now();
