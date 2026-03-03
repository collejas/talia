-- Evita duplicados de oportunidades por conversación dentro de la misma organización.
-- Normaliza metadata legacy (conversacion_id -> conversation_id) y crea un índice único parcial.

UPDATE public.oportunidades o
SET metadata = o.metadata || jsonb_build_object('conversation_id', o.metadata->>'conversacion_id')
WHERE COALESCE(NULLIF(o.metadata->>'conversation_id', ''), '') = ''
  AND COALESCE(NULLIF(o.metadata->>'conversacion_id', ''), '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS oportunidades_org_conv_dedupe_uidx
ON public.oportunidades (
    organizacion_id,
    (COALESCE(NULLIF(metadata->>'conversation_id', ''), NULLIF(metadata->>'conversacion_id', '')))
)
WHERE COALESCE(NULLIF(metadata->>'conversation_id', ''), NULLIF(metadata->>'conversacion_id', '')) IS NOT NULL;
