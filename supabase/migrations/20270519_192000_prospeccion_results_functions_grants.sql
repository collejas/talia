-- Prospecting results views depend on the resultados table; restore access for authenticated clients.
grant select on public.resultados to authenticated;

-- User-token endpoints still call these RPCs, so authenticated must keep EXECUTE.
grant execute on function public.prospeccion_stage_resumen() to authenticated;
grant execute on function public.prospeccion_enriquecimiento_resumen() to authenticated;
