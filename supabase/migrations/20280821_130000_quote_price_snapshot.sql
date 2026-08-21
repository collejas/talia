-- Conserva explícitamente la lista y moneda aplicadas en cada línea de cotización.
-- La relación se mantiene normalizada y el nombre se congela como snapshot histórico.

ALTER TABLE public.cotizacion_items
    ADD COLUMN IF NOT EXISTS lista_precio_id uuid,
    ADD COLUMN IF NOT EXISTS lista_precio_nombre text,
    ADD COLUMN IF NOT EXISTS moneda_aplicada character(3);

ALTER TABLE public.cotizacion_items
    DROP CONSTRAINT IF EXISTS cotizacion_items_moneda_aplicada_check;

ALTER TABLE public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_moneda_aplicada_check
    CHECK (moneda_aplicada IS NULL OR char_length(moneda_aplicada) = 3);

ALTER TABLE public.cotizacion_items
    DROP CONSTRAINT IF EXISTS cotizacion_items_lista_precio_org_fkey;

ALTER TABLE public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_lista_precio_org_fkey
    FOREIGN KEY (organizacion_id, lista_precio_id)
    REFERENCES public.listas_precios (organizacion_id, id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS cotizacion_items_org_lista_precio_idx
    ON public.cotizacion_items (organizacion_id, lista_precio_id, cotizacion_id);

-- Las cotizaciones anteriores no tenían lista; sí conocemos su moneda de emisión.
UPDATE public.cotizacion_items ci
SET moneda_aplicada = c.moneda
FROM public.cotizaciones c
WHERE c.organizacion_id = ci.organizacion_id
  AND c.id = ci.cotizacion_id
  AND ci.moneda_aplicada IS NULL
  AND c.moneda IS NOT NULL;

COMMENT ON COLUMN public.cotizacion_items.lista_precio_id IS
    'Lista de precios autorizada usada para calcular esta línea; nullable para cotizaciones históricas o líneas manuales.';
COMMENT ON COLUMN public.cotizacion_items.lista_precio_nombre IS
    'Snapshot del nombre de la lista al momento de guardar la cotización.';
COMMENT ON COLUMN public.cotizacion_items.moneda_aplicada IS
    'Snapshot de la moneda aplicada a la línea al momento de guardar la cotización.';
