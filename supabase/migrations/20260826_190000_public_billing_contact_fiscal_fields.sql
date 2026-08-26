alter table public.organizaciones
  add column if not exists contacto_apellidos text,
  add column if not exists tipo_persona_fiscal text;

alter table public.organizaciones
  drop constraint if exists organizaciones_tipo_persona_fiscal_check;

alter table public.organizaciones
  add constraint organizaciones_tipo_persona_fiscal_check
  check (tipo_persona_fiscal is null or tipo_persona_fiscal in ('moral', 'pfae'));

comment on column public.organizaciones.contacto_apellidos is
  'Apellidos del contacto principal capturados durante el alta comercial.';

comment on column public.organizaciones.tipo_persona_fiscal is
  'Tipo fiscal para empresas mexicanas: moral o persona fisica con actividad empresarial (pfae).';
