BEGIN;

CREATE INDEX IF NOT EXISTS almacenes_direccion_id_idx
    ON public.almacenes (direccion_id);

CREATE INDEX IF NOT EXISTS almacenes_responsable_usuario_id_idx
    ON public.almacenes (responsable_usuario_id);

CREATE INDEX IF NOT EXISTS inventario_existencias_catalog_item_id_idx
    ON public.inventario_existencias (catalog_item_id);

CREATE INDEX IF NOT EXISTS inventario_existencias_almacen_id_idx
    ON public.inventario_existencias (almacen_id);

CREATE INDEX IF NOT EXISTS inventario_movimientos_catalog_item_id_idx
    ON public.inventario_movimientos (catalog_item_id);

CREATE INDEX IF NOT EXISTS inventario_movimientos_almacen_id_idx
    ON public.inventario_movimientos (almacen_id);

CREATE INDEX IF NOT EXISTS inventario_movimientos_creado_por_idx
    ON public.inventario_movimientos (creado_por);

COMMIT;
