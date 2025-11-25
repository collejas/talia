BEGIN;

--------------------------------------------------------------------------------
-- Limpieza final de tablas legacy del pipeline (lead_*)
-- Después de migrar a /crm, estas tablas, vistas y funciones ya no se usan.
--------------------------------------------------------------------------------

-- Quita referencias residuales desde clientes (conservamos la columna como UUID informativo).
ALTER TABLE public.clientes
    DROP CONSTRAINT IF EXISTS clientes_legacy_lead_id_fkey;

DROP INDEX IF EXISTS public.clientes_legacy_lead_idx;

-- Elimina vistas legacy conocidas antes de borrar las tablas.
DROP VIEW IF EXISTS public.ventas_por_producto_mes;
DROP VIEW IF EXISTS public.embudo_por_producto;

-- Borra tablas legacy y cualquier función/vista dependiente.
DROP TABLE IF EXISTS public.lead_tarjeta_items CASCADE;
DROP TABLE IF EXISTS public.lead_cotizacion_items CASCADE;
DROP TABLE IF EXISTS public.lead_cotizaciones CASCADE;
DROP TABLE IF EXISTS public.lead_recordatorios CASCADE;
DROP TABLE IF EXISTS public.lead_movimientos CASCADE;
DROP TABLE IF EXISTS public.lead_tarjetas CASCADE;
DROP TABLE IF EXISTS public.lead_etapas CASCADE;
DROP TABLE IF EXISTS public.lead_tableros CASCADE;

COMMIT;
