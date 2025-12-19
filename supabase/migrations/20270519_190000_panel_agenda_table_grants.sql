-- Restore SELECT permissions required by the Agenda view when using user tokens.
-- RLS keeps every table tenant-scoped, so these grants only expose the rows
-- allowed by policies.
grant select on public.oportunidades to authenticated;
grant select on public.etapas_pipeline to authenticated;
grant select on public.usuarios to authenticated;
grant select on public.contactos to authenticated;
grant select on public.conversaciones to authenticated;
