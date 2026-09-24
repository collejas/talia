BEGIN;

ALTER TABLE public.pedido_venta_documentos
    ALTER COLUMN archivo_id DROP NOT NULL,
    ADD COLUMN referencia text,
    ADD COLUMN observaciones text;

ALTER TABLE public.pedido_venta_documentos
    DROP CONSTRAINT pedido_venta_documentos_type_check,
    DROP CONSTRAINT pedido_venta_documentos_order_type_uidx,
    ADD CONSTRAINT pedido_venta_documentos_type_check CHECK (
        tipo_documento IN (
            'orden_compra', 'cotizacion_firmada_aceptada', 'correo_electronico',
            'whatsapp', 'contrato', 'confirmacion_verbal', 'otro'
        )
    ),
    ADD CONSTRAINT pedido_venta_documentos_evidence_check CHECK (
        archivo_id IS NOT NULL
        OR NULLIF(btrim(referencia), '') IS NOT NULL
        OR NULLIF(btrim(observaciones), '') IS NOT NULL
    );

CREATE INDEX pedido_venta_documentos_org_order_type_idx
    ON public.pedido_venta_documentos (organizacion_id, pedido_venta_id, tipo_documento, creado_en DESC);

NOTIFY pgrst, 'reload schema';
COMMIT;
