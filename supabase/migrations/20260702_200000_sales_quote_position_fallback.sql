BEGIN;

-- Fallback explícito para que el puesto comercial pueda operar cotizaciones
-- aunque la asignación de rol quede incompleta en alguna organización.
CREATE OR REPLACE FUNCTION public.usuario_es_ejecutivo_ventas(
    p_uid uuid,
    p_organizacion_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.empleados e
        JOIN public.puestos p
          ON p.id = e.puesto_id
        WHERE e.usuario_id = p_uid
          AND e.organizacion_id = p_organizacion_id
          AND lower(trim(coalesce(p.nombre, ''))) = 'ejecutivo de ventas'
    );
$$;

COMMENT ON FUNCTION public.usuario_es_ejecutivo_ventas IS
    'Detecta si un usuario pertenece al puesto Ejecutivo de Ventas dentro de una organización.';

CREATE OR REPLACE FUNCTION public.current_user_has_perm(perm_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  with ctx as (
    select
      auth.uid() as usuario_id,
      coalesce(
        public.usuario_organizacion_id(auth.uid()),
        (select ur.organizacion_id from public.usuarios_roles ur where ur.usuario_id = auth.uid() limit 1)
      ) as organizacion_id
  )
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
      cross join ctx
      where ur.usuario_id = ctx.usuario_id
        and ur.organizacion_id = ctx.organizacion_id
        and lower(p.codigo) = lower(perm_code)
    )
    or (
      lower(perm_code) in ('propuesta.view', 'propuesta.create')
      and exists (
        select 1
        from ctx
        where ctx.usuario_id is not null
          and ctx.organizacion_id is not null
          and public.usuario_es_ejecutivo_ventas(ctx.usuario_id, ctx.organizacion_id)
      )
    );
$$;

DROP FUNCTION IF EXISTS public.mi_contexto_permisos();

CREATE FUNCTION public.mi_contexto_permisos()
RETURNS TABLE(
  usuario_id uuid,
  organizacion_id uuid,
  roles text[],
  permisos text[],
  es_admin boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  with ctx as (
    select auth.uid() as usuario_id,
           public.usuario_organizacion_id(auth.uid()) as organizacion_id
  ),
  sales_fallback as (
    select
      ctx.usuario_id,
      ctx.organizacion_id,
      public.usuario_es_ejecutivo_ventas(ctx.usuario_id, ctx.organizacion_id) as es_ejecutivo_ventas
    from ctx
  )
  select
    ctx.usuario_id,
    ctx.organizacion_id,
    (
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
      )
      || case
        when sales_fallback.es_ejecutivo_ventas then array['agente']::text[]
        else '{}'::text[]
      end
    ) as roles,
    (
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
      )
      || case
        when sales_fallback.es_ejecutivo_ventas then array['propuesta.view', 'propuesta.create']::text[]
        else '{}'::text[]
      end
    ) as permisos,
    public.es_admin(ctx.usuario_id) as es_admin
  from ctx
  cross join sales_fallback;
$$;

grant execute on function public.usuario_es_ejecutivo_ventas(uuid, uuid) to authenticated;
grant execute on function public.current_user_has_perm(text) to authenticated;
grant execute on function public.mi_contexto_permisos() to authenticated;

COMMIT;
