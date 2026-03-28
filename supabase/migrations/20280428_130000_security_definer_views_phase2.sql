-- Security hardening phase 2
-- Objetivo: eliminar hallazgos `security_definer_view` en vistas expuestas.

BEGIN;

DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'v_asignaciones_vendedores',
    'scian_clases_flat',
    'prospeccion_prospecto_contacto_stats',
    'organizaciones_missing_etapas_pipeline'
  ]
  LOOP
    IF to_regclass('public.' || v_name) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
