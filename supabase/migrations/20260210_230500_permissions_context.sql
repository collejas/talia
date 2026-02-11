-- Adds permission helpers for role-based access checks.

create or replace function public.current_user_has_perm(codigo text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.es_admin(auth.uid())
    or exists (
      select 1
      from public.usuarios_roles ur
      join public.roles_permisos rp
        on rp.rol_id = ur.rol_id
       and rp.organizacion_id = ur.organizacion_id
      join public.permisos p
        on p.id = rp.permiso_id
       and p.organizacion_id = ur.organizacion_id
      where ur.usuario_id = auth.uid()
        and ur.organizacion_id = public.usuario_organizacion_id(auth.uid())
        and lower(p.codigo) = lower(codigo)
    );
$$;

create or replace function public.mi_contexto_permisos()
returns table(
  usuario_id uuid,
  organizacion_id uuid,
  roles text[],
  permisos text[],
  es_admin boolean
)
language sql
security definer
set search_path = public
as $$
  with ctx as (
    select auth.uid() as usuario_id,
           public.usuario_organizacion_id(auth.uid()) as organizacion_id
  )
  select
    ctx.usuario_id,
    ctx.organizacion_id,
    coalesce(
      (
        select array_agg(distinct r.codigo)
        from public.usuarios_roles ur
        join public.roles r
          on r.id = ur.rol_id
         and r.organizacion_id = ur.organizacion_id
        where ur.usuario_id = ctx.usuario_id
          and ur.organizacion_id = ctx.organizacion_id
      ),
      '{}'::text[]
    ) as roles,
    coalesce(
      (
        select array_agg(distinct p.codigo)
        from public.usuarios_roles ur
        join public.roles_permisos rp
          on rp.rol_id = ur.rol_id
         and rp.organizacion_id = ur.organizacion_id
        join public.permisos p
          on p.id = rp.permiso_id
         and p.organizacion_id = ur.organizacion_id
        where ur.usuario_id = ctx.usuario_id
          and ur.organizacion_id = ctx.organizacion_id
      ),
      '{}'::text[]
    ) as permisos,
    public.es_admin(ctx.usuario_id) as es_admin
  from ctx;
$$;

grant execute on function public.current_user_has_perm(text) to authenticated;
grant execute on function public.mi_contexto_permisos() to authenticated;
