BEGIN;

CREATE INDEX pedidos_venta_org_enviado_usuario_idx
    ON public.pedidos_venta (organizacion_id, enviado_formalizacion_por_usuario_id)
    WHERE enviado_formalizacion_por_usuario_id IS NOT NULL;

CREATE INDEX pedidos_venta_org_devuelto_usuario_idx
    ON public.pedidos_venta (organizacion_id, devuelto_comercial_por_usuario_id)
    WHERE devuelto_comercial_por_usuario_id IS NOT NULL;

CREATE INDEX pedido_venta_eventos_org_actor_idx
    ON public.pedido_venta_eventos (organizacion_id, actor_usuario_id)
    WHERE actor_usuario_id IS NOT NULL;

COMMIT;
