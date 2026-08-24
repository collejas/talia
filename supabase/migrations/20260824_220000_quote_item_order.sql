-- Persiste el orden de captura de cada línea de cotización como dato estructural.
-- El valor anterior vivía dentro de metadata y no podía usarse de forma fiable
-- al ordenar las líneas recuperadas para el PDF.

ALTER TABLE public.cotizacion_items
    ADD COLUMN IF NOT EXISTS orden integer;

WITH ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY organizacion_id, cotizacion_id
            ORDER BY id
        )::integer AS fallback_orden
    FROM public.cotizacion_items
)
UPDATE public.cotizacion_items AS ci
SET orden = CASE
    WHEN ci.metadata->>'orden' ~ '^[1-9][0-9]*$'
        THEN (ci.metadata->>'orden')::integer
    ELSE ranked.fallback_orden
END
FROM ranked
WHERE ranked.id = ci.id
  AND ci.orden IS NULL;

ALTER TABLE public.cotizacion_items
    ALTER COLUMN orden SET NOT NULL;

ALTER TABLE public.cotizacion_items
    DROP CONSTRAINT IF EXISTS cotizacion_items_orden_positive_check;

ALTER TABLE public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_orden_positive_check
    CHECK (orden > 0);

CREATE UNIQUE INDEX IF NOT EXISTS cotizacion_items_org_quote_orden_uidx
    ON public.cotizacion_items (organizacion_id, cotizacion_id, orden);

COMMENT ON COLUMN public.cotizacion_items.orden IS
    'Posición de la línea dentro de la cotización, en el orden capturado por el usuario.';
