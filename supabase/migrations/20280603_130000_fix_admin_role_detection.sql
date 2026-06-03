BEGIN;

-- El rol "admin" en este esquema usa codigo 0010 y nombre admin.
-- Algunas funciones históricas buscaban codigo = 'admin', lo que deja admin_role_id en NULL.
-- Si eso pasa en un BEFORE DELETE/UPDATE, la operación se cancela.

CREATE OR REPLACE FUNCTION public.es_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH org AS (
    SELECT public.usuario_organizacion_id(uid) AS org_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_roles ur
    JOIN public.roles r ON r.id = ur.rol_id
    CROSS JOIN org
    WHERE ur.usuario_id = uid
      AND org.org_id IS NOT NULL
      AND ur.organizacion_id = org.org_id
      AND r.organizacion_id = org.org_id
      AND (lower(r.nombre) = 'admin' OR r.codigo = '0010')
  );
$function$;

CREATE OR REPLACE FUNCTION public.prevent_remove_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  admin_role_id uuid;
  owner_role_id uuid;
  remaining_admins int;
  affected_role_id uuid;
begin
  if TG_OP = 'DELETE' then
    affected_role_id := OLD.rol_id;
  elsif TG_OP = 'UPDATE' then
    affected_role_id := OLD.rol_id;
  else
    return null;
  end if;

  select id into admin_role_id
  from public.roles
  where organizacion_id = OLD.organizacion_id
    and (lower(nombre) = 'admin' or codigo = '0010')
  limit 1;

  select id into owner_role_id
  from public.roles
  where organizacion_id = OLD.organizacion_id
    and (lower(nombre) = 'owner' or codigo = '0001')
  limit 1;

  -- Si no se puede identificar el rol admin, no bloquear la operación.
  if admin_role_id is null then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  if affected_role_id = admin_role_id then
    select count(distinct ur.usuario_id) into remaining_admins
    from public.usuarios_roles ur
    where ur.organizacion_id = OLD.organizacion_id
      and ur.rol_id in (admin_role_id, owner_role_id)
      and not (ur.usuario_id = OLD.usuario_id and ur.rol_id = OLD.rol_id);

    if remaining_admins <= 0 then
      raise exception 'Debe existir al menos un usuario con rol admin u owner';
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  return NEW;
end;
$function$;

COMMIT;
