alter table public.cuentas
  add column if not exists regimen_capital text;

comment on column public.cuentas.regimen_capital is 'Régimen de capital para datos fiscales de cuentas.';
