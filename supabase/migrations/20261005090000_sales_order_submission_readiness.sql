BEGIN;

-- La misma regla de completitud se usa para el resumen de Comercial y para
-- impedir que un pedido incompleto entre a la cola de Operaciones.
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
        CASE WHEN NULLIF(btrim(v_cuenta.codigo_postal), '') IS NULL THEN 'Código postal fiscal' END
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

-- El envío a revisión reutiliza la misma regla, incluso si se intenta omitir
-- la interfaz mediante una llamada directa al endpoint.
CREATE OR REPLACE FUNCTION public.crm_enviar_pedido_a_formalizacion(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid,
    p_forma_confirmacion text,
    p_fecha_confirmacion_cliente date,
    p_referencia_pedido_cliente text DEFAULT NULL,
    p_fecha_orden_cliente date DEFAULT NULL,
    p_observaciones_confirmacion text DEFAULT NULL
)
RETURNS TABLE (pedido_venta_id uuid, estado_formalizacion text, inventario_reservado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
    v_quote record;
    v_completitud record;
    v_almacen_id uuid;
    v_items jsonb;
    v_stock_count integer;
BEGIN
    IF p_organizacion_id IS NULL OR p_cotizacion_id IS NULL OR p_usuario_id IS NULL THEN
        RAISE EXCEPTION 'organization_quote_and_user_required' USING ERRCODE = 'P0001';
    END IF;
    IF p_forma_confirmacion NOT IN ('orden_compra','cotizacion_firmada_aceptada','correo_electronico','whatsapp','contrato','confirmacion_verbal','anticipo_pago','otro') THEN
        RAISE EXCEPTION 'invalid_order_confirmation_method' USING ERRCODE = 'P0001';
    END IF;
    IF p_fecha_confirmacion_cliente IS NULL THEN
        RAISE EXCEPTION 'order_confirmation_date_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT q.estatus AS cotizacion_estatus, o.estado AS oportunidad_estado
      INTO v_quote
      FROM public.cotizaciones q
      JOIN public.oportunidades o
        ON o.organizacion_id = q.organizacion_id
       AND o.id = q.oportunidad_id
     WHERE q.organizacion_id = p_organizacion_id
       AND q.id = p_cotizacion_id
     FOR UPDATE OF q, o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF lower(v_quote.cotizacion_estatus) <> 'aceptada' OR v_quote.oportunidad_estado <> 'ganada' THEN
        RAISE EXCEPTION 'accepted_won_quote_required' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.crm_crear_pedido_venta(p_organizacion_id, p_cotizacion_id, p_usuario_id);
    SELECT * INTO v_pedido FROM public.pedidos_venta
     WHERE organizacion_id = p_organizacion_id AND cotizacion_id = p_cotizacion_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE = 'P0001'; END IF;
    IF v_pedido.estatus NOT IN ('borrador','pendiente_confirmacion') OR v_pedido.estado_formalizacion NOT IN ('sin_enviar','devuelto') THEN
        IF v_pedido.estado_formalizacion = 'pendiente' THEN
            RETURN QUERY SELECT v_pedido.id, v_pedido.estado_formalizacion,
                EXISTS(SELECT 1 FROM public.inventario_reservas ir WHERE ir.organizacion_id = p_organizacion_id AND ir.pedido_venta_id = v_pedido.id AND ir.estado = 'activa');
            RETURN;
        END IF;
        RAISE EXCEPTION 'sales_order_not_submittable' USING ERRCODE = 'P0001';
    END IF;

    -- La forma y referencia recibidas en el formulario forman parte de la
    -- evaluación antes de cambiar el estado a pendiente de revisión.
    UPDATE public.pedidos_venta
       SET forma_confirmacion = p_forma_confirmacion,
           referencia_pedido_cliente = NULLIF(btrim(p_referencia_pedido_cliente), ''),
           fecha_orden_cliente = p_fecha_orden_cliente,
           fecha_confirmacion_cliente = p_fecha_confirmacion_cliente,
           observaciones_confirmacion = NULLIF(btrim(p_observaciones_confirmacion), ''),
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id
       AND id = v_pedido.id;
    SELECT * INTO v_pedido FROM public.pedidos_venta
     WHERE organizacion_id = p_organizacion_id AND id = v_pedido.id;

    SELECT * INTO v_completitud
      FROM public.crm_obtener_completitud_pedido_venta(p_organizacion_id, p_cotizacion_id, p_usuario_id);
    IF NOT COALESCE(v_completitud.puede_enviar_a_revision, false) THEN
        RAISE EXCEPTION 'sales_order_completeness_incomplete' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*)::integer INTO v_stock_count
      FROM public.pedido_venta_items pvi
      JOIN public.catalog_items ci ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id
     WHERE pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = v_pedido.id AND ci.maneja_inventario IS TRUE;
    IF p_forma_confirmacion = 'orden_compra' AND v_stock_count > 0 THEN
        SELECT a.id INTO v_almacen_id FROM public.almacenes a
         WHERE a.organizacion_id = p_organizacion_id AND a.activo IS TRUE
         ORDER BY a.es_principal DESC, a.id LIMIT 1;
        IF v_almacen_id IS NULL THEN RAISE EXCEPTION 'inventory_warehouse_required' USING ERRCODE = 'P0001'; END IF;
        SELECT COALESCE(jsonb_agg(jsonb_build_object('quote_item_id', pvi.cotizacion_item_id, 'catalog_item_id', pvi.catalog_item_id, 'cantidad', pvi.cantidad) ORDER BY pvi.orden), '[]'::jsonb)
          INTO v_items
          FROM public.pedido_venta_items pvi
          JOIN public.catalog_items ci ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id AND ci.maneja_inventario
         WHERE pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = v_pedido.id
           AND NOT EXISTS (SELECT 1 FROM public.inventario_reservas ir WHERE ir.organizacion_id = p_organizacion_id AND ir.quote_id = p_cotizacion_id AND ir.quote_item_id = pvi.cotizacion_item_id AND ir.estado = 'activa');
        IF jsonb_array_length(v_items) > 0 THEN
            PERFORM public.crm_reservar_inventario_cotizacion(p_organizacion_id, p_cotizacion_id, v_almacen_id, v_items, p_usuario_id);
        END IF;
        UPDATE public.inventario_reservas ir SET pedido_venta_id = v_pedido.id, pedido_venta_item_id = pvi.id,
            motivo = 'Reserva anticipada por orden de compra validada'
          FROM public.pedido_venta_items pvi
         WHERE ir.organizacion_id = p_organizacion_id AND ir.quote_id = p_cotizacion_id AND ir.quote_item_id = pvi.cotizacion_item_id
           AND pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = v_pedido.id AND ir.estado = 'activa' AND pvi.catalog_item_id = ir.catalog_item_id;
    ELSE
        IF EXISTS (
            SELECT 1
              FROM public.inventario_reservas ir
             WHERE ir.organizacion_id = p_organizacion_id
               AND ir.pedido_venta_id = v_pedido.id
               AND ir.estado = 'activa'
        ) THEN
            PERFORM public.crm_liberar_inventario_cotizacion(p_organizacion_id, p_cotizacion_id, p_usuario_id);
        END IF;
    END IF;

    UPDATE public.pedidos_venta SET estado_formalizacion = 'pendiente', enviado_formalizacion_en = now(), enviado_formalizacion_por_usuario_id = p_usuario_id,
        devuelto_comercial_en = NULL, devuelto_comercial_por_usuario_id = NULL, motivo_devolucion_comercial = NULL,
        revision_cliente_validada = false, revision_evidencia_validada = false, revision_partidas_validada = false,
        revision_operativa_por_usuario_id = NULL, revision_operativa_en = NULL,
        forma_confirmacion = p_forma_confirmacion, fecha_confirmacion_cliente = p_fecha_confirmacion_cliente,
        referencia_pedido_cliente = NULLIF(btrim(p_referencia_pedido_cliente), ''), fecha_orden_cliente = p_fecha_orden_cliente,
        observaciones_confirmacion = NULLIF(btrim(p_observaciones_confirmacion), ''), actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_pedido.id;
    RETURN QUERY SELECT v_pedido.id, 'pendiente'::text,
        EXISTS(SELECT 1 FROM public.inventario_reservas ir WHERE ir.organizacion_id = p_organizacion_id AND ir.pedido_venta_id = v_pedido.id AND ir.estado = 'activa');
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_enviar_pedido_a_formalizacion(uuid, uuid, uuid, text, date, text, date, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_enviar_pedido_a_formalizacion(uuid, uuid, uuid, text, date, text, date, text)
    TO service_role;

COMMIT;
