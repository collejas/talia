-- Esta variante se probó, pero el índice único actual usa expresiones y
-- PostgreSQL no permite REFRESH CONCURRENTLY con ese índice.
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

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.prospeccion_query_daily_mv;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.prospeccion_query_daily_mv_refresh() TO service_role;
