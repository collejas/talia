BEGIN;

-- Rename level tables to reflect the hierarchical plano naming.
ALTER TABLE public.propiedad_niveles RENAME TO propiedad_capas;
ALTER INDEX ix_propiedad_niveles_propiedad RENAME TO ix_propiedad_capas_propiedad;
ALTER INDEX ix_propiedad_niveles_geom RENAME TO ix_propiedad_capas_geom;
ALTER POLICY propiedad_niveles_admin_all ON public.propiedad_capas RENAME TO propiedad_capas_admin_all;
ALTER POLICY propiedad_niveles_member_org ON public.propiedad_capas RENAME TO propiedad_capas_member_org;
ALTER TRIGGER propiedad_niveles_touch_updated_at ON public.propiedad_capas RENAME TO propiedad_capas_touch_updated_at;

ALTER TABLE public.propiedad_departamentos RENAME TO propiedad_unidades;
ALTER INDEX ix_propiedad_departamentos_nivel RENAME TO ix_propiedad_unidades_nivel;
ALTER INDEX ix_propiedad_departamentos_geom RENAME TO ix_propiedad_unidades_geom;
ALTER POLICY propiedad_departamentos_admin_all ON public.propiedad_unidades RENAME TO propiedad_unidades_admin_all;
ALTER POLICY propiedad_departamentos_member_org ON public.propiedad_unidades RENAME TO propiedad_unidades_member_org;
ALTER TRIGGER propiedad_departamentos_touch_updated_at ON public.propiedad_unidades RENAME TO propiedad_unidades_touch_updated_at;

COMMIT;
