alter table public.cuentas
  add column if not exists segmento text;

update public.cuentas
set segmento = coalesce(segmento, metadata->>'segmento')
where segmento is null
  and metadata ? 'segmento';
