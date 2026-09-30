-- La dirección de entrega pertenece a la empresa y se congela en el pedido.
-- No se agrega ningún requisito a cotizaciones: la validación ocurre al aprobar
-- pedidos físicos desde ventas/pedidos.

ALTER TABLE public.cuenta_direcciones
    DROP CONSTRAINT IF EXISTS cuenta_direcciones_tipo_chk;

ALTER TABLE public.cuenta_direcciones
    ADD CONSTRAINT cuenta_direcciones_tipo_chk
    CHECK (tipo_relacion IN ('fiscal', 'principal', 'sucursal', 'envio'));

ALTER TABLE public.pedidos_venta
    ADD COLUMN IF NOT EXISTS domicilio_entrega_direccion_id uuid,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_pais text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_entidad text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_municipio text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_localidad text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_tipo_vialidad text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_nombre_vialidad text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_numero_exterior text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_numero_interior text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_colonia text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_codigo_postal text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_referencias text,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_completo boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS domicilio_entrega_faltantes text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS pedidos_venta_entrega_completa_idx
    ON public.pedidos_venta (organizacion_id, domicilio_entrega_completo, estado_formalizacion);

CREATE OR REPLACE FUNCTION public.crm_snapshot_pedido_condiciones_comerciales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_direccion public.direcciones%ROWTYPE;
    v_notas text;
    v_faltantes text[];
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF ROW(NEW.condicion_pago, NEW.dias_credito, NEW.anticipo_porcentaje,
               NEW.permite_entrega_parcial, NEW.fecha_entrega_comprometida,
               NEW.domicilio_entrega, NEW.observaciones_comerciales)
           IS DISTINCT FROM
           ROW(OLD.condicion_pago, OLD.dias_credito, OLD.anticipo_porcentaje,
               OLD.permite_entrega_parcial, OLD.fecha_entrega_comprometida,
               OLD.domicilio_entrega, OLD.observaciones_comerciales) THEN
            RAISE EXCEPTION 'sales_order_commercial_conditions_immutable'
                USING ERRCODE = 'P0001';
        END IF;
        IF OLD.domicilio_entrega_direccion_id IS NOT NULL AND
           ROW(NEW.domicilio_entrega_direccion_id, NEW.domicilio_entrega_pais,
               NEW.domicilio_entrega_entidad, NEW.domicilio_entrega_municipio,
               NEW.domicilio_entrega_localidad, NEW.domicilio_entrega_tipo_vialidad,
               NEW.domicilio_entrega_nombre_vialidad, NEW.domicilio_entrega_numero_exterior,
               NEW.domicilio_entrega_numero_interior, NEW.domicilio_entrega_colonia,
               NEW.domicilio_entrega_codigo_postal, NEW.domicilio_entrega_referencias,
               NEW.domicilio_entrega_completo, NEW.domicilio_entrega_faltantes)
           IS DISTINCT FROM
           ROW(OLD.domicilio_entrega_direccion_id, OLD.domicilio_entrega_pais,
               OLD.domicilio_entrega_entidad, OLD.domicilio_entrega_municipio,
               OLD.domicilio_entrega_localidad, OLD.domicilio_entrega_tipo_vialidad,
               OLD.domicilio_entrega_nombre_vialidad, OLD.domicilio_entrega_numero_exterior,
               OLD.domicilio_entrega_numero_interior, OLD.domicilio_entrega_colonia,
               OLD.domicilio_entrega_codigo_postal, OLD.domicilio_entrega_referencias,
               OLD.domicilio_entrega_completo, OLD.domicilio_entrega_faltantes) THEN
            RAISE EXCEPTION 'sales_order_delivery_snapshot_immutable'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.domicilio_entrega_direccion_id IS NULL THEN
        SELECT d.*
          INTO v_direccion
          FROM public.cotizaciones q
          JOIN public.cuenta_direcciones cd
            ON cd.organizacion_id = q.organizacion_id
           AND cd.cuenta_id = q.cuenta_id
           AND cd.tipo_relacion = 'envio'
           AND cd.activo IS TRUE
          JOIN public.direcciones d
            ON d.organizacion_id = cd.organizacion_id
           AND d.id = cd.direccion_id
         WHERE q.organizacion_id = NEW.organizacion_id
           AND q.id = NEW.cotizacion_id
         ORDER BY cd.es_principal DESC, cd.actualizado_en DESC, cd.id
         LIMIT 1;

        SELECT cd.notas
          INTO v_notas
          FROM public.cuenta_direcciones cd
         WHERE cd.organizacion_id = NEW.organizacion_id
           AND cd.cuenta_id = (SELECT q.cuenta_id FROM public.cotizaciones q WHERE q.organizacion_id = NEW.organizacion_id AND q.id = NEW.cotizacion_id)
           AND cd.tipo_relacion = 'envio'
           AND cd.activo IS TRUE
         ORDER BY cd.es_principal DESC, cd.actualizado_en DESC, cd.id
         LIMIT 1;

        IF FOUND THEN
            v_faltantes := ARRAY_REMOVE(ARRAY[
                CASE WHEN NULLIF(btrim(v_direccion.pais), '') IS NULL THEN 'País' END,
                CASE WHEN NULLIF(btrim(v_direccion.entidad), '') IS NULL THEN 'Estado' END,
                CASE WHEN NULLIF(btrim(v_direccion.municipio), '') IS NULL THEN 'Municipio' END,
                CASE WHEN NULLIF(btrim(v_direccion.nombre_vialidad), '') IS NULL THEN 'Vialidad' END,
                CASE WHEN NULLIF(btrim(v_direccion.numero_exterior), '') IS NULL THEN 'Número exterior' END,
                CASE WHEN NULLIF(btrim(v_direccion.colonia), '') IS NULL THEN 'Colonia' END,
                CASE WHEN NULLIF(btrim(v_direccion.codigo_postal), '') IS NULL THEN 'Código postal' END
            ]::text[], NULL);
            NEW.domicilio_entrega_direccion_id := v_direccion.id;
            NEW.domicilio_entrega_pais := v_direccion.pais;
            NEW.domicilio_entrega_entidad := v_direccion.entidad;
            NEW.domicilio_entrega_municipio := v_direccion.municipio;
            NEW.domicilio_entrega_localidad := v_direccion.localidad;
            NEW.domicilio_entrega_tipo_vialidad := v_direccion.tipo_vialidad;
            NEW.domicilio_entrega_nombre_vialidad := v_direccion.nombre_vialidad;
            NEW.domicilio_entrega_numero_exterior := v_direccion.numero_exterior;
            NEW.domicilio_entrega_numero_interior := v_direccion.numero_interior;
            NEW.domicilio_entrega_colonia := v_direccion.colonia;
            NEW.domicilio_entrega_codigo_postal := v_direccion.codigo_postal;
            NEW.domicilio_entrega_referencias := v_notas;
            NEW.domicilio_entrega_faltantes := v_faltantes;
            NEW.domicilio_entrega_completo := cardinality(v_faltantes) = 0;
            NEW.domicilio_entrega := concat_ws(', ',
                NULLIF(v_direccion.nombre_vialidad, ''),
                NULLIF(v_direccion.numero_exterior, ''),
                NULLIF(v_direccion.colonia, ''),
                NULLIF(v_direccion.municipio, ''),
                NULLIF(v_direccion.entidad, ''),
                NULLIF(v_direccion.codigo_postal, ''));
        ELSIF TG_OP = 'INSERT' THEN
            NEW.domicilio_entrega_completo := false;
            NEW.domicilio_entrega_faltantes := ARRAY['Dirección de envío de la empresa'];
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pedidos_venta_snapshot_condiciones ON public.pedidos_venta;
CREATE TRIGGER trg_pedidos_venta_snapshot_condiciones
    BEFORE INSERT OR UPDATE ON public.pedidos_venta
    FOR EACH ROW EXECUTE FUNCTION public.crm_snapshot_pedido_condiciones_comerciales();

-- Los pedidos pendientes existentes reciben la dirección de envío actual de su empresa.
UPDATE public.pedidos_venta
   SET actualizado_en = actualizado_en
 WHERE domicilio_entrega_direccion_id IS NULL
   AND estado_formalizacion = 'pendiente';

CREATE OR REPLACE FUNCTION public.crm_aprobar_pedido_venta(p_organizacion_id uuid, p_pedido_venta_id uuid, p_usuario_id uuid, p_revision_cliente_validada boolean, p_revision_evidencia_validada boolean, p_revision_partidas_validada boolean, p_revision_inventario_validada boolean, p_revision_condiciones_validada boolean, p_revision_riesgos_validada boolean, p_fecha_vencimiento date DEFAULT NULL::date)
RETURNS TABLE(venta_id uuid, cliente_id uuid, cuenta_por_cobrar_id uuid, venta_estatus text, total numeric, pago_acumulado numeric, saldo numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
    v_result record;
    v_almacen_id uuid;
    v_items jsonb;
    v_tiene_faltante boolean;
    v_requiere_entrega boolean;
BEGIN
    IF p_organizacion_id IS NULL OR p_pedido_venta_id IS NULL OR p_usuario_id IS NULL THEN RAISE EXCEPTION 'organization_order_and_user_required' USING ERRCODE='P0001'; END IF;
    IF NOT (COALESCE(p_revision_cliente_validada,false) AND COALESCE(p_revision_evidencia_validada,false) AND COALESCE(p_revision_partidas_validada,false) AND COALESCE(p_revision_inventario_validada,false) AND COALESCE(p_revision_condiciones_validada,false) AND COALESCE(p_revision_riesgos_validada,false)) THEN RAISE EXCEPTION 'operational_review_checklist_incomplete' USING ERRCODE='P0001'; END IF;
    SELECT * INTO v_pedido FROM public.pedidos_venta WHERE organizacion_id=p_organizacion_id AND id=p_pedido_venta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found' USING ERRCODE='P0001'; END IF;
    IF v_pedido.estatus<>'pendiente_confirmacion' OR v_pedido.estado_formalizacion<>'pendiente' THEN RAISE EXCEPTION 'sales_order_not_submitted_for_review' USING ERRCODE='P0001'; END IF;
    SELECT EXISTS (SELECT 1 FROM public.pedido_venta_items pvi JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id AND ci.id=pvi.catalog_item_id AND ci.maneja_inventario WHERE pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=p_pedido_venta_id) INTO v_requiere_entrega;
    IF v_requiere_entrega AND NOT COALESCE(v_pedido.domicilio_entrega_completo,false) THEN RAISE EXCEPTION 'sales_order_delivery_data_incomplete' USING ERRCODE='P0001'; END IF;
    SELECT a.id INTO v_almacen_id FROM public.almacenes a WHERE a.organizacion_id=p_organizacion_id AND a.activo IS TRUE ORDER BY a.es_principal DESC,a.id LIMIT 1;
    IF v_requiere_entrega AND v_almacen_id IS NULL THEN RAISE EXCEPTION 'inventory_warehouse_required' USING ERRCODE='P0001'; END IF;
    IF v_almacen_id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('quote_item_id',pvi.cotizacion_item_id,'catalog_item_id',pvi.catalog_item_id,'cantidad',pvi.cantidad-COALESCE(r.reservada,0)) ORDER BY pvi.orden),'[]'::jsonb) INTO v_items
        FROM public.pedido_venta_items pvi JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id AND ci.id=pvi.catalog_item_id AND ci.maneja_inventario
        LEFT JOIN LATERAL (SELECT sum(ir.cantidad) AS reservada FROM public.inventario_reservas ir WHERE ir.organizacion_id=p_organizacion_id AND ir.quote_id=v_pedido.cotizacion_id AND ir.quote_item_id=pvi.cotizacion_item_id AND ir.estado='activa') r ON true
        WHERE pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=p_pedido_venta_id AND pvi.cantidad>COALESCE(r.reservada,0);
        IF jsonb_array_length(v_items)>0 THEN PERFORM public.crm_reservar_inventario_cotizacion(p_organizacion_id,v_pedido.cotizacion_id,v_almacen_id,v_items,p_usuario_id); END IF;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.pedido_venta_items pvi JOIN public.catalog_items ci ON ci.organizacion_id=pvi.organizacion_id AND ci.id=pvi.catalog_item_id AND ci.maneja_inventario LEFT JOIN LATERAL (SELECT sum(ir.cantidad) AS reservada FROM public.inventario_reservas ir WHERE ir.organizacion_id=p_organizacion_id AND ir.quote_id=v_pedido.cotizacion_id AND ir.quote_item_id=pvi.cotizacion_item_id AND ir.estado IN ('activa','consumida')) r ON true WHERE pvi.organizacion_id=p_organizacion_id AND pvi.pedido_venta_id=p_pedido_venta_id AND COALESCE(r.reservada,0)<pvi.cantidad) INTO v_tiene_faltante;
    IF v_tiene_faltante AND NOT v_pedido.permite_entrega_parcial THEN RAISE EXCEPTION 'inventory_shortfall_partial_delivery_not_allowed' USING ERRCODE='P0001'; END IF;
    UPDATE public.pedidos_venta SET revision_cliente_validada=true,revision_evidencia_validada=true,revision_partidas_validada=true,revision_inventario_validada=true,revision_condiciones_validada=true,revision_riesgos_validada=true,revision_operativa_por_usuario_id=p_usuario_id,revision_operativa_en=now(),actualizado_en=now() WHERE organizacion_id=p_organizacion_id AND id=p_pedido_venta_id;
    SELECT * INTO v_result FROM public.crm_confirmar_pedido_venta_con_evidencia(p_organizacion_id,v_pedido.cotizacion_id,p_usuario_id,p_fecha_vencimiento,v_pedido.referencia_pedido_cliente,v_pedido.fecha_orden_cliente,v_pedido.forma_confirmacion,v_pedido.fecha_confirmacion_cliente,v_pedido.observaciones_confirmacion);
    INSERT INTO public.pedido_venta_eventos(organizacion_id,pedido_venta_id,evento,actor_usuario_id,detalle) VALUES (p_organizacion_id,p_pedido_venta_id,'pedido_liberado_surtido',p_usuario_id,CASE WHEN v_tiene_faltante THEN 'Pedido revisado en seis bloques y liberado con reserva parcial; el faltante queda pendiente de inventario.' ELSE 'Pedido revisado en seis bloques; venta formalizada, cuenta por cobrar creada y liberado a surtido.' END);
    RETURN QUERY SELECT v_result.venta_id,v_result.cliente_id,v_result.cuenta_por_cobrar_id,v_result.venta_estatus,v_result.total,v_result.pago_acumulado,v_result.saldo;
END;
$function$;
