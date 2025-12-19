-- Seed roles_codigo_counters with the current maximum codigo per organization
drop function if exists public.roles_autofill_codigo cascade;

do $$
declare
  rec record;
  v_max bigint;
begin
  for rec in
    select organizacion_id, max(codigo) as max_codigo
    from public.roles
    where codigo ~ '^[0-9]+$'
    group by organizacion_id
  loop
    v_max := coalesce(rec.max_codigo::bigint, 0);
    insert into public.roles_codigo_counters (organizacion_id, consecutivo)
    values (rec.organizacion_id, v_max)
    on conflict (organizacion_id)
    do update set consecutivo = greatest(public.roles_codigo_counters.consecutivo, v_max);
  end loop;
end;
$$;

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
    v_codigo := lpad(regexp_replace(new.codigo, '\D', '', 'g'), 4, '0');
  end if;
  new.codigo := v_codigo;
  return new;
end;
$$;

create trigger t_roles_auto_codigo
before insert on public.roles
for each row
execute function public.roles_autofill_codigo();
