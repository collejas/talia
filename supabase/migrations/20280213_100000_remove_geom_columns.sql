BEGIN;

DROP INDEX IF EXISTS ix_propiedad_desarrollos_geom;
ALTER TABLE IF EXISTS public.propiedad_desarrollos DROP COLUMN IF EXISTS geom;

DROP INDEX IF EXISTS ix_propiedad_capas_geom;
ALTER TABLE IF EXISTS public.propiedad_capas DROP COLUMN IF EXISTS geom;

DROP INDEX IF EXISTS ix_propiedad_unidades_geom;
ALTER TABLE IF EXISTS public.propiedad_unidades DROP COLUMN IF EXISTS geom;

COMMIT;
