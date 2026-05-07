BEGIN;

CREATE INDEX IF NOT EXISTS prospeccion_resultado_apariciones_busqueda_idx
    ON public.prospeccion_resultado_apariciones (busqueda_id, resultado_id);

COMMIT;
