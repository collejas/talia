BEGIN;

GRANT EXECUTE ON FUNCTION public.crear_busqueda(
    public.fuente_resultado,
    text,
    integer,
    double precision,
    double precision,
    integer,
    jsonb
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_resultados_lote(
    uuid,
    public.fuente_resultado,
    jsonb
) TO authenticated, service_role;

COMMIT;
