-- Restaurar el refresh normal: la MV no tiene un índice único basado solo en
-- columnas, requisito de PostgreSQL para REFRESH CONCURRENTLY.
CREATE OR REPLACE FUNCTION public.prospeccion_query_daily_mv_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT pg_try_advisory_xact_lock(741238901) THEN
    RAISE NOTICE 'prospeccion_query_daily_mv_refresh_skipped: refresh already running';
    RETURN;
  END IF;

  REFRESH MATERIALIZED VIEW public.prospeccion_query_daily_mv;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.prospeccion_query_daily_mv_refresh() TO service_role;
