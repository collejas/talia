alter table public.cuentas
  add column if not exists estado text;

alter table public.cuentas
  alter column estado set default 'activo';

update public.cuentas
set estado = 'activo'
where estado is distinct from 'activo';

alter table public.cuentas
  alter column estado set not null;

alter table public.cuentas
  add constraint cuentas_estado_check
  check (estado = any (array['activo'::text, 'inactivo'::text]));

comment on column public.cuentas.estado is 'Estado operativo de la cuenta: activo o inactivo.';
