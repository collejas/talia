-- Optimiza el orden predeterminado del listado de prospectos por tenant.
-- Incluye NULLS LAST y el desempate estable por id para evitar un sort completo.
CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_creado_id_order_idx
  ON public.prospeccion_prospectos
  USING btree (organizacion_id, creado_en DESC NULLS LAST, id ASC);
