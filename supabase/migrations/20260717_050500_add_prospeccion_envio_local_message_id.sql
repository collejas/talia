alter table public.prospeccion_contacto_envio
    add column if not exists mensaje_id_interno text;

update public.prospeccion_contacto_envio
set mensaje_id_interno = mensaje_id
where mensaje_id is not null
  and mensaje_id_interno is null;

create index if not exists prospeccion_contacto_envio_org_mensaje_id_interno_idx
    on public.prospeccion_contacto_envio (organizacion_id, mensaje_id_interno)
    where mensaje_id_interno is not null;
