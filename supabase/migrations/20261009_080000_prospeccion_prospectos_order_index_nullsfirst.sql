BEGIN;

-- El endpoint usa creado_en DESC sin NULLS LAST. El índice previo con
-- NULLS LAST no podía satisfacer completamente el ORDER BY y provocaba
-- Incremental Sort en el listado general.
CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_creado_id_order_nullsfirst_idx
    ON public.prospeccion_prospectos (organizacion_id, creado_en DESC, id);

COMMIT;
