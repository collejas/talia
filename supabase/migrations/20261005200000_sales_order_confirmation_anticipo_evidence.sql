BEGIN;

-- Todos los medios de confirmación permitidos por pedidos_venta deben poder
-- persistirse también como evidencia asociada al pedido.
ALTER TABLE public.pedido_venta_documentos
    DROP CONSTRAINT pedido_venta_documentos_type_check,
    ADD CONSTRAINT pedido_venta_documentos_type_check CHECK (
        tipo_documento IN (
            'orden_compra', 'cotizacion_firmada_aceptada', 'correo_electronico',
            'whatsapp', 'contrato', 'confirmacion_verbal', 'anticipo_pago', 'otro'
        )
    );

NOTIFY pgrst, 'reload schema';
COMMIT;
