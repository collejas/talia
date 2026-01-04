BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.catalog_document_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON UPDATE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('producto','familia','linea','modelo','recurso')),
  entity_id uuid NOT NULL,
  contenido text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS catalog_document_embeddings_embedding_idx
  ON public.catalog_document_embeddings
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS catalog_document_embeddings_org_type_idx
  ON public.catalog_document_embeddings (organizacion_id, entity_type);

ALTER TABLE public.catalog_document_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_document_embeddings_tenant_select
  ON public.catalog_document_embeddings
  FOR SELECT
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY catalog_document_embeddings_tenant_insert
  ON public.catalog_document_embeddings
  FOR INSERT
  TO authenticated
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY catalog_document_embeddings_tenant_update
  ON public.catalog_document_embeddings
  FOR UPDATE
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
  WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY catalog_document_embeddings_tenant_delete
  ON public.catalog_document_embeddings
  FOR DELETE
  TO authenticated
  USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_document_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_document_embeddings TO service_role;

COMMIT;
