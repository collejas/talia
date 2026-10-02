-- Acelera los filtros de validacion/verificacion de Prospectos.
-- Los indices parciales excluyen registros sin el dato correspondiente y
-- mantienen el orden usado por la vista (creado_en, id).

create index if not exists prospeccion_prospectos_org_lookup_status_creado_idx
    on public.prospeccion_prospectos (organizacion_id, lookup_status, creado_en desc, id)
    where lookup_status is not null
      and phone is not null
      and btrim(phone) <> '';

create index if not exists prospeccion_prospectos_org_email_lookup_status_creado_idx
    on public.prospeccion_prospectos (organizacion_id, email_lookup_status, creado_en desc, id)
    where email_lookup_status is not null
      and email is not null
      and btrim(email) <> '';

create index if not exists prospeccion_prospectos_org_website_lookup_status_creado_idx
    on public.prospeccion_prospectos (organizacion_id, website_lookup_status, creado_en desc, id)
    where website_lookup_status is not null
      and website is not null
      and btrim(website) <> '';
