BEGIN;

ALTER TABLE public.pedidos_venta
    ADD COLUMN revision_cliente_validada boolean NOT NULL DEFAULT false,
    ADD COLUMN revision_evidencia_validada boolean NOT NULL DEFAULT false,
    ADD COLUMN revision_partidas_validada boolean NOT NULL DEFAULT false,
    ADD COLUMN revision_operativa_por_usuario_id uuid,
    ADD COLUMN revision_operativa_en timestamptz,
    ADD CONSTRAINT pedidos_venta_revision_usuario_fkey
        FOREIGN KEY (organizacion_id, revision_operativa_por_usuario_id)
        REFERENCES public.usuarios(organizacion_id, id) ON DELETE SET NULL (revision_operativa_por_usuario_id);

CREATE INDEX pedidos_venta_org_revision_idx
    ON public.pedidos_venta (organizacion_id, estado_formalizacion, enviado_formalizacion_en)
    WHERE estado_formalizacion = 'pendiente';
CREATE INDEX pedidos_venta_org_revision_actor_idx
    ON public.pedidos_venta (organizacion_id, revision_operativa_por_usuario_id)
    WHERE revision_operativa_por_usuario_id IS NOT NULL;

ALTER TABLE public.pedido_venta_eventos DROP CONSTRAINT pedido_venta_eventos_evento_check;
ALTER TABLE public.pedido_venta_eventos ADD CONSTRAINT pedido_venta_eventos_evento_check CHECK (evento IN (
    'enviado_formalizacion', 'devuelto_comercial', 'reenviado_formalizacion',
    'pedido_confirmado', 'pedido_liberado_surtido', 'reserva_inventario_oc', 'pedido_cancelado'
));

DROP FUNCTION public.crm_enviar_pedido_a_formalizacion(uuid,uuid,uuid,text,date,text,date,text);
CREATE FUNCTION public.crm_enviar_pedido_a_formalizacion(
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
      INTO v_quote FROM public.cotizaciones q
      JOIN public.oportunidades o ON o.organizacion_id=q.organizacion_id AND o.id=q.oportunidad_id
     WHERE q.organizacion_id=p_organizacion_id AND q.id=p_cotizacion_id FOR UPDATE OF q,o;
    IF NOT FOUND THEN RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0001'; END IF;
    IF lower(v_quote.cotizacion_estatus) <> 'aceptada' OR v_quote.oportunidad_estado <> 'ganada' THEN
        RAISE EXCEPTION 'accepted_won_quote_required' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.crm_crear_pedido_venta(p_organizacion_id,p_cotizacion_id,p_usuario_id);
    SELECT pv.* INTO v_pedido FROM public.pedidos_venta pv
     WHERE pv.organizacion_id=p_organizacion_id AND pv.cotizacion_id=p_cotizacion_id FOR UPDATE;
    IF v_pedido.estatus NOT IN ('borrador','pendiente_confirmacion') OR v_pedido.estado_formalizacion NOT IN ('sin_enviar','devuelto') THEN
        IF v_pedido.estado_formalizacion='pendiente' THEN
            RETURN QUERY SELECT v_pedido.id,v_pedido.estado_formalizacion,
                EXISTS(SELECT 1 FROM public.inventario_reservas ir WHERE ir.organizacion_id=p_organizacion_id AND ir.pedido_venta_id=v_pedido.id AND ir.estado='activa');
            RETURN;
        END IF;
        RAISE EXCEPTION 'sales_order_not_submittable' USING ERRCODE = 'P0001';
    END IF;
    IF p_forma_confirmacion='orden_compra'
       AND NULLIF(btrim(p_referencia_pedido_cliente),'') IS NULL
       AND NOT EXISTS(SELECT 1 FROM public.pedido_venta_documentos d WHERE d.organizacion_id=p_organizacion_id AND d.pedido_venta_id=v_pedido.id AND d.tipo_documento='orden_compra') THEN
        RAISE EXCEPTION 'order_purchase_order_evidence_required' USING ERRCODE = 'P0001';
    END IF;

    -- An OC permits an early physical-stock reservation only; it does not create
    -- a customer, sale, receivable, property hold, or warehouse release.
    IF p_forma_confirmacion='orden_compra' THEN
        SELECT count(*)::integer INTO v_stock_count FROM public.pedido_venta_items pvi
          JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id AND ci.id=pvi.catalog_item_id
         WHERE pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=v_pedido.id AND ci.maneja_inventario IS TRUE;
        IF v_stock_count > 0 THEN
            SELECT a.id INTO v_almacen_id FROM public.almacenes a
             WHERE a.organizacion_id=p_organizacion_id AND a.activo IS TRUE
             ORDER BY a.es_principal DESC,a.id LIMIT 1;
            IF v_almacen_id IS NULL THEN RAISE EXCEPTION 'inventory_warehouse_required' USING ERRCODE='P0001'; END IF;
            SELECT COALESCE(jsonb_agg(jsonb_build_object('quote_item_id',pvi.cotizacion_item_id,'catalog_item_id',pvi.catalog_item_id,'cantidad',pvi.cantidad) ORDER BY pvi.orden),'[]'::jsonb)
              INTO v_items FROM public.pedido_venta_items pvi
              JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id AND ci.id=pvi.catalog_item_id
             WHERE pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=v_pedido.id AND ci.maneja_inventario IS TRUE
               AND NOT EXISTS(SELECT 1 FROM public.inventario_reservas ir WHERE ir.organizacion_id=p_organizacion_id AND ir.quote_id=p_cotizacion_id AND ir.quote_item_id=pvi.cotizacion_item_id AND ir.estado='activa');
            IF jsonb_array_length(v_items)>0 THEN
                PERFORM public.crm_reservar_inventario_cotizacion(p_organizacion_id,p_cotizacion_id,v_almacen_id,v_items,p_usuario_id);
            END IF;
            UPDATE public.inventario_reservas ir SET pedido_venta_id=v_pedido.id,pedido_venta_item_id=pvi.id,
                motivo='Reserva anticipada por orden de compra validada'
              FROM public.pedido_venta_items pvi
             WHERE ir.organizacion_id=p_organizacion_id AND ir.quote_id=p_cotizacion_id AND ir.quote_item_id=pvi.cotizacion_item_id
               AND pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=v_pedido.id AND ir.estado='activa'
               AND pvi.catalog_item_id=ir.catalog_item_id;
        END IF;
    ELSE
        -- If Commercial invalidates/removes the OC basis after a return, release
        -- its unshipped anticipatory reservations before resubmission.
        IF EXISTS(SELECT 1 FROM public.inventario_reservas ir WHERE ir.organizacion_id=p_organizacion_id AND ir.pedido_venta_id=v_pedido.id AND ir.estado='activa') THEN
            PERFORM public.crm_liberar_inventario_cotizacion(p_organizacion_id,p_cotizacion_id,p_usuario_id);
        END IF;
    END IF;

    UPDATE public.pedidos_venta SET estado_formalizacion='pendiente',
        enviado_formalizacion_en=now(), enviado_formalizacion_por_usuario_id=p_usuario_id,
        devuelto_comercial_en=NULL,devuelto_comercial_por_usuario_id=NULL,motivo_devolucion_comercial=NULL,
        revision_cliente_validada=false,revision_evidencia_validada=false,revision_partidas_validada=false,
        revision_operativa_por_usuario_id=NULL,revision_operativa_en=NULL,
        forma_confirmacion=p_forma_confirmacion,fecha_confirmacion_cliente=p_fecha_confirmacion_cliente,
        referencia_pedido_cliente=NULLIF(btrim(p_referencia_pedido_cliente),''),fecha_orden_cliente=p_fecha_orden_cliente,
        observaciones_confirmacion=NULLIF(btrim(p_observaciones_confirmacion),''),actualizado_en=now()
     WHERE organizacion_id=p_organizacion_id AND id=v_pedido.id;
    IF p_forma_confirmacion='orden_compra' AND EXISTS(
        SELECT 1 FROM public.inventario_reservas ir
         WHERE ir.organizacion_id=p_organizacion_id AND ir.pedido_venta_id=v_pedido.id AND ir.estado='activa'
    ) THEN
        INSERT INTO public.pedido_venta_eventos(organizacion_id,pedido_venta_id,evento,actor_usuario_id,detalle)
        VALUES(p_organizacion_id,v_pedido.id,'reserva_inventario_oc',p_usuario_id,'Inventario físico reservado por OC validada; venta aún no formalizada.');
    END IF;
    RETURN QUERY SELECT v_pedido.id,'pendiente'::text,
        EXISTS(SELECT 1 FROM public.inventario_reservas ir WHERE ir.organizacion_id=p_organizacion_id AND ir.pedido_venta_id=v_pedido.id AND ir.estado='activa');
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_enviar_pedido_a_formalizacion(uuid,uuid,uuid,text,date,text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_enviar_pedido_a_formalizacion(uuid,uuid,uuid,text,date,text,date,text) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_aprobar_pedido_venta(
    p_organizacion_id uuid,p_pedido_venta_id uuid,p_usuario_id uuid,
    p_revision_cliente_validada boolean,p_revision_evidencia_validada boolean,p_revision_partidas_validada boolean,
    p_fecha_vencimiento date DEFAULT NULL
)
RETURNS TABLE (venta_id uuid,cliente_id uuid,cuenta_por_cobrar_id uuid,venta_estatus text,total numeric,pago_acumulado numeric,saldo numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $function$
DECLARE v_pedido public.pedidos_venta%ROWTYPE; v_result record;
BEGIN
    IF p_organizacion_id IS NULL OR p_pedido_venta_id IS NULL OR p_usuario_id IS NULL THEN RAISE EXCEPTION 'organization_order_and_user_required' USING ERRCODE='P0001'; END IF;
    IF NOT (COALESCE(p_revision_cliente_validada,false) AND COALESCE(p_revision_evidencia_validada,false) AND COALESCE(p_revision_partidas_validada,false)) THEN
        RAISE EXCEPTION 'operational_review_checklist_incomplete' USING ERRCODE='P0001';
    END IF;
    SELECT * INTO v_pedido FROM public.pedidos_venta WHERE organizacion_id=p_organizacion_id AND id=p_pedido_venta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE='P0001'; END IF;
    IF v_pedido.estatus<>'pendiente_confirmacion' OR v_pedido.estado_formalizacion<>'pendiente' THEN RAISE EXCEPTION 'sales_order_not_submitted_for_review' USING ERRCODE='P0001'; END IF;
    UPDATE public.pedidos_venta SET revision_cliente_validada=true,revision_evidencia_validada=true,revision_partidas_validada=true,
        revision_operativa_por_usuario_id=p_usuario_id,revision_operativa_en=now(),actualizado_en=now()
     WHERE organizacion_id=p_organizacion_id AND id=p_pedido_venta_id;
    SELECT * INTO v_result FROM public.crm_confirmar_pedido_venta_con_evidencia(
        p_organizacion_id,v_pedido.cotizacion_id,p_usuario_id,p_fecha_vencimiento,
        v_pedido.referencia_pedido_cliente,v_pedido.fecha_orden_cliente,v_pedido.forma_confirmacion,
        v_pedido.fecha_confirmacion_cliente,v_pedido.observaciones_confirmacion
    );
    INSERT INTO public.pedido_venta_eventos(organizacion_id,pedido_venta_id,evento,actor_usuario_id,detalle)
    VALUES(p_organizacion_id,p_pedido_venta_id,'pedido_liberado_surtido',p_usuario_id,'Pedido revisado; venta formalizada, cuenta por cobrar creada y liberado a surtido.');
    RETURN QUERY SELECT v_result.venta_id,v_result.cliente_id,v_result.cuenta_por_cobrar_id,v_result.venta_estatus,v_result.total,v_result.pago_acumulado,v_result.saldo;
END;
$function$;
REVOKE ALL ON FUNCTION public.crm_aprobar_pedido_venta(uuid,uuid,uuid,boolean,boolean,boolean,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_aprobar_pedido_venta(uuid,uuid,uuid,boolean,boolean,boolean,date) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
