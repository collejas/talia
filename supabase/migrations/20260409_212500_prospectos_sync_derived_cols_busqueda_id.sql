-- Ajusta derivación de busqueda_ref para incluir la columna busqueda_id
-- y no depender únicamente de llaves dentro de metadata.

CREATE OR REPLACE FUNCTION public.sync_prospeccion_prospectos_derived_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.stage := NULLIF(BTRIM(COALESCE(NEW.metadata->>'stage', '')), '');

    NEW.busqueda_ref := COALESCE(
        NULLIF(BTRIM(COALESCE(NEW.busqueda_id::text, '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'busqueda_id', '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'busqueda_query', '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'query', '')), ''),
        NULLIF(BTRIM(COALESCE((NEW.metadata->'busqueda_meta'->>'query'), '')), '')
    );

    NEW.query_sort := COALESCE(
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'query', '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'busqueda_query', '')), ''),
        NULLIF(BTRIM(COALESCE((NEW.metadata->'busqueda_meta'->>'query'), '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'busqueda_id', '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.busqueda_id::text, '')), '')
    );

    RETURN NEW;
END;
$$;

UPDATE public.prospeccion_prospectos AS p
SET
    busqueda_ref = calc.busqueda_ref,
    query_sort = calc.query_sort
FROM (
    SELECT
        id,
        COALESCE(
            NULLIF(BTRIM(COALESCE(busqueda_id::text, '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'busqueda_id', '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'busqueda_query', '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'query', '')), ''),
            NULLIF(BTRIM(COALESCE((metadata->'busqueda_meta'->>'query'), '')), '')
        ) AS busqueda_ref,
        COALESCE(
            NULLIF(BTRIM(COALESCE(metadata->>'query', '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'busqueda_query', '')), ''),
            NULLIF(BTRIM(COALESCE((metadata->'busqueda_meta'->>'query'), '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'busqueda_id', '')), ''),
            NULLIF(BTRIM(COALESCE(busqueda_id::text, '')), '')
        ) AS query_sort
    FROM public.prospeccion_prospectos
) AS calc
WHERE p.id = calc.id
  AND (
      p.busqueda_ref IS DISTINCT FROM calc.busqueda_ref
      OR p.query_sort IS DISTINCT FROM calc.query_sort
  );
