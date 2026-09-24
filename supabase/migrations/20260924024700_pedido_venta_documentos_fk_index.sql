CREATE INDEX pedido_venta_documentos_subido_por_usuario_idx
    ON public.pedido_venta_documentos (subido_por_usuario_id)
    WHERE subido_por_usuario_id IS NOT NULL;
