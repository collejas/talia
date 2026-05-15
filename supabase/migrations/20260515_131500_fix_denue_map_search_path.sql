BEGIN;

ALTER FUNCTION public.denue_resultados_map(
    uuid,
    double precision,
    double precision,
    double precision,
    double precision,
    integer,
    text,
    boolean,
    boolean,
    boolean,
    text,
    text[],
    text,
    text,
    text,
    integer
) SET search_path = public, extensions, pg_temp;

COMMIT;
