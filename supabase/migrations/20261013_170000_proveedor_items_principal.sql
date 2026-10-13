BEGIN;

-- Un producto puede tener varios proveedores, pero solo uno puede ser el
-- proveedor principal activo dentro de la organización.
CREATE UNIQUE INDEX IF NOT EXISTS proveedor_items_org_item_principal_unq
    ON public.proveedor_items (organizacion_id, catalog_item_id)
    WHERE activo = true AND es_principal = true;

COMMENT ON INDEX public.proveedor_items_org_item_principal_unq IS
    'Garantiza un único proveedor principal activo por producto y tenant.';

COMMIT;
