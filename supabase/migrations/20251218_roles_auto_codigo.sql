-- Auto-generate role codes per organization when omitted
create table if not exists public.roles_codigo_counters (
  organizacion_id uuid primary key,
  consecutivo bigint not null default 0,
  actualizado_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);

comment on table public.roles_codigo_counters is 'Lleva el consecutivo por organización para generar códigos de roles.';

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

  return 'ROL-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.roles_autofill_codigo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    new.codigo := public.next_role_codigo(new.organizacion_id);
  end if;
  return new;
end;
$$;

drop trigger if exists t_roles_auto_codigo on public.roles;
create trigger t_roles_auto_codigo
before insert on public.roles
for each row
execute function public.roles_autofill_codigo();
