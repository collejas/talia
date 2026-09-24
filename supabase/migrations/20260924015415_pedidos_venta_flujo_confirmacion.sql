BEGIN;

-- Preserve the commercial catalog identity on CRM quote lines. Older quotes
-- stored it in metadata; copy only valid, tenant-matching references.
ALTER TABLE public.cotizacion_items
    ADD COLUMN catalog_item_id uuid;

UPDATE public.cotizacion_items AS qi
   SET catalog_item_id = ci.id
  FROM public.catalog_items AS ci
 WHERE qi.catalog_item_id IS NULL
   AND qi.organizacion_id = ci.organizacion_id
   AND qi.metadata->>'catalog_item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND ci.id::text = qi.metadata->>'catalog_item_id';

ALTER TABLE public.cotizacion_items
    ADD CONSTRAINT cotizacion_items_catalog_item_org_fkey
        FOREIGN KEY (organizacion_id, catalog_item_id)
        REFERENCES public.catalog_items (organizacion_id, id) ON DELETE RESTRICT;
CREATE INDEX cotizacion_items_org_catalog_item_idx
    ON public.cotizacion_items (organizacion_id, catalog_item_id)
    WHERE catalog_item_id IS NOT NULL;
CREATE UNIQUE INDEX cotizacion_items_org_id_uidx
    ON public.cotizacion_items (organizacion_id, id);

CREATE TABLE public.pedidos_venta (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    cotizacion_id uuid NOT NULL,
    estatus text NOT NULL DEFAULT 'pendiente_confirmacion',
    referencia_pedido_cliente text,
    fecha_orden_cliente date,
    confirmado_en timestamptz,
    confirmado_por_usuario_id uuid,
    cancelado_en timestamptz,
    cancelado_por_usuario_id uuid,
    motivo_cancelacion text,
    creado_por_usuario_id uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedidos_venta_org_id_key UNIQUE (organizacion_id, id),
    CONSTRAINT pedidos_venta_cotizacion_uidx UNIQUE (organizacion_id, cotizacion_id),
    CONSTRAINT pedidos_venta_estatus_check CHECK (estatus IN (
        'borrador', 'pendiente_confirmacion', 'confirmado', 'cancelado'
    )),
    CONSTRAINT pedidos_venta_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT pedidos_venta_cotizacion_org_fkey FOREIGN KEY (organizacion_id, cotizacion_id)
        REFERENCES public.cotizaciones (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedidos_venta_confirmado_usuario_fkey FOREIGN KEY (confirmado_por_usuario_id)
        REFERENCES public.usuarios (id) ON DELETE SET NULL,
    CONSTRAINT pedidos_venta_cancelado_usuario_fkey FOREIGN KEY (cancelado_por_usuario_id)
        REFERENCES public.usuarios (id) ON DELETE SET NULL,
    CONSTRAINT pedidos_venta_creado_usuario_fkey FOREIGN KEY (creado_por_usuario_id)
        REFERENCES public.usuarios (id) ON DELETE SET NULL
);

CREATE INDEX pedidos_venta_org_estatus_fecha_idx
    ON public.pedidos_venta (organizacion_id, estatus, creado_en DESC);

CREATE TABLE public.pedido_venta_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    pedido_venta_id uuid NOT NULL,
    cotizacion_item_id uuid NOT NULL,
    catalog_item_id uuid,
    propiedad_id uuid,
    unidad_id uuid,
    descripcion text NOT NULL,
    unidad text,
    cantidad numeric(14,3) NOT NULL,
    precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
    precio_unitario_final numeric(14,4) NOT NULL DEFAULT 0,
    descuento_monto numeric(14,2) NOT NULL DEFAULT 0,
    impuestos numeric(14,2) NOT NULL DEFAULT 0,
    subtotal numeric(14,2) NOT NULL DEFAULT 0,
    moneda char(3) NOT NULL,
    orden integer NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedido_venta_items_org_id_key UNIQUE (organizacion_id, id),
    CONSTRAINT pedido_venta_items_order_position_uidx UNIQUE (organizacion_id, pedido_venta_id, orden),
    CONSTRAINT pedido_venta_items_order_source_uidx UNIQUE (organizacion_id, pedido_venta_id, cotizacion_item_id),
    CONSTRAINT pedido_venta_items_cantidad_check CHECK (cantidad > 0),
    CONSTRAINT pedido_venta_items_importes_check CHECK (
        precio_unitario >= 0 AND precio_unitario_final >= 0 AND descuento_monto >= 0
        AND impuestos >= 0 AND subtotal >= 0
    ),
    CONSTRAINT pedido_venta_items_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT pedido_venta_items_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT pedido_venta_items_pedido_org_fkey FOREIGN KEY (organizacion_id, pedido_venta_id)
        REFERENCES public.pedidos_venta (organizacion_id, id) ON DELETE CASCADE,
    CONSTRAINT pedido_venta_items_cotizacion_item_org_fkey FOREIGN KEY (organizacion_id, cotizacion_item_id)
        REFERENCES public.cotizacion_items (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_items_catalog_item_org_fkey FOREIGN KEY (organizacion_id, catalog_item_id)
        REFERENCES public.catalog_items (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_items_propiedad_fkey FOREIGN KEY (propiedad_id)
        REFERENCES public.propiedad_desarrollos (id) ON DELETE RESTRICT,
    CONSTRAINT pedido_venta_items_unidad_fkey FOREIGN KEY (unidad_id)
        REFERENCES public.propiedad_unidades (id) ON DELETE RESTRICT
);

CREATE INDEX pedido_venta_items_org_catalog_idx
    ON public.pedido_venta_items (organizacion_id, catalog_item_id)
    WHERE catalog_item_id IS NOT NULL;
CREATE INDEX pedido_venta_items_org_unidad_idx
    ON public.pedido_venta_items (organizacion_id, unidad_id)
    WHERE unidad_id IS NOT NULL;

ALTER TABLE public.ventas
    ADD COLUMN pedido_venta_id uuid;
ALTER TABLE public.ventas
    ADD CONSTRAINT ventas_pedido_venta_uidx UNIQUE (organizacion_id, pedido_venta_id),
    ADD CONSTRAINT ventas_pedido_venta_org_fkey FOREIGN KEY (organizacion_id, pedido_venta_id)
        REFERENCES public.pedidos_venta (organizacion_id, id) ON DELETE RESTRICT;

ALTER TABLE public.venta_items
    ADD COLUMN pedido_venta_item_id uuid;
ALTER TABLE public.venta_items
    ADD CONSTRAINT venta_items_pedido_item_org_fkey
        FOREIGN KEY (organizacion_id, pedido_venta_item_id)
        REFERENCES public.pedido_venta_items (organizacion_id, id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX venta_items_pedido_item_uidx
    ON public.venta_items (organizacion_id, pedido_venta_item_id)
    WHERE pedido_venta_item_id IS NOT NULL;

ALTER TABLE public.inventario_reservas
    ADD COLUMN pedido_venta_id uuid,
    ADD COLUMN pedido_venta_item_id uuid;
ALTER TABLE public.inventario_reservas
    ADD CONSTRAINT inventario_reservas_pedido_org_fkey
        FOREIGN KEY (organizacion_id, pedido_venta_id)
        REFERENCES public.pedidos_venta (organizacion_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT inventario_reservas_pedido_item_org_fkey
        FOREIGN KEY (organizacion_id, pedido_venta_item_id)
        REFERENCES public.pedido_venta_items (organizacion_id, id) ON DELETE RESTRICT;
CREATE INDEX inventario_reservas_org_pedido_estado_idx
    ON public.inventario_reservas (organizacion_id, pedido_venta_id, estado)
    WHERE pedido_venta_id IS NOT NULL;

ALTER TABLE public.pedidos_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_venta_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedidos_venta, public.pedido_venta_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos_venta, public.pedido_venta_items TO service_role;
CREATE POLICY pedidos_venta_service_role_all ON public.pedidos_venta
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY pedido_venta_items_service_role_all ON public.pedido_venta_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.pedidos_venta IS
    'Compromiso comercial del cliente; confirmar crea venta/cuenta por cobrar y activa la reserva logística.';
COMMENT ON TABLE public.pedido_venta_items IS
    'Snapshot explícito de los renglones de cotización incluidos en el pedido del cliente.';
COMMENT ON COLUMN public.ventas.pedido_venta_id IS
    'Pedido confirmado que originó la venta; relación 1:1 en el alcance inicial.';

CREATE OR REPLACE FUNCTION public.crm_crear_pedido_venta(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (pedido_venta_id uuid, pedido_estatus text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_quote record;
    v_pedido_id uuid;
BEGIN
    SELECT q.id, q.estatus, o.estado AS oportunidad_estado
      INTO v_quote
      FROM public.cotizaciones AS q
      JOIN public.oportunidades AS o
        ON o.organizacion_id = q.organizacion_id AND o.id = q.oportunidad_id
     WHERE q.organizacion_id = p_organizacion_id AND q.id = p_cotizacion_id
     FOR UPDATE OF q, o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF lower(v_quote.estatus) <> 'aceptada' OR v_quote.oportunidad_estado <> 'ganada' THEN
        RAISE EXCEPTION 'accepted_won_quote_required' USING ERRCODE = 'P0001';
    END IF;

    SELECT pv.id INTO v_pedido_id
      FROM public.pedidos_venta AS pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
     FOR UPDATE;
    IF v_pedido_id IS NOT NULL THEN
        RETURN QUERY SELECT pv.id, pv.estatus FROM public.pedidos_venta AS pv
         WHERE pv.organizacion_id = p_organizacion_id AND pv.id = v_pedido_id;
        RETURN;
    END IF;

    INSERT INTO public.pedidos_venta (
        organizacion_id, cotizacion_id, estatus, creado_por_usuario_id
    ) VALUES (
        p_organizacion_id, p_cotizacion_id, 'pendiente_confirmacion', p_usuario_id
    ) RETURNING id INTO v_pedido_id;

    INSERT INTO public.pedido_venta_items (
        organizacion_id, pedido_venta_id, cotizacion_item_id, catalog_item_id,
        propiedad_id, unidad_id, descripcion, unidad, cantidad, precio_unitario,
        precio_unitario_final, descuento_monto, impuestos, subtotal, moneda, orden
    )
    SELECT p_organizacion_id, v_pedido_id, qi.id, qi.catalog_item_id,
           COALESCE(ci.propiedad_id, CASE
               WHEN qi.metadata->>'propiedad_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN (qi.metadata->>'propiedad_id')::uuid END),
           COALESCE(ci.unidad_id, CASE
               WHEN qi.metadata->>'unidad_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN (qi.metadata->>'unidad_id')::uuid END),
           qi.descripcion,
           COALESCE(NULLIF(qi.metadata->>'unidad', ''), ci.unidad),
           qi.cantidad, COALESCE(qi.precio_lista_unitario, qi.precio_unitario, 0),
           COALESCE(qi.precio_unitario_final, qi.precio_unitario, 0),
           COALESCE(qi.descuento_monto_aplicado,
               round(COALESCE(qi.precio_unitario, 0) * qi.cantidad
                     * COALESCE(qi.descuento_porcentaje, 0) / 100, 2)),
           CASE WHEN qi.metadata->>'impuestos' ~ '^[0-9]+([.][0-9]+)?$'
                THEN (qi.metadata->>'impuestos')::numeric ELSE 0 END,
           COALESCE(qi.subtotal, 0),
           COALESCE(qi.moneda_aplicada, 'MXN'),
           qi.orden
      FROM public.cotizacion_items AS qi
      LEFT JOIN public.catalog_items AS ci
        ON ci.organizacion_id = qi.organizacion_id AND ci.id = qi.catalog_item_id
     WHERE qi.organizacion_id = p_organizacion_id AND qi.cotizacion_id = p_cotizacion_id;

    RETURN QUERY SELECT pv.id, pv.estatus FROM public.pedidos_venta AS pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.id = v_pedido_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_crear_pedido_venta(uuid, uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_crear_pedido_venta(uuid, uuid, uuid)
    TO service_role;

CREATE OR REPLACE FUNCTION public.crm_cancelar_pedido_venta(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid DEFAULT NULL,
    p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_pedido_id uuid;
    v_estatus text;
BEGIN
    SELECT pv.id, pv.estatus INTO v_pedido_id, v_estatus
      FROM public.pedidos_venta AS pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
     FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM public.crm_liberar_inventario_cotizacion(
            p_organizacion_id, p_cotizacion_id, p_usuario_id
        );
        RETURN;
    END IF;
    IF v_estatus = 'confirmado' THEN
        RAISE EXCEPTION 'confirmed_sales_order_cannot_be_cancelled_from_quote' USING ERRCODE = 'P0001';
    END IF;
    IF v_estatus = 'cancelado' THEN
        RETURN;
    END IF;
    PERFORM public.crm_liberar_inventario_cotizacion(
        p_organizacion_id, p_cotizacion_id, p_usuario_id
    );
    UPDATE public.pedidos_venta
       SET estatus = 'cancelado', cancelado_en = now(),
           cancelado_por_usuario_id = p_usuario_id,
           motivo_cancelacion = NULLIF(btrim(p_motivo), ''),
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_pedido_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_cancelar_pedido_venta(uuid, uuid, uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_cancelar_pedido_venta(uuid, uuid, uuid, text)
    TO service_role;

CREATE OR REPLACE FUNCTION public.crm_confirmar_pedido_venta(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_usuario_id uuid DEFAULT NULL,
    p_fecha_vencimiento date DEFAULT NULL,
    p_referencia_pedido_cliente text DEFAULT NULL,
    p_fecha_orden_cliente date DEFAULT NULL
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
    v_pedido_status text;
    v_sale record;
    v_sale_id uuid;
    v_warehouse_id uuid;
    v_items jsonb;
    v_stock_item_count integer;
    v_unit record;
    v_unit_status public.propiedad_status;
    v_other_confirmed_order uuid;
BEGIN
    PERFORM public.crm_crear_pedido_venta(p_organizacion_id, p_cotizacion_id, p_usuario_id);
    SELECT pv.id, pv.estatus INTO v_pedido_id, v_pedido_status
      FROM public.pedidos_venta AS pv
     WHERE pv.organizacion_id = p_organizacion_id AND pv.cotizacion_id = p_cotizacion_id
     FOR UPDATE;
    IF v_pedido_status = 'cancelado' THEN
        RAISE EXCEPTION 'sales_order_cancelled' USING ERRCODE = 'P0001';
    END IF;

    IF v_pedido_status = 'confirmado' THEN
        RETURN QUERY
        SELECT v.id, v.cliente_id, c.id, v.estatus, v.total,
               COALESCE((SELECT sum(p.monto) FROM public.pagos AS p
                          WHERE p.organizacion_id = p_organizacion_id AND p.venta_id = v.id
                            AND p.estatus = 'confirmado'), 0), c.saldo
          FROM public.ventas AS v
          JOIN public.cuentas_por_cobrar AS c
            ON c.organizacion_id = v.organizacion_id AND c.venta_id = v.id
         WHERE v.organizacion_id = p_organizacion_id AND v.pedido_venta_id = v_pedido_id;
        RETURN;
    END IF;
    IF v_pedido_status NOT IN ('borrador', 'pendiente_confirmacion') THEN
        RAISE EXCEPTION 'sales_order_not_confirmable' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*)::integer INTO v_stock_item_count
      FROM public.pedido_venta_items AS pvi
      JOIN public.catalog_items AS ci
        ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id
     WHERE pvi.organizacion_id = p_organizacion_id
       AND pvi.pedido_venta_id = v_pedido_id
       AND ci.maneja_inventario IS TRUE;

    IF v_stock_item_count > 0 THEN
        SELECT a.id INTO v_warehouse_id
          FROM public.almacenes AS a
         WHERE a.organizacion_id = p_organizacion_id AND a.activo IS TRUE
         ORDER BY a.es_principal DESC, a.id
         LIMIT 1;
        IF v_warehouse_id IS NULL THEN
            RAISE EXCEPTION 'inventory_warehouse_required' USING ERRCODE = 'P0001';
        END IF;
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'quote_item_id', pvi.cotizacion_item_id,
                   'catalog_item_id', pvi.catalog_item_id,
                   'cantidad', pvi.cantidad
               ) ORDER BY pvi.orden), '[]'::jsonb)
          INTO v_items
          FROM public.pedido_venta_items AS pvi
          JOIN public.catalog_items AS ci
            ON ci.organizacion_id = pvi.organizacion_id AND ci.id = pvi.catalog_item_id
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_pedido_id
           AND ci.maneja_inventario IS TRUE
           AND NOT EXISTS (
               SELECT 1 FROM public.inventario_reservas AS ir
                WHERE ir.organizacion_id = p_organizacion_id
                  AND ir.quote_id = p_cotizacion_id
                  AND ir.quote_item_id = pvi.cotizacion_item_id
                  AND ir.estado = 'activa'
           );
        IF jsonb_array_length(v_items) > 0 THEN
            PERFORM public.crm_reservar_inventario_cotizacion(
                p_organizacion_id, p_cotizacion_id, v_warehouse_id, v_items, p_usuario_id
            );
        END IF;
    END IF;

    SELECT * INTO v_sale
      FROM public.crm_formalizar_venta(
          p_organizacion_id, p_cotizacion_id, p_usuario_id, p_fecha_vencimiento
      );
    v_sale_id := v_sale.venta_id;
    UPDATE public.ventas
       SET pedido_venta_id = v_pedido_id, actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_sale_id
       AND (pedido_venta_id IS NULL OR pedido_venta_id = v_pedido_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sale_linked_to_different_order' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.venta_items AS vi
       SET catalog_item_id = pvi.catalog_item_id,
           pedido_venta_item_id = pvi.id,
           actualizado_en = now()
      FROM public.pedido_venta_items AS pvi
     WHERE vi.organizacion_id = p_organizacion_id
       AND vi.venta_id = v_sale_id
       AND pvi.organizacion_id = p_organizacion_id
       AND pvi.pedido_venta_id = v_pedido_id
       AND pvi.orden = vi.orden;

    UPDATE public.inventario_reservas AS ir
       SET pedido_venta_id = v_pedido_id,
           pedido_venta_item_id = pvi.id,
           motivo = 'Reserva por pedido del cliente confirmado'
      FROM public.pedido_venta_items AS pvi
     WHERE ir.organizacion_id = p_organizacion_id
       AND ir.quote_id = p_cotizacion_id
       AND ir.quote_item_id = pvi.cotizacion_item_id
       AND pvi.organizacion_id = p_organizacion_id
       AND pvi.pedido_venta_id = v_pedido_id
       AND ir.estado = 'activa';

    FOR v_unit IN
        SELECT pvi.id AS pedido_item_id, pvi.unidad_id, pvi.catalog_item_id
          FROM public.pedido_venta_items AS pvi
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.pedido_venta_id = v_pedido_id AND pvi.unidad_id IS NOT NULL
    LOOP
        SELECT u.status INTO v_unit_status
          FROM public.propiedad_unidades AS u
         WHERE u.id = v_unit.unidad_id
           AND u.catalog_item_id = v_unit.catalog_item_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
        END IF;
        IF v_unit_status NOT IN ('disponible'::public.propiedad_status,
                                 'apartado'::public.propiedad_status,
                                 'reservado'::public.propiedad_status) THEN
            RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
        END IF;
        SELECT pvi.pedido_venta_id INTO v_other_confirmed_order
          FROM public.pedido_venta_items AS pvi
          JOIN public.pedidos_venta AS pv
            ON pv.organizacion_id = pvi.organizacion_id AND pv.id = pvi.pedido_venta_id
         WHERE pvi.organizacion_id = p_organizacion_id
           AND pvi.unidad_id = v_unit.unidad_id
           AND pv.estatus = 'confirmado'
           AND pv.id <> v_pedido_id
         LIMIT 1;
        IF v_other_confirmed_order IS NOT NULL THEN
            RAISE EXCEPTION 'property_unit_already_reserved' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.propiedad_unidades AS u
           SET status = CASE WHEN u.status = 'apartado'::public.propiedad_status
                             THEN u.status ELSE 'reservado'::public.propiedad_status END,
               actualizado_en = now()
         WHERE u.id = v_unit.unidad_id
           AND u.catalog_item_id = v_unit.catalog_item_id
           AND u.status IN ('disponible'::public.propiedad_status,
                            'apartado'::public.propiedad_status,
                            'reservado'::public.propiedad_status);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'property_unit_not_available' USING ERRCODE = 'P0001';
        END IF;
    END LOOP;

    UPDATE public.pedidos_venta
       SET estatus = 'confirmado',
           referencia_pedido_cliente = COALESCE(NULLIF(btrim(p_referencia_pedido_cliente), ''), referencia_pedido_cliente),
           fecha_orden_cliente = COALESCE(p_fecha_orden_cliente, fecha_orden_cliente),
           confirmado_en = now(), confirmado_por_usuario_id = p_usuario_id,
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id AND id = v_pedido_id;

    RETURN QUERY SELECT v_sale.venta_id, v_sale.cliente_id, v_sale.cuenta_por_cobrar_id,
                        v_sale.venta_estatus, v_sale.total, v_sale.pago_acumulado, v_sale.saldo;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_confirmar_pedido_venta(uuid, uuid, uuid, date, text, date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_confirmar_pedido_venta(uuid, uuid, uuid, date, text, date)
    TO service_role;

CREATE OR REPLACE FUNCTION public.crm_confirmar_pedido_venta_con_pago(
    p_organizacion_id uuid,
    p_cotizacion_id uuid,
    p_monto numeric,
    p_tipo_pago text DEFAULT 'parcial',
    p_fecha_pago timestamptz DEFAULT now(),
    p_metodo_pago text DEFAULT NULL,
    p_referencia_pago text DEFAULT NULL,
    p_registrado_por_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE (
    venta_id uuid,
    cliente_id uuid,
    cuenta_por_cobrar_id uuid,
    pago_id uuid,
    venta_estatus text,
    pago_acumulado numeric,
    total numeric,
    saldo numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_sale record;
BEGIN
    SELECT * INTO v_sale
      FROM public.crm_confirmar_pedido_venta(
          p_organizacion_id, p_cotizacion_id, p_registrado_por_usuario_id
      );
    RETURN QUERY
    SELECT * FROM public.crm_registrar_pago_confirmado(
        p_organizacion_id, v_sale.venta_id, p_monto, p_tipo_pago,
        p_fecha_pago, p_metodo_pago, p_referencia_pago,
        p_registrado_por_usuario_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_confirmar_pedido_venta_con_pago(uuid, uuid, numeric, text, timestamptz, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_confirmar_pedido_venta_con_pago(uuid, uuid, numeric, text, timestamptz, text, text, uuid)
    TO service_role;

COMMIT;
