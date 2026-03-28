-- Fase 3.1 (app tables): resolver errores RLS restantes en tablas de aplicación

begin;

-- asignaciones_vendedores (tenant-scoped)
alter table if exists public.asignaciones_vendedores enable row level security;

drop policy if exists asignaciones_vendedores_admin_all on public.asignaciones_vendedores;
drop policy if exists asignaciones_vendedores_member_org on public.asignaciones_vendedores;

create policy asignaciones_vendedores_admin_all
  on public.asignaciones_vendedores
  for all
  to authenticated
  using (public.es_admin(auth.uid()))
  with check (public.es_admin(auth.uid()));

create policy asignaciones_vendedores_member_org
  on public.asignaciones_vendedores
  for all
  to authenticated
  using (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  with check (organizacion_id = public.usuario_organizacion_id(auth.uid()));

-- producto_metadata_schemes (tenant-scoped)
alter table if exists public.producto_metadata_schemes enable row level security;

drop policy if exists producto_metadata_schemes_admin_all on public.producto_metadata_schemes;
drop policy if exists producto_metadata_schemes_member_org on public.producto_metadata_schemes;

create policy producto_metadata_schemes_admin_all
  on public.producto_metadata_schemes
  for all
  to authenticated
  using (public.es_admin(auth.uid()))
  with check (public.es_admin(auth.uid()));

create policy producto_metadata_schemes_member_org
  on public.producto_metadata_schemes
  for all
  to authenticated
  using (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  with check (organizacion_id = public.usuario_organizacion_id(auth.uid()));

commit;
