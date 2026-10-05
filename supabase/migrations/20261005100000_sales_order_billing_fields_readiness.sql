BEGIN;

-- Amplia la regla central del bloque "Cliente y facturación" con los datos
-- fiscales necesarios para emitir correctamente la factura.
CREATE OR REPLACE FUNCTION public.crm_obtener_completitud_pedido_venta(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid
)
RETURNS TABLE (
    cliente_facturacion_completo boolean,
    oc_evidencias_completo boolean,
    datos_entrega_completos boolean,
    productos_cantidades_completos boolean,
    faltantes_cliente_facturacion text[],
    faltantes_oc_evidencias text[],
    faltantes_datos_entrega text[],
    faltantes_productos_cantidades text[],
    puede_enviar_a_revision boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
    v_quote record;
    v_oportunidad_cuenta_id uuid;
    v_cuenta record;
    v_cliente_faltantes text[] := '{}';
    v_evidencia_faltantes text[] := '{}';
    v_entrega_faltantes text[] := '{}';
    v_productos_faltantes text[] := '{}';
    v_cliente_ok boolean;
    v_evidencia_ok boolean;
    v_entrega_ok boolean;
    v_productos_ok boolean;
    v_requiere_entrega boolean;
BEGIN
    IF p_organizacion_id IS NULL OR p_cotizacion_id IS NULL OR p_usuario_id IS NULL THEN
        RAISE EXCEPTION 'organization_quote_and_user_required' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.crm_crear_pedido_venta(p_organizacion_id, p_cotizacion_id, p_usuario_id);

    SELECT q.*
      INTO v_quote
      FROM public.cotizaciones q
     WHERE q.organizacion_id = p_organizacion_id
       AND q.id = p_cotizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0001';
    END IF;
    SELECT o.cuenta_id
      INTO v_oportunidad_cuenta_id
      FROM public.oportunidades o
     WHERE o.organizacion_id = p_organizacion_id
       AND o.id = v_quote.oportunidad_id;

    SELECT pv.*
      INTO v_pedido
      FROM public.pedidos_venta pv
     WHERE pv.organizacion_id = p_organizacion_id
       AND pv.cotizacion_id = p_cotizacion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF NULLIF(btrim(v_pedido.forma_confirmacion), '') IS NULL THEN
        SELECT d.tipo_documento
          INTO v_pedido.forma_confirmacion
          FROM public.pedido_venta_documentos d
         WHERE d.organizacion_id = p_organizacion_id
           AND d.pedido_venta_id = v_pedido.id
         ORDER BY d.creado_en DESC, d.id DESC
         LIMIT 1;
    END IF;

    SELECT c.*
      INTO v_cuenta
      FROM public.cuentas c
     WHERE c.organizacion_id = p_organizacion_id
       AND c.id = COALESCE(v_quote.cuenta_id, v_oportunidad_cuenta_id);

    v_cliente_faltantes := ARRAY_REMOVE(ARRAY[
        CASE WHEN v_cuenta.id IS NULL THEN 'Cuenta CRM del cliente' END,
        CASE WHEN NULLIF(btrim(v_cuenta.razon_social), '') IS NULL THEN 'Razón social' END,
        CASE WHEN NULLIF(btrim(v_cuenta.rfc), '') IS NULL THEN 'RFC' END,
        CASE WHEN NULLIF(btrim(v_cuenta.email_facturacion), '') IS NULL THEN 'Correo de facturación' END,
        CASE WHEN NULLIF(btrim(v_cuenta.codigo_postal), '') IS NULL THEN 'Código postal fiscal' END,
        CASE WHEN NULLIF(btrim(v_cuenta.uso_cfdi), '') IS NULL THEN 'Uso de CFDI' END,
        CASE WHEN NULLIF(btrim(v_cuenta.forma_pago), '') IS NULL THEN 'Forma de pago' END,
        CASE WHEN NULLIF(btrim(v_cuenta.metodo_pago), '') IS NULL THEN 'Método de pago' END
    ]::text[], NULL);
    v_cliente_ok := cardinality(v_cliente_faltantes) = 0;

    IF NULLIF(btrim(v_pedido.forma_confirmacion), '') IS NULL THEN
        v_evidencia_faltantes := array_append(v_evidencia_faltantes, 'Forma de confirmación');
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM public.pedido_venta_documentos d
         WHERE d.organizacion_id = p_organizacion_id
           AND d.pedido_venta_id = v_pedido.id
           AND d.tipo_documento = v_pedido.forma_confirmacion
           AND (d.archivo_id IS NOT NULL
                OR NULLIF(btrim(d.referencia), '') IS NOT NULL
                OR NULLIF(btrim(d.observaciones), '') IS NOT NULL)
    ) THEN
        v_evidencia_faltantes := array_append(v_evidencia_faltantes, 'Evidencia de aceptación');
    END IF;
    IF v_pedido.forma_confirmacion = 'orden_compra'
       AND NULLIF(btrim(v_pedido.referencia_pedido_cliente), '') IS NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.pedido_venta_documentos d
            WHERE d.organizacion_id = p_organizacion_id
              AND d.pedido_venta_id = v_pedido.id
              AND d.tipo_documento = 'orden_compra'
              AND NULLIF(btrim(d.referencia), '') IS NOT NULL
       ) THEN
        v_evidencia_faltantes := array_append(v_evidencia_faltantes, 'Número de OC');
    END IF;
    v_evidencia_ok := cardinality(v_evidencia_faltantes) = 0;

    SELECT EXISTS (
        SELECT 1
          FROM public.pedido_venta_items pvi
          JOIN public.catalog_items ci
            ON ci.organizacion_id = pvi.organizacion_id
           AND ci.id = pvi.catalog_item_id
           AND ci.maneja_inventario IS TRUE
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_pedido.id
    ) INTO v_requiere_entrega;
    IF v_requiere_entrega AND NOT COALESCE(v_pedido.domicilio_entrega_completo, false) THEN
        v_entrega_faltantes := COALESCE(v_pedido.domicilio_entrega_faltantes, ARRAY['Dirección de envío de la empresa']);
    END IF;
    v_entrega_ok := NOT v_requiere_entrega OR cardinality(v_entrega_faltantes) = 0;

    IF NOT EXISTS (
        SELECT 1 FROM public.cotizacion_items qi
         WHERE qi.organizacion_id = p_organizacion_id
           AND qi.cotizacion_id = p_cotizacion_id
    ) THEN
        v_productos_faltantes := array_append(v_productos_faltantes, 'Al menos un producto o servicio');
    END IF;
    IF EXISTS (
        SELECT 1
          FROM public.cotizacion_items qi
          LEFT JOIN public.pedido_venta_items pvi
            ON pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_pedido.id
           AND pvi.cotizacion_item_id = qi.id
         WHERE qi.organizacion_id = p_organizacion_id
           AND qi.cotizacion_id = p_cotizacion_id
           AND pvi.id IS NULL
    ) OR EXISTS (
        SELECT 1
          FROM public.pedido_venta_items pvi
          JOIN public.cotizacion_items qi
            ON qi.organizacion_id = pvi.organizacion_id
           AND qi.id = pvi.cotizacion_item_id
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_pedido.id
           AND (
               pvi.cantidad IS DISTINCT FROM qi.cantidad
               OR pvi.catalog_item_id IS DISTINCT FROM qi.catalog_item_id
           )
    ) THEN
        v_productos_faltantes := array_append(v_productos_faltantes, 'Productos o cantidades no coinciden con la cotización');
    END IF;
    v_productos_ok := cardinality(v_productos_faltantes) = 0;

    RETURN QUERY SELECT
        v_cliente_ok,
        v_evidencia_ok,
        v_entrega_ok,
        v_productos_ok,
        v_cliente_faltantes,
        v_evidencia_faltantes,
        v_entrega_faltantes,
        v_productos_faltantes,
        v_cliente_ok AND v_evidencia_ok AND v_entrega_ok AND v_productos_ok;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_obtener_completitud_pedido_venta(uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_obtener_completitud_pedido_venta(uuid, uuid, uuid)
    TO service_role;

COMMIT;

