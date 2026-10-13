BEGIN;

-- The catalog/list price remains the commercial reference. A quote may use a
-- higher negotiated unit price, while preserving both snapshots on the line.
ALTER TABLE public.cotizacion_items
    DROP CONSTRAINT IF EXISTS cotizacion_items_quote_price_not_below_catalog_check;

ALTER TABLE public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_quote_price_not_below_catalog_check
    CHECK (
        precio_lista_unitario IS NULL
        OR precio_unitario IS NULL
        OR precio_unitario >= precio_lista_unitario
    );

COMMENT ON COLUMN public.cotizacion_items.precio_unitario IS
    'Precio unitario negociado en la cotizacion; no puede ser menor que el precio_lista_unitario cuando existe.';

COMMENT ON COLUMN public.cotizacion_items.precio_lista_unitario IS
    'Snapshot del precio oficial del catalogo o lista al crear la cotizacion.';

COMMIT;
