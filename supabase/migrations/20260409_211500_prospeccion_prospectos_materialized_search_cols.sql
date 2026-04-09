-- Materializa llaves hot de JSONB para acelerar filtros en prospeccion/prospectos.
ALTER TABLE public.prospeccion_prospectos
    ADD COLUMN IF NOT EXISTS stage text,
    ADD COLUMN IF NOT EXISTS busqueda_ref text,
    ADD COLUMN IF NOT EXISTS query_sort text;

CREATE OR REPLACE FUNCTION public.sync_prospeccion_prospectos_derived_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.stage := NULLIF(BTRIM(COALESCE(NEW.metadata->>'stage', '')), '');

    NEW.busqueda_ref := COALESCE(
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'busqueda_id', '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'busqueda_query', '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'query', '')), ''),
        NULLIF(BTRIM(COALESCE((NEW.metadata->'busqueda_meta'->>'query'), '')), '')
    );

    NEW.query_sort := COALESCE(
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'query', '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'busqueda_query', '')), ''),
        NULLIF(BTRIM(COALESCE((NEW.metadata->'busqueda_meta'->>'query'), '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.metadata->>'busqueda_id', '')), '')
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prospeccion_prospectos_sync_derived_cols ON public.prospeccion_prospectos;
CREATE TRIGGER trg_prospeccion_prospectos_sync_derived_cols
BEFORE INSERT OR UPDATE OF metadata
ON public.prospeccion_prospectos
FOR EACH ROW
EXECUTE FUNCTION public.sync_prospeccion_prospectos_derived_cols();

UPDATE public.prospeccion_prospectos AS p
SET
    stage = calc.stage,
    busqueda_ref = calc.busqueda_ref,
    query_sort = calc.query_sort
FROM (
    SELECT
        id,
        NULLIF(BTRIM(COALESCE(metadata->>'stage', '')), '') AS stage,
        COALESCE(
            NULLIF(BTRIM(COALESCE(metadata->>'busqueda_id', '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'busqueda_query', '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'query', '')), ''),
            NULLIF(BTRIM(COALESCE((metadata->'busqueda_meta'->>'query'), '')), '')
        ) AS busqueda_ref,
        COALESCE(
            NULLIF(BTRIM(COALESCE(metadata->>'query', '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'busqueda_query', '')), ''),
            NULLIF(BTRIM(COALESCE((metadata->'busqueda_meta'->>'query'), '')), ''),
            NULLIF(BTRIM(COALESCE(metadata->>'busqueda_id', '')), '')
        ) AS query_sort
    FROM public.prospeccion_prospectos
) AS calc
WHERE p.id = calc.id
  AND (
      p.stage IS DISTINCT FROM calc.stage
      OR p.busqueda_ref IS DISTINCT FROM calc.busqueda_ref
      OR p.query_sort IS DISTINCT FROM calc.query_sort
  );

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_stage_creado_idx
    ON public.prospeccion_prospectos USING btree (organizacion_id, stage, creado_en DESC)
    WHERE stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_busqueda_ref_idx
    ON public.prospeccion_prospectos USING btree (organizacion_id, busqueda_ref)
    WHERE busqueda_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_query_sort_idx
    ON public.prospeccion_prospectos USING btree (organizacion_id, query_sort, actividad, id)
    WHERE query_sort IS NOT NULL;
