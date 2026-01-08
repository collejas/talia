BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_document_embeddings_search(
  p_organizacion_id uuid,
  p_embedding vector,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  organizacion_id uuid,
  entity_type text,
  entity_id uuid,
  contenido text,
  metadata jsonb,
  actualizado_en timestamptz,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
SELECT
  id,
  organizacion_id,
  entity_type,
  entity_id,
  contenido,
  metadata,
  actualizado_en,
  embedding <=> p_embedding AS similarity
FROM public.catalog_document_embeddings
WHERE organizacion_id = p_organizacion_id
ORDER BY similarity
LIMIT p_limit;
$$;

COMMIT;
