-- Rebuild manejar_usuario_auth_nuevo to propagate organizacion_id from auth metadata
create or replace function public.manejar_usuario_auth_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org uuid;
  v_nombre text;
  v_tel text;
begin
  v_org := nullif(
    coalesce(
      new.raw_user_meta_data->>'organizacion_id',
      new.raw_app_meta_data->>'organizacion_id'
    ),
    ''
  )::uuid;

  if v_org is null then
    raise exception 'organizacion_id requerido (no se pudo inferir el tenant)'
      using errcode = '23514';
  end if;

  v_nombre := coalesce(new.raw_user_meta_data->>'full_name', new.email);
  v_tel := coalesce(nullif(new.phone, ''), '+00000000000');

  insert into public.usuarios (id, correo, nombre_completo, telefono_e164, organizacion_id)
  values (new.id, new.email, v_nombre, v_tel, v_org)
  on conflict (id) do update
    set correo = excluded.correo,
        nombre_completo = excluded.nombre_completo,
        telefono_e164 = excluded.telefono_e164,
        organizacion_id = excluded.organizacion_id;

  return new;
end;
$$;
