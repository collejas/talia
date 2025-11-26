BEGIN;

ALTER FUNCTION public.crear_busqueda(public.fuente_resultado, text, integer, double precision, double precision, integer, jsonb)
    SET search_path = public, pg_temp;

ALTER FUNCTION public.upsert_resultados_lote(uuid, public.fuente_resultado, jsonb)
    SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_busquedas_set_centro()
    SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_resultados_set_geom()
    SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_resultados_set_tsv()
    SET search_path = public, pg_temp;

COMMIT;
