begin;

with chosen as (
  select distinct on (cp.persona_id)
    cp.persona_id,
    cp.puesto
  from public.cuenta_personas cp
  where cp.puesto is not null
    and btrim(cp.puesto) <> ''
  order by cp.persona_id, cp.es_contacto_principal desc, cp.es_representante_legal desc, cp.activo desc, cp.creado_en asc
)
update public.personas p
set puesto = chosen.puesto
from chosen
where p.id = chosen.persona_id
  and (p.puesto is null or btrim(p.puesto) = '');

alter table public.cuenta_personas
  drop column if exists puesto;

commit;
