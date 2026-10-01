-- Evita refreshes concurrentes de la MV de consultas de Prospección.
-- El lock es transaccional y se libera automáticamente al terminar la RPC.

create or replace function public.prospeccion_query_daily_mv_refresh()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pg_try_advisory_xact_lock(741238901) then
    raise notice 'prospeccion_query_daily_mv_refresh_skipped: refresh already running';
    return;
  end if;

  refresh materialized view public.prospeccion_query_daily_mv;
end;
$$;

grant execute on function public.prospeccion_query_daily_mv_refresh() to service_role;
