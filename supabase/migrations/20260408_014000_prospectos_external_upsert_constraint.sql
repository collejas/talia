create unique index if not exists prospeccion_prospectos_org_fuente_external_unique
  on public.prospeccion_prospectos (organizacion_id, fuente, external_id);
