BEGIN;

-- Todos los medios de confirmación soportados por el flujo comercial deben
-- poder persistir su evidencia. Solo orden_compra utiliza los campos propios
-- de una OC (referencia y fecha de OC).
ALTER TABLE public.pedido_venta_documentos
    DROP CONSTRAINT pedido_venta_documentos_type_check,
    ADD CONSTRAINT pedido_venta_documentos_type_check CHECK (
        tipo_documento IN (
            'orden_compra', 'cotizacion_firmada_aceptada', 'correo_electronico',
            'whatsapp', 'contrato', 'confirmacion_verbal', 'anticipo_pago', 'otro'
        )
    );

CREATE OR REPLACE FUNCTION public.crm_confirmar_pedido_venta_con_evidencia(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid DEFAULT NULL,
    p_fecha_vencimiento date DEFAULT NULL,
    p_referencia_pedido_cliente text DEFAULT NULL,
    p_fecha_orden_cliente date DEFAULT NULL,
    p_forma_confirmacion text DEFAULT 'otro',
    p_fecha_confirmacion_cliente date DEFAULT CURRENT_DATE,
    p_observaciones_confirmacion text DEFAULT NULL
)
RETURNS TABLE (
    venta_id uuid,
    cliente_id uuid,
    cuenta_por_cobrar_id uuid,
    venta_estatus text,
    total numeric,
    pago_acumulado numeric,
    saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido_id uuid;
    v_estatus text;
    v_forma text := lower(btrim(COALESCE(p_forma_confirmacion, '')));
BEGIN
    PERFORM public.crm_crear_pedido_venta(p_organizacion_id, p_cotizacion_id, p_usuario_id);
    SELECT pv.id, pv.estatus INTO v_pedido_id, v_estatus
      FROM public.pedidos_venta AS pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_estatus = 'confirmado' THEN
        RETURN QUERY SELECT * FROM public.crm_confirmar_pedido_venta(
            p_organizacion_id, p_cotizacion_id, p_usuario_id, p_fecha_vencimiento,
            p_referencia_pedido_cliente, p_fecha_orden_cliente
        );
        RETURN;
    END IF;
    IF v_estatus = 'cancelado' THEN
        RAISE EXCEPTION 'sales_order_cancelled' USING ERRCODE = 'P0001';
    END IF;
    IF v_forma NOT IN (
        'orden_compra', 'cotizacion_firmada_aceptada', 'correo_electronico',
        'whatsapp', 'contrato', 'confirmacion_verbal', 'anticipo_pago', 'otro'
    ) THEN
        RAISE EXCEPTION 'invalid_order_confirmation_method' USING ERRCODE = 'P0001';
    END IF;
    IF v_forma = 'orden_compra'
       AND NULLIF(btrim(p_referencia_pedido_cliente), '') IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.pedido_venta_documentos AS pvd
            WHERE pvd.organizacion_id = p_organizacion_id
              AND pvd.pedido_venta_id = v_pedido_id
              AND pvd.tipo_documento = 'orden_compra'
              AND (pvd.archivo_id IS NOT NULL OR NULLIF(btrim(pvd.referencia), '') IS NOT NULL)
       ) THEN
        RAISE EXCEPTION 'order_purchase_order_evidence_required' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.pedidos_venta
       SET forma_confirmacion = v_forma,
           fecha_confirmacion_cliente = COALESCE(p_fecha_confirmacion_cliente, CURRENT_DATE),
           observaciones_confirmacion = NULLIF(btrim(p_observaciones_confirmacion), ''),
           referencia_pedido_cliente = CASE WHEN v_forma = 'orden_compra' THEN NULLIF(btrim(p_referencia_pedido_cliente), '') ELSE NULL END,
           fecha_orden_cliente = CASE WHEN v_forma = 'orden_compra' THEN p_fecha_orden_cliente ELSE NULL END,
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_pedido_id;

    RETURN QUERY
    SELECT * FROM public.crm_confirmar_pedido_venta(
        p_organizacion_id, p_cotizacion_id, p_usuario_id, p_fecha_vencimiento,
        CASE WHEN v_forma = 'orden_compra' THEN p_referencia_pedido_cliente ELSE NULL END,
        CASE WHEN v_forma = 'orden_compra' THEN p_fecha_orden_cliente ELSE NULL END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_confirmar_pedido_venta_con_evidencia(uuid, uuid, uuid, date, text, date, text, date, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_confirmar_pedido_venta_con_evidencia(uuid, uuid, uuid, date, text, date, text, date, text)
    TO service_role;

COMMIT;
