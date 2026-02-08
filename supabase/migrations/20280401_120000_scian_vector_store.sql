BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.scian_clase_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  titulo text,
  descripcion text,
  incluye text,
  excluye text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding vector(1536) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scian_clase_embeddings_embedding_idx
  ON public.scian_clase_embeddings
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS scian_clase_embeddings_codigo_idx
  ON public.scian_clase_embeddings (codigo);

ALTER TABLE public.scian_clase_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY scian_clase_embeddings_public_select
  ON public.scian_clase_embeddings
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.scian_clase_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scian_clase_embeddings TO service_role;

CREATE OR REPLACE FUNCTION public.scian_clase_embeddings_search(
  p_embedding vector,
  p_limit int DEFAULT 6
)
RETURNS TABLE (
  codigo text,
  titulo text,
  descripcion text,
  incluye text,
  excluye text,
  items jsonb,
  metadata jsonb,
  distance double precision,
  similarity double precision
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    codigo,
    titulo,
    descripcion,
    incluye,
    excluye,
    items,
    metadata,
    (embedding <=> p_embedding) AS distance,
    CASE
      WHEN (embedding <=> p_embedding) IS NOT NULL THEN 1.0 / (1.0 + (embedding <=> p_embedding))
      ELSE NULL
    END AS similarity
  FROM public.scian_clase_embeddings
  ORDER BY embedding <=> p_embedding
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.scian_clase_embeddings_delete_missing(
  p_keep_codigos text[] DEFAULT NULL::text[]
)
RETURNS void
AS $$
BEGIN
  IF p_keep_codigos IS NULL THEN
    DELETE FROM public.scian_clase_embeddings;
  ELSE
    DELETE FROM public.scian_clase_embeddings WHERE codigo IS NULL OR NOT (codigo = ANY (p_keep_codigos));
  END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.scian_clase_embeddings_search(vector,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scian_clase_embeddings_delete_missing(text[]) TO service_role;

COMMIT;
