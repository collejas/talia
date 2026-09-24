-- Cover foreign keys introduced with the customer sales-order workflow.
-- Existing broader indexes do not start with several referenced key columns.
CREATE INDEX pedidos_venta_confirmado_usuario_idx
    ON public.pedidos_venta (confirmado_por_usuario_id)
    WHERE confirmado_por_usuario_id IS NOT NULL;
CREATE INDEX pedidos_venta_cancelado_usuario_idx
    ON public.pedidos_venta (cancelado_por_usuario_id)
    WHERE cancelado_por_usuario_id IS NOT NULL;
CREATE INDEX pedidos_venta_creado_usuario_idx
    ON public.pedidos_venta (creado_por_usuario_id)
    WHERE creado_por_usuario_id IS NOT NULL;

CREATE INDEX pedido_venta_items_cotizacion_item_idx
    ON public.pedido_venta_items (organizacion_id, cotizacion_item_id);
CREATE INDEX pedido_venta_items_propiedad_idx
    ON public.pedido_venta_items (propiedad_id)
    WHERE propiedad_id IS NOT NULL;
CREATE INDEX pedido_venta_items_unidad_idx
    ON public.pedido_venta_items (unidad_id)
    WHERE unidad_id IS NOT NULL;

CREATE INDEX inventario_reservas_org_pedido_item_idx
    ON public.inventario_reservas (organizacion_id, pedido_venta_item_id)
    WHERE pedido_venta_item_id IS NOT NULL;
