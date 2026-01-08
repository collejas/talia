BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_document_embeddings_delete_missing(
  p_organizacion_id uuid,
  p_entity_type text,
  p_keep_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_keep_ids IS NULL OR cardinality(p_keep_ids) = 0 THEN
    DELETE FROM public.catalog_document_embeddings
    WHERE organizacion_id = p_organizacion_id
      AND entity_type = p_entity_type;
  ELSE
    DELETE FROM public.catalog_document_embeddings
    WHERE organizacion_id = p_organizacion_id
      AND entity_type = p_entity_type
      AND NOT (entity_id = ANY (p_keep_ids));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catalog_document_embeddings_delete_missing(uuid,text,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_document_embeddings_delete_missing(uuid,text,uuid[]) TO service_role;

COMMIT;
