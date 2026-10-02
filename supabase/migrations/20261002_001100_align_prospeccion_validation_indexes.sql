-- Alinea los predicados de los indices con los filtros PostgREST generados
-- por list_prospectos (IS NOT NULL + <> '').

drop index if exists public.prospeccion_prospectos_org_lookup_status_creado_idx;
drop index if exists public.prospeccion_prospectos_org_email_lookup_status_creado_idx;
drop index if exists public.prospeccion_prospectos_org_website_lookup_status_creado_idx;

create index if not exists prospeccion_prospectos_org_lookup_status_creado_idx
    on public.prospeccion_prospectos (organizacion_id, lookup_status, creado_en desc, id)
    where lookup_status is not null
      and phone is not null
      and phone <> '';

create index if not exists prospeccion_prospectos_org_email_lookup_status_creado_idx
    on public.prospeccion_prospectos (organizacion_id, email_lookup_status, creado_en desc, id)
    where email_lookup_status is not null
      and email is not null
      and email <> '';

create index if not exists prospeccion_prospectos_org_website_lookup_status_creado_idx
    on public.prospeccion_prospectos (organizacion_id, website_lookup_status, creado_en desc, id)
    where website_lookup_status is not null
      and website is not null
      and website <> '';
