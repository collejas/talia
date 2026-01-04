BEGIN;

CREATE TABLE public.catalog_embeddings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON UPDATE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('reindex','query')),
  canal text,
  usuario_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_embeddings_audit_organizacion_tipo_idx
  ON public.catalog_embeddings_audit (organizacion_id, tipo, creado_en DESC);

ALTER TABLE public.catalog_embeddings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_embeddings_audit_tenant_select
  ON public.catalog_embeddings_audit
  FOR SELECT
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY catalog_embeddings_audit_tenant_insert
  ON public.catalog_embeddings_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY catalog_embeddings_audit_tenant_update
  ON public.catalog_embeddings_audit
  FOR UPDATE
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY catalog_embeddings_audit_tenant_delete
  ON public.catalog_embeddings_audit
  FOR DELETE
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_embeddings_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_embeddings_audit TO service_role;

COMMIT;
