BEGIN;

-- Fase 3: recepcion de mercancia.
-- Objetivo:
-- - registrar recepciones contra ordenes de compra;
-- - convertir cada linea recibida en entrada real de inventario;
-- - actualizar cantidades recibidas y estado de la orden de compra;
-- - mantener trazabilidad operativa sin depender de metadata.

CREATE TABLE IF NOT EXISTS public.recepciones_compra (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    almacen_id uuid NOT NULL,
    numero_recepcion text NOT NULL,
    estado text NOT NULL DEFAULT 'parcial',
    recibido_por_usuario_id uuid,
    recibido_en timestamptz NOT NULL DEFAULT now(),
    referencia_externa text,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recepciones_compra_estado_check CHECK (
        estado = ANY (ARRAY['parcial'::text, 'completa'::text, 'rechazada'::text])
    )
);

COMMENT ON TABLE public.recepciones_compra IS 'Cabecera de la recepcion fisica de mercancia asociada a una orden de compra.';

CREATE UNIQUE INDEX IF NOT EXISTS recepciones_compra_org_numero_unq
    ON public.recepciones_compra (organizacion_id, numero_recepcion);

CREATE INDEX IF NOT EXISTS recepciones_compra_org_orden_fecha_idx
    ON public.recepciones_compra (organizacion_id, orden_compra_id, recibido_en DESC);

CREATE INDEX IF NOT EXISTS recepciones_compra_org_almacen_fecha_idx
    ON public.recepciones_compra (organizacion_id, almacen_id, recibido_en DESC);

CREATE TABLE IF NOT EXISTS public.recepciones_compra_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    recepcion_id uuid NOT NULL,
    orden_compra_item_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    cantidad_recibida numeric(14,3) NOT NULL,
    costo_unitario_real numeric(14,4) NOT NULL,
    subtotal numeric(14,4) NOT NULL,
    lote_codigo text,
    fecha_caducidad date,
    serie text,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recepciones_compra_items_cantidad_check CHECK (cantidad_recibida > 0),
    CONSTRAINT recepciones_compra_items_costo_check CHECK (costo_unitario_real >= 0),
    CONSTRAINT recepciones_compra_items_total_check CHECK (subtotal >= 0)
);

COMMENT ON TABLE public.recepciones_compra_items IS 'Detalle de productos recibidos en una recepcion de compra.';

CREATE INDEX IF NOT EXISTS recepciones_compra_items_org_recepcion_idx
    ON public.recepciones_compra_items (organizacion_id, recepcion_id);

CREATE INDEX IF NOT EXISTS recepciones_compra_items_org_item_idx
    ON public.recepciones_compra_items (organizacion_id, catalog_item_id);

CREATE INDEX IF NOT EXISTS recepciones_compra_items_org_orden_item_idx
    ON public.recepciones_compra_items (organizacion_id, orden_compra_item_id);

ALTER TABLE public.recepciones_compra
    ADD CONSTRAINT recepciones_compra_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.recepciones_compra
    ADD CONSTRAINT recepciones_compra_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE RESTRICT;

ALTER TABLE public.recepciones_compra
    ADD CONSTRAINT recepciones_compra_almacen_id_fkey
    FOREIGN KEY (almacen_id) REFERENCES public.almacenes(id) ON DELETE RESTRICT;

ALTER TABLE public.recepciones_compra
    ADD CONSTRAINT recepciones_compra_recibido_por_usuario_id_fkey
    FOREIGN KEY (recibido_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.recepciones_compra_items
    ADD CONSTRAINT recepciones_compra_items_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.recepciones_compra_items
    ADD CONSTRAINT recepciones_compra_items_recepcion_id_fkey
    FOREIGN KEY (recepcion_id) REFERENCES public.recepciones_compra(id) ON DELETE RESTRICT;

ALTER TABLE public.recepciones_compra_items
    ADD CONSTRAINT recepciones_compra_items_orden_compra_item_id_fkey
    FOREIGN KEY (orden_compra_item_id) REFERENCES public.ordenes_compra_items(id) ON DELETE RESTRICT;

ALTER TABLE public.recepciones_compra_items
    ADD CONSTRAINT recepciones_compra_items_catalog_item_id_fkey
    FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE RESTRICT;

ALTER TABLE public.recepciones_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recepciones_compra_items ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.trg_validar_recepcion_compra();
CREATE OR REPLACE FUNCTION public.trg_validar_recepcion_compra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orden public.ordenes_compra%ROWTYPE;
BEGIN
    SELECT *
    INTO v_orden
    FROM public.ordenes_compra
    WHERE id = NEW.orden_compra_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden de compra no encontrada';
    END IF;

    NEW.organizacion_id := v_orden.organizacion_id;

    IF NEW.organizacion_id IS DISTINCT FROM v_orden.organizacion_id THEN
        RAISE EXCEPTION 'La recepcion y la orden de compra deben pertenecer a la misma organizacion';
    END IF;

    IF v_orden.estado IN ('cancelada', 'cerrada') THEN
        RAISE EXCEPTION 'No se puede recepcionar una orden en estado %', v_orden.estado;
    END IF;

    IF NEW.almacen_id IS DISTINCT FROM v_orden.almacen_destino_id THEN
        RAISE EXCEPTION 'La recepcion debe registrarse en el almacen destino de la orden de compra';
    END IF;

    NEW.organizacion_id := v_orden.organizacion_id;

    RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.trg_validar_recepcion_compra_item();
CREATE OR REPLACE FUNCTION public.trg_validar_recepcion_compra_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recepcion public.recepciones_compra%ROWTYPE;
    v_orden_item public.ordenes_compra_items%ROWTYPE;
    v_orden public.ordenes_compra%ROWTYPE;
    v_recibido_total numeric(14,3);
BEGIN
    SELECT *
    INTO v_recepcion
    FROM public.recepciones_compra
    WHERE id = NEW.recepcion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recepcion de compra no encontrada';
    END IF;

    IF v_recepcion.estado = 'rechazada' THEN
        RAISE EXCEPTION 'No se pueden agregar items a una recepcion rechazada';
    END IF;

    SELECT *
    INTO v_orden_item
    FROM public.ordenes_compra_items
    WHERE id = NEW.orden_compra_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Linea de orden de compra no encontrada';
    END IF;

    SELECT *
    INTO v_orden
    FROM public.ordenes_compra
    WHERE id = v_orden_item.orden_compra_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden de compra no encontrada';
    END IF;

    NEW.organizacion_id := v_recepcion.organizacion_id;

    IF NEW.organizacion_id IS DISTINCT FROM v_orden.organizacion_id
       OR NEW.organizacion_id IS DISTINCT FROM v_orden_item.organizacion_id THEN
        RAISE EXCEPTION 'El item de recepcion debe pertenecer a la misma organizacion que la recepcion y la orden';
    END IF;

    IF v_recepcion.orden_compra_id IS DISTINCT FROM v_orden.id THEN
        RAISE EXCEPTION 'La recepcion no corresponde a la orden de compra indicada';
    END IF;

    IF v_recepcion.almacen_id IS DISTINCT FROM v_orden.almacen_destino_id THEN
        RAISE EXCEPTION 'La recepcion debe ingresar al almacen destino de la orden';
    END IF;

    IF NEW.catalog_item_id IS DISTINCT FROM v_orden_item.catalog_item_id THEN
        RAISE EXCEPTION 'El catalog_item_id de la recepcion no coincide con la linea de la orden';
    END IF;

    SELECT COALESCE(SUM(cantidad_recibida), 0)
    INTO v_recibido_total
    FROM public.recepciones_compra_items
    WHERE orden_compra_item_id = NEW.orden_compra_item_id;

    IF v_recibido_total + NEW.cantidad_recibida > v_orden_item.cantidad_solicitada THEN
        RAISE EXCEPTION 'La cantidad recibida excede la cantidad solicitada en la orden';
    END IF;

    NEW.organizacion_id := v_recepcion.organizacion_id;
    NEW.subtotal := round(NEW.cantidad_recibida * NEW.costo_unitario_real, 4);

    RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.trg_aplicar_recepcion_compra_item();
CREATE OR REPLACE FUNCTION public.trg_aplicar_recepcion_compra_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recepcion public.recepciones_compra%ROWTYPE;
    v_orden public.ordenes_compra%ROWTYPE;
BEGIN
    SELECT *
    INTO v_recepcion
    FROM public.recepciones_compra
    WHERE id = NEW.recepcion_id;

    SELECT *
    INTO v_orden
    FROM public.ordenes_compra
    WHERE id = v_recepcion.orden_compra_id;

    INSERT INTO public.inventario_existencias (
        organizacion_id,
        catalog_item_id,
        almacen_id,
        stock_actual,
        stock_reservado,
        stock_minimo,
        stock_objetivo,
        costo_ultimo,
        costo_promedio
    )
    SELECT
        NEW.organizacion_id,
        NEW.catalog_item_id,
        v_recepcion.almacen_id,
        NEW.cantidad_recibida,
        0,
        ci.stock_minimo,
        ci.stock_objetivo,
        NEW.costo_unitario_real,
        NEW.costo_unitario_real
    FROM public.catalog_items ci
    WHERE ci.id = NEW.catalog_item_id
    ON CONFLICT (organizacion_id, catalog_item_id, almacen_id)
    DO UPDATE SET
        stock_actual = public.inventario_existencias.stock_actual + EXCLUDED.stock_actual,
        costo_ultimo = EXCLUDED.costo_ultimo,
        costo_promedio = CASE
            WHEN public.inventario_existencias.stock_actual + EXCLUDED.stock_actual <= 0 THEN EXCLUDED.costo_ultimo
            WHEN COALESCE(public.inventario_existencias.stock_actual, 0) = 0 THEN EXCLUDED.costo_ultimo
            ELSE round(
                (
                    (public.inventario_existencias.stock_actual * COALESCE(
                        public.inventario_existencias.costo_promedio,
                        public.inventario_existencias.costo_ultimo,
                        EXCLUDED.costo_ultimo
                    ))
                    + (EXCLUDED.stock_actual * EXCLUDED.costo_ultimo)
                ) / (public.inventario_existencias.stock_actual + EXCLUDED.stock_actual),
                4
            )
        END,
        stock_minimo = COALESCE(public.inventario_existencias.stock_minimo, EXCLUDED.stock_minimo),
        stock_objetivo = COALESCE(public.inventario_existencias.stock_objetivo, EXCLUDED.stock_objetivo),
        actualizado_en = now();

    INSERT INTO public.inventario_movimientos (
        organizacion_id,
        catalog_item_id,
        almacen_id,
        tipo,
        cantidad_entrada,
        cantidad_salida,
        costo_unitario,
        costo_total,
        referencia_tipo,
        referencia_id,
        motivo,
        creado_por,
        creado_en,
        numero_documento,
        folio_documento
    )
    VALUES (
        NEW.organizacion_id,
        NEW.catalog_item_id,
        v_recepcion.almacen_id,
        'entrada_compra',
        NEW.cantidad_recibida,
        0,
        NEW.costo_unitario_real,
        NEW.subtotal,
        'recepcion_compra_item',
        NEW.id,
        'Entrada por recepcion de compra',
        v_recepcion.recibido_por_usuario_id,
        now(),
        v_recepcion.numero_recepcion,
        v_orden.folio
    );

    UPDATE public.ordenes_compra_items
    SET cantidad_recibida = (
        SELECT COALESCE(SUM(rci.cantidad_recibida), 0)
        FROM public.recepciones_compra_items rci
        JOIN public.recepciones_compra rc
            ON rc.id = rci.recepcion_id
        WHERE rci.orden_compra_item_id = NEW.orden_compra_item_id
          AND rc.estado <> 'rechazada'
    )
    WHERE id = NEW.orden_compra_item_id;

    UPDATE public.ordenes_compra oc
    SET estado = CASE
        WHEN EXISTS (
            SELECT 1
            FROM public.ordenes_compra_items oi
            WHERE oi.orden_compra_id = oc.id
              AND oi.cantidad_recibida < oi.cantidad_solicitada
        ) THEN 'parcial'
        ELSE 'recibida'
    END
    WHERE oc.id = v_orden.id
      AND oc.estado NOT IN ('cancelada', 'cerrada');

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS t_recepciones_compra_set_org ON public.recepciones_compra;
CREATE TRIGGER t_recepciones_compra_set_org
    BEFORE INSERT ON public.recepciones_compra
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_recepciones_compra_validar ON public.recepciones_compra;
CREATE TRIGGER t_recepciones_compra_validar
    BEFORE INSERT ON public.recepciones_compra
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_validar_recepcion_compra();

DROP TRIGGER IF EXISTS t_recepciones_compra_touch_updated_at ON public.recepciones_compra;
CREATE TRIGGER t_recepciones_compra_touch_updated_at
    BEFORE UPDATE ON public.recepciones_compra
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS t_recepciones_compra_items_set_org ON public.recepciones_compra_items;
CREATE TRIGGER t_recepciones_compra_items_set_org
    BEFORE INSERT ON public.recepciones_compra_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_recepciones_compra_items_validar ON public.recepciones_compra_items;
CREATE TRIGGER t_recepciones_compra_items_validar
    BEFORE INSERT ON public.recepciones_compra_items
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_validar_recepcion_compra_item();

DROP TRIGGER IF EXISTS t_recepciones_compra_items_aplicar ON public.recepciones_compra_items;
CREATE TRIGGER t_recepciones_compra_items_aplicar
    AFTER INSERT ON public.recepciones_compra_items
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_aplicar_recepcion_compra_item();

DROP TRIGGER IF EXISTS t_recepciones_compra_items_touch_updated_at ON public.recepciones_compra_items;
CREATE TRIGGER t_recepciones_compra_items_touch_updated_at
    BEFORE UPDATE ON public.recepciones_compra_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP POLICY IF EXISTS recepciones_compra_select_org ON public.recepciones_compra;
CREATE POLICY recepciones_compra_select_org
    ON public.recepciones_compra
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS recepciones_compra_write_org ON public.recepciones_compra;
CREATE POLICY recepciones_compra_write_org
    ON public.recepciones_compra
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS recepciones_compra_items_select_org ON public.recepciones_compra_items;
CREATE POLICY recepciones_compra_items_select_org
    ON public.recepciones_compra_items
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

DROP POLICY IF EXISTS recepciones_compra_items_insert_org ON public.recepciones_compra_items;
CREATE POLICY recepciones_compra_items_insert_org
    ON public.recepciones_compra_items
    FOR INSERT
    TO authenticated
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.trg_validar_recepcion_compra() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_validar_recepcion_compra_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_aplicar_recepcion_compra_item() FROM PUBLIC, anon, authenticated;

COMMIT;
