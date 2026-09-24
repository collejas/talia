BEGIN;

ALTER TABLE public.inventario_reservas
    ADD COLUMN cantidad_surtida numeric(14,3) NOT NULL DEFAULT 0,
    DROP CONSTRAINT inventario_reservas_estado_check,
    ADD CONSTRAINT inventario_reservas_estado_check
        CHECK (estado IN ('activa', 'liberada', 'consumida')),
    ADD CONSTRAINT inventario_reservas_cantidad_surtida_check
        CHECK (cantidad_surtida >= 0 AND cantidad_surtida <= cantidad);
CREATE UNIQUE INDEX inventario_reservas_org_id_uidx
    ON public.inventario_reservas (organizacion_id, id);
CREATE UNIQUE INDEX almacenes_org_id_uidx
    ON public.almacenes (organizacion_id, id);

ALTER TABLE public.pedidos_venta
    ADD COLUMN estatus_logistico text NOT NULL DEFAULT 'no_aplica',
    ADD CONSTRAINT pedidos_venta_estatus_logistico_check
        CHECK (estatus_logistico IN ('no_aplica', 'pendiente', 'parcial', 'entregado'));

CREATE TABLE public.pedido_venta_entregas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    pedido_venta_id uuid NOT NULL,
    fecha_entrega date NOT NULL DEFAULT CURRENT_DATE,
    referencia text,
    observaciones text,
    creado_por_usuario_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedido_venta_entregas_org_id_key UNIQUE (organizacion_id, id),
    CONSTRAINT pedido_venta_entregas_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT pedido_venta_entregas_pedido_org_fkey FOREIGN KEY (organizacion_id, pedido_venta_id)
        REFERENCES public.pedidos_venta(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_entregas_usuario_fkey FOREIGN KEY (creado_por_usuario_id)
        REFERENCES public.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX pedido_venta_entregas_org_pedido_fecha_idx
    ON public.pedido_venta_entregas (organizacion_id, pedido_venta_id, fecha_entrega DESC);

CREATE TABLE public.pedido_venta_entrega_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    entrega_id uuid NOT NULL,
    pedido_venta_id uuid NOT NULL,
    pedido_venta_item_id uuid NOT NULL,
    reserva_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    almacen_id uuid NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedido_venta_entrega_items_org_id_key UNIQUE (organizacion_id, id),
    CONSTRAINT pedido_venta_entrega_items_cantidad_check CHECK (cantidad > 0),
    CONSTRAINT pedido_venta_entrega_items_entrega_org_fkey FOREIGN KEY (organizacion_id, entrega_id)
        REFERENCES public.pedido_venta_entregas(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_entrega_items_pedido_org_fkey FOREIGN KEY (organizacion_id, pedido_venta_id)
        REFERENCES public.pedidos_venta(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_entrega_items_pedido_item_org_fkey FOREIGN KEY (organizacion_id, pedido_venta_item_id)
        REFERENCES public.pedido_venta_items(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_entrega_items_reserva_org_fkey FOREIGN KEY (organizacion_id, reserva_id)
        REFERENCES public.inventario_reservas(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_entrega_items_catalog_org_fkey FOREIGN KEY (organizacion_id, catalog_item_id)
        REFERENCES public.catalog_items(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_entrega_items_almacen_org_fkey FOREIGN KEY (organizacion_id, almacen_id)
        REFERENCES public.almacenes(organizacion_id, id) ON DELETE RESTRICT
);
CREATE INDEX pedido_venta_entrega_items_org_order_item_idx
    ON public.pedido_venta_entrega_items (organizacion_id, pedido_venta_item_id);

ALTER TABLE public.inventario_movimientos
    ADD COLUMN pedido_venta_entrega_item_id uuid,
    ADD CONSTRAINT inventario_movimientos_entrega_item_org_fkey
        FOREIGN KEY (organizacion_id, pedido_venta_entrega_item_id)
        REFERENCES public.pedido_venta_entrega_items(organizacion_id, id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX inventario_movimientos_entrega_item_uidx
    ON public.inventario_movimientos (organizacion_id, pedido_venta_entrega_item_id)
    WHERE pedido_venta_entrega_item_id IS NOT NULL;

ALTER TABLE public.pedido_venta_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_venta_entrega_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedido_venta_entregas, public.pedido_venta_entrega_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_venta_entregas, public.pedido_venta_entrega_items TO service_role;
CREATE POLICY pedido_venta_entregas_service_role_all ON public.pedido_venta_entregas
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY pedido_venta_entrega_items_service_role_all ON public.pedido_venta_entrega_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);

UPDATE public.pedidos_venta pv
   SET estatus_logistico = CASE WHEN EXISTS (
       SELECT 1 FROM public.pedido_venta_items pvi
       JOIN public.catalog_items ci ON ci.organizacion_id = pvi.organizacion_id
                                  AND ci.id = pvi.catalog_item_id AND ci.maneja_inventario
       WHERE pvi.organizacion_id = pv.organizacion_id AND pvi.pedido_venta_id = pv.id
   ) THEN 'pendiente' ELSE 'no_aplica' END
 WHERE pv.estatus = 'confirmado';

CREATE OR REPLACE FUNCTION public.crm_pedido_venta_set_logistics_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $function$
BEGIN
    IF NEW.estatus = 'confirmado' AND (TG_OP = 'INSERT' OR OLD.estatus IS DISTINCT FROM NEW.estatus) THEN
        NEW.estatus_logistico := CASE WHEN EXISTS (
            SELECT 1 FROM public.pedido_venta_items pvi
            JOIN public.catalog_items ci ON ci.organizacion_id = pvi.organizacion_id
                                       AND ci.id = pvi.catalog_item_id AND ci.maneja_inventario
            WHERE pvi.organizacion_id = NEW.organizacion_id AND pvi.pedido_venta_id = NEW.id
        ) THEN 'pendiente' ELSE 'no_aplica' END;
    END IF;
    RETURN NEW;
END;
$function$;
CREATE TRIGGER pedidos_venta_logistics_status_trg
    BEFORE INSERT OR UPDATE OF estatus ON public.pedidos_venta
    FOR EACH ROW EXECUTE FUNCTION public.crm_pedido_venta_set_logistics_status();

CREATE OR REPLACE FUNCTION public.crm_liberar_inventario_cotizacion(
    p_organizacion_id uuid,
    p_quote_id uuid,
    p_liberado_por uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_reserva record;
    v_cantidad numeric(14,3);
    v_costo numeric(14,4);
BEGIN
    IF p_organizacion_id IS NULL OR p_quote_id IS NULL THEN
        RAISE EXCEPTION 'organization_and_quote_required' USING ERRCODE = 'P0001';
    END IF;
    FOR v_reserva IN
        SELECT ir.* FROM public.inventario_reservas ir
         WHERE ir.organizacion_id = p_organizacion_id AND ir.quote_id = p_quote_id AND ir.estado = 'activa'
         FOR UPDATE
    LOOP
        v_cantidad := v_reserva.cantidad - v_reserva.cantidad_surtida;
        IF v_cantidad > 0 THEN
            SELECT COALESCE(ie.costo_promedio, ie.costo_ultimo, ci.costo_promedio, ci.costo_ultimo, 0)
              INTO v_costo FROM public.inventario_existencias ie
              JOIN public.catalog_items ci ON ci.organizacion_id = ie.organizacion_id AND ci.id = ie.catalog_item_id
             WHERE ie.organizacion_id = p_organizacion_id AND ie.catalog_item_id = v_reserva.catalog_item_id
               AND ie.almacen_id = v_reserva.almacen_id FOR UPDATE OF ie;
            IF NOT FOUND OR (SELECT stock_reservado FROM public.inventario_existencias
                              WHERE organizacion_id = p_organizacion_id AND catalog_item_id = v_reserva.catalog_item_id
                                AND almacen_id = v_reserva.almacen_id) < v_cantidad THEN
                RAISE EXCEPTION 'inventory_reservation_balance_inconsistent' USING ERRCODE = 'P0001';
            END IF;
            UPDATE public.inventario_existencias SET stock_reservado = stock_reservado - v_cantidad, actualizado_en = now()
             WHERE organizacion_id = p_organizacion_id AND catalog_item_id = v_reserva.catalog_item_id
               AND almacen_id = v_reserva.almacen_id;
            INSERT INTO public.inventario_movimientos (organizacion_id, catalog_item_id, almacen_id, tipo,
                cantidad_entrada, costo_unitario, costo_total, referencia_tipo, referencia_id, motivo, creado_por)
            VALUES (p_organizacion_id, v_reserva.catalog_item_id, v_reserva.almacen_id, 'liberacion_reserva',
                v_cantidad, v_costo, round(v_cantidad * v_costo, 4), 'cotizacion', p_quote_id,
                'Liberacion del remanente de reserva', p_liberado_por);
        END IF;
        UPDATE public.inventario_reservas SET estado = 'liberada', liberado_por = p_liberado_por, liberado_en = now()
         WHERE id = v_reserva.id;
    END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.crm_liberar_inventario_cotizacion(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_liberar_inventario_cotizacion(uuid, uuid, uuid) TO service_role;

COMMENT ON TABLE public.pedido_venta_entregas IS 'Registro de entregas parciales o totales de pedidos confirmados.';
COMMENT ON TABLE public.pedido_venta_entrega_items IS 'Renglones surtidos con su reserva, almacén y movimiento de inventario trazables.';
COMMENT ON COLUMN public.inventario_reservas.cantidad_surtida IS 'Cantidad de la reserva original que ya salió físicamente.';

CREATE OR REPLACE FUNCTION public.crm_registrar_entrega_pedido_venta(
    p_organizacion_id uuid,
    p_pedido_venta_id uuid,
    p_items jsonb,
    p_fecha_entrega date DEFAULT CURRENT_DATE,
    p_referencia text DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (entrega_id uuid, pedido_estatus_logistico text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido public.pedidos_venta%ROWTYPE;
    v_input record;
    v_reserva record;
    v_catalog public.catalog_items%ROWTYPE;
    v_existencia public.inventario_existencias%ROWTYPE;
    v_entrega_id uuid;
    v_item_id uuid;
    v_restante numeric(14,3);
    v_disponible numeric(14,3);
    v_cantidad numeric(14,3);
    v_costo numeric(14,4);
    v_tiene_control boolean;
    v_entregado boolean;
    v_pendiente boolean;
BEGIN
    IF p_organizacion_id IS NULL OR p_pedido_venta_id IS NULL
       OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'delivery_items_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_pedido FROM public.pedidos_venta
     WHERE organizacion_id = p_organizacion_id AND id = p_pedido_venta_id FOR UPDATE;
    IF NOT FOUND OR v_pedido.estatus <> 'confirmado' THEN
        RAISE EXCEPTION 'confirmed_order_required' USING ERRCODE = 'P0001';
    END IF;

    -- Validate the complete request before writing any delivery rows.
    FOR v_input IN SELECT x.item_id, x.cantidad FROM jsonb_to_recordset(p_items) AS x(item_id uuid, cantidad numeric)
    LOOP
        IF v_input.item_id IS NULL OR v_input.cantidad IS NULL OR v_input.cantidad <= 0 THEN
            RAISE EXCEPTION 'invalid_delivery_item' USING ERRCODE = 'P0001';
        END IF;
        IF (SELECT count(*) FROM jsonb_to_recordset(p_items) AS x(item_id uuid, cantidad numeric) WHERE x.item_id = v_input.item_id) > 1 THEN
            RAISE EXCEPTION 'duplicate_delivery_item' USING ERRCODE = 'P0001';
        END IF;
        SELECT pvi.id INTO v_item_id FROM public.pedido_venta_items pvi
         WHERE pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = p_pedido_venta_id
           AND pvi.id = v_input.item_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'order_item_not_found' USING ERRCODE = 'P0001'; END IF;
        SELECT EXISTS (SELECT 1 FROM public.catalog_items ci
                        WHERE ci.organizacion_id = p_organizacion_id AND ci.id = (
                            SELECT pvi.catalog_item_id FROM public.pedido_venta_items pvi WHERE pvi.id = v_input.item_id
                        ) AND ci.maneja_inventario) INTO v_tiene_control;
        IF NOT v_tiene_control THEN RAISE EXCEPTION 'inventory_item_required' USING ERRCODE = 'P0001'; END IF;
        SELECT COALESCE(sum(ir.cantidad - ir.cantidad_surtida), 0)
          INTO v_disponible FROM public.inventario_reservas ir
         WHERE ir.organizacion_id = p_organizacion_id AND ir.pedido_venta_item_id = v_input.item_id AND ir.estado = 'activa';
        SELECT pvi.cantidad - COALESCE(sum(ei.cantidad), 0)
          INTO v_restante FROM public.pedido_venta_items pvi
          LEFT JOIN public.pedido_venta_entrega_items ei
            ON ei.organizacion_id = pvi.organizacion_id AND ei.pedido_venta_item_id = pvi.id
         WHERE pvi.organizacion_id = p_organizacion_id AND pvi.id = v_input.item_id
         GROUP BY pvi.cantidad;
        IF v_input.cantidad > v_disponible OR v_input.cantidad > v_restante THEN
            RAISE EXCEPTION 'delivery_exceeds_reserved_or_ordered_quantity' USING ERRCODE = 'P0001';
        END IF;
    END LOOP;

    INSERT INTO public.pedido_venta_entregas (organizacion_id, pedido_venta_id, fecha_entrega, referencia, observaciones, creado_por_usuario_id)
    VALUES (p_organizacion_id, p_pedido_venta_id, COALESCE(p_fecha_entrega, CURRENT_DATE), NULLIF(btrim(p_referencia), ''), NULLIF(btrim(p_observaciones), ''), p_usuario_id)
    RETURNING id INTO v_entrega_id;

    FOR v_input IN SELECT x.item_id, x.cantidad FROM jsonb_to_recordset(p_items) AS x(item_id uuid, cantidad numeric)
    LOOP
        v_restante := v_input.cantidad;
        FOR v_reserva IN
            SELECT ir.* FROM public.inventario_reservas ir
             WHERE ir.organizacion_id = p_organizacion_id AND ir.pedido_venta_item_id = v_input.item_id AND ir.estado = 'activa'
             ORDER BY ir.creado_en, ir.id FOR UPDATE
        LOOP
            EXIT WHEN v_restante <= 0;
            v_cantidad := LEAST(v_restante, v_reserva.cantidad - v_reserva.cantidad_surtida);
            CONTINUE WHEN v_cantidad <= 0;
            SELECT * INTO v_existencia FROM public.inventario_existencias ie
             WHERE ie.organizacion_id = p_organizacion_id AND ie.catalog_item_id = v_reserva.catalog_item_id AND ie.almacen_id = v_reserva.almacen_id
             FOR UPDATE;
            IF NOT FOUND OR v_existencia.stock_actual < v_cantidad OR v_existencia.stock_reservado < v_cantidad THEN
                RAISE EXCEPTION 'inventory_balance_inconsistent' USING ERRCODE = 'P0001';
            END IF;
            UPDATE public.inventario_existencias SET stock_actual = stock_actual - v_cantidad,
                stock_reservado = stock_reservado - v_cantidad, actualizado_en = now() WHERE id = v_existencia.id;
            UPDATE public.inventario_reservas SET cantidad_surtida = cantidad_surtida + v_cantidad,
                estado = CASE WHEN cantidad_surtida + v_cantidad = cantidad THEN 'consumida' ELSE 'activa' END,
                liberado_por = CASE WHEN cantidad_surtida + v_cantidad = cantidad THEN p_usuario_id ELSE liberado_por END,
                liberado_en = CASE WHEN cantidad_surtida + v_cantidad = cantidad THEN now() ELSE liberado_en END
             WHERE id = v_reserva.id;
            INSERT INTO public.pedido_venta_entrega_items (organizacion_id, entrega_id, pedido_venta_id, pedido_venta_item_id, reserva_id, catalog_item_id, almacen_id, cantidad)
            VALUES (p_organizacion_id, v_entrega_id, p_pedido_venta_id, v_input.item_id, v_reserva.id, v_reserva.catalog_item_id, v_reserva.almacen_id, v_cantidad)
            RETURNING id INTO v_item_id;
            v_costo := COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, 0);
            INSERT INTO public.inventario_movimientos (organizacion_id, catalog_item_id, almacen_id, tipo, cantidad_salida, costo_unitario, costo_total, referencia_tipo, referencia_id, motivo, creado_por, pedido_venta_entrega_item_id)
            VALUES (p_organizacion_id, v_reserva.catalog_item_id, v_reserva.almacen_id, 'salida_venta', v_cantidad, v_costo, round(v_cantidad * v_costo, 4), 'pedido_venta_entrega', v_entrega_id, 'Salida por entrega de pedido confirmado', p_usuario_id, v_item_id);
            v_restante := v_restante - v_cantidad;
        END LOOP;
        IF v_restante > 0 THEN RAISE EXCEPTION 'delivery_reservation_shortfall' USING ERRCODE = 'P0001'; END IF;
    END LOOP;

    SELECT EXISTS (
        SELECT 1 FROM public.pedido_venta_items pvi JOIN public.catalog_items ci
          ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id AND ci.maneja_inventario
         WHERE pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = p_pedido_venta_id
    ) INTO v_tiene_control;
    SELECT EXISTS (
        SELECT 1 FROM public.pedido_venta_items pvi JOIN public.catalog_items ci
          ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id AND ci.maneja_inventario
         LEFT JOIN (SELECT ei.pedido_venta_item_id, sum(ei.cantidad) cantidad FROM public.pedido_venta_entrega_items ei WHERE ei.organizacion_id = p_organizacion_id GROUP BY ei.pedido_venta_item_id) d
           ON d.pedido_venta_item_id = pvi.id
         WHERE pvi.organizacion_id = p_organizacion_id AND pvi.pedido_venta_id = p_pedido_venta_id
           AND COALESCE(d.cantidad,0) < pvi.cantidad
    ) INTO v_pendiente;
    SELECT CASE WHEN NOT v_tiene_control THEN 'no_aplica' WHEN v_pendiente THEN 'parcial' ELSE 'entregado' END
      INTO pedido_estatus_logistico;
    UPDATE public.pedidos_venta SET estatus_logistico = pedido_estatus_logistico, actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = p_pedido_venta_id;
    RETURN QUERY SELECT v_entrega_id, pedido_estatus_logistico;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_registrar_entrega_pedido_venta(uuid, uuid, jsonb, date, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_registrar_entrega_pedido_venta(uuid, uuid, jsonb, date, text, text, uuid)
    TO service_role;

COMMIT;
