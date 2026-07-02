-- Backfill idempotente para usuarios con puesto "Ejecutivo de Ventas" que no tenían
-- acceso a cotizaciones porque no estaban ligados al rol "agente".

do $$
begin
  with sales_users as (
    select distinct
      u.organizacion_id,
      u.id as usuario_id
    from public.usuarios u
    join public.empleados e
      on e.usuario_id = u.id
     and e.organizacion_id = u.organizacion_id
    join public.puestos p
      on p.id = e.puesto_id
     and p.organizacion_id = e.organizacion_id
    where lower(trim(coalesce(p.nombre, ''))) = 'ejecutivo de ventas'
  ),
  proposal_permission_holders as (
    select distinct
      ur.organizacion_id,
      ur.usuario_id
    from public.usuarios_roles ur
    join public.roles_permisos rp
      on rp.rol_id = ur.rol_id
     and rp.organizacion_id = ur.organizacion_id
    join public.permisos p
      on p.id = rp.permiso_id
     and p.organizacion_id = rp.organizacion_id
    where lower(trim(coalesce(p.codigo, ''))) = 'propuesta.view'
  ),
  agent_roles as (
    select distinct on (r.organizacion_id)
      r.organizacion_id,
      r.id as rol_id
    from public.roles r
    where lower(trim(coalesce(r.nombre, ''))) = 'agente'
       or lower(trim(coalesce(r.codigo, ''))) in ('agente', '0004')
    order by
      r.organizacion_id,
      case when lower(trim(coalesce(r.nombre, ''))) = 'agente' then 0 else 1 end,
      case
        when lower(trim(coalesce(r.codigo, ''))) = 'agente' then 0
        when lower(trim(coalesce(r.codigo, ''))) = '0004' then 1
        else 2
      end,
      r.creado_en nulls last,
      r.id
  )
  insert into public.usuarios_roles (usuario_id, rol_id, organizacion_id)
  select su.usuario_id, ar.rol_id, su.organizacion_id
  from sales_users su
  join agent_roles ar
    on ar.organizacion_id = su.organizacion_id
  left join proposal_permission_holders ph
    on ph.organizacion_id = su.organizacion_id
   and ph.usuario_id = su.usuario_id
  where ph.usuario_id is null
    and not exists (
      select 1
      from public.usuarios_roles ur
      where ur.usuario_id = su.usuario_id
        and ur.organizacion_id = su.organizacion_id
        and ur.rol_id = ar.rol_id
    );
end $$;
