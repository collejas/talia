-- Prospecting dashboards use Supabase user tokens to query these tables/views with RLS.
-- Re-enable read access for authenticated clients while keeping tenant isolation via policies.
grant select on public.busquedas to authenticated;
grant select on public.v_google_places_contactables to authenticated;
grant select on public.v_denue_contactables to authenticated;
grant select on public.prospeccion_buscador_jobs to authenticated;
grant select on public.prospeccion_buscador_resultados to authenticated;
grant select on public.prospeccion_contacto_batch to authenticated;
grant select on public.prospeccion_contacto_envio to authenticated;
grant select on public.prospeccion_contacto_listas to authenticated;
grant select on public.prospeccion_contacto_templates to authenticated;
grant select on public.prospeccion_contactos_log to authenticated;
grant select on public.prospeccion_prospectos to authenticated;
grant select on public.prospeccion_prospectos_audit to authenticated;
grant select on public.prospeccion_prospecto_contacto_stats to authenticated;
