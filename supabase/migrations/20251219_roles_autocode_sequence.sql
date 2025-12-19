-- Keep role codes sequential per organization using a helper function
create or replace function public.next_role_codigo(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if p_org is null then
    raise exception 'organizacion_id requerido para generar el código'
      using errcode = '23514';
  end if;

  insert into public.roles_codigo_counters (organizacion_id, consecutivo)
  values (p_org, 1)
  on conflict (organizacion_id)
  do update set consecutivo = public.roles_codigo_counters.consecutivo + 1,
                actualizado_en = now()
  returning public.roles_codigo_counters.consecutivo into v_next;

  return lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.roles_autofill_codigo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    v_codigo := public.next_role_codigo(new.organizacion_id);
  else
    v_codigo := new.codigo;
  end if;

  new.codigo := v_codigo;
  return new;
end;
$$;

create or replace function public.roles_before_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.roles
    where organizacion_id = new.organizacion_id
      and codigo = new.codigo
  ) then
    raise exception '[roles] El código % ya existe en la organización %', new.codigo, new.organizacion_id
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists t_roles_auto_codigo on public.roles;
create trigger t_roles_auto_codigo
before insert on public.roles
for each row
execute function public.roles_autofill_codigo();

create trigger t_roles_guard_codigo
before insert on public.roles
for each row
execute function public.roles_before_insert_guard();
