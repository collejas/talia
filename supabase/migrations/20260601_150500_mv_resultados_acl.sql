BEGIN;

REVOKE ALL ON public.mv_resultados_por_actividad FROM anon;
REVOKE ALL ON public.mv_resultados_por_actividad FROM authenticated;

COMMIT;
