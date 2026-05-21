BEGIN;

CREATE TABLE IF NOT EXISTS public.inventario_reservas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    quote_id uuid NOT NULL,
    quote_item_id uuid,
    catalog_item_id uuid NOT NULL,
    almacen_id uuid NOT NULL,
    cantidad numeric(14,3) NOT NULL,
    estado text NOT NULL DEFAULT 'activa',
    motivo text,
    creado_por uuid,
    liberado_por uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    liberado_en timestamptz,
    CONSTRAINT inventario_reservas_estado_check CHECK (estado = ANY (ARRAY['activa'::text, 'liberada'::text])),
    CONSTRAINT inventario_reservas_cantidad_check CHECK (cantidad > 0)
);

COMMENT ON TABLE public.inventario_reservas IS 'Reservas de inventario asociadas a cotizaciones aceptadas.';

CREATE INDEX IF NOT EXISTS inventario_reservas_org_quote_idx
    ON public.inventario_reservas (organizacion_id, quote_id, estado);

CREATE INDEX IF NOT EXISTS inventario_reservas_org_item_idx
    ON public.inventario_reservas (organizacion_id, catalog_item_id, almacen_id, estado);

ALTER TABLE public.inventario_reservas
    ADD CONSTRAINT inventario_reservas_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.inventario_reservas
    ADD CONSTRAINT inventario_reservas_catalog_item_id_fkey
    FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE RESTRICT;

ALTER TABLE public.inventario_reservas
    ADD CONSTRAINT inventario_reservas_almacen_id_fkey
    FOREIGN KEY (almacen_id) REFERENCES public.almacenes(id) ON DELETE RESTRICT;

ALTER TABLE public.inventario_reservas
    ADD CONSTRAINT inventario_reservas_creado_por_fkey
    FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.inventario_reservas
    ADD CONSTRAINT inventario_reservas_liberado_por_fkey
    FOREIGN KEY (liberado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.inventario_reservas ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.crm_reservar_inventario_cotizacion(
    uuid,
    uuid,
    uuid,
    jsonb,
    uuid
);

CREATE OR REPLACE FUNCTION public.crm_reservar_inventario_cotizacion(
    p_organizacion_id uuid,
    p_quote_id uuid,
    p_almacen_id uuid,
    p_items jsonb,
    p_creado_por uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item record;
    v_existencia public.inventario_existencias%ROWTYPE;
    v_catalog_item public.catalog_items%ROWTYPE;
    v_cantidad numeric(14,3);
    v_disponible numeric(14,3);
BEGIN
    IF p_organizacion_id IS NULL OR p_quote_id IS NULL OR p_almacen_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion, la cotizacion y el almacen son obligatorios';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'Los items de reserva son obligatorios';
    END IF;

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_items) AS x(
            quote_item_id uuid,
            catalog_item_id uuid,
            cantidad numeric
        )
    LOOP
        IF v_item.catalog_item_id IS NULL THEN
            CONTINUE;
        END IF;

        v_cantidad := round(coalesce(v_item.cantidad, 0), 3);
        IF v_cantidad <= 0 THEN
            CONTINUE;
        END IF;

        SELECT *
        INTO v_catalog_item
        FROM public.catalog_items
        WHERE id = v_item.catalog_item_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        SELECT *
        INTO v_existencia
        FROM public.inventario_existencias
        WHERE organizacion_id = p_organizacion_id
          AND catalog_item_id = v_item.catalog_item_id
          AND almacen_id = p_almacen_id
        FOR UPDATE;

        IF NOT FOUND THEN
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
            VALUES (
                p_organizacion_id,
                v_item.catalog_item_id,
                p_almacen_id,
                0,
                0,
                v_catalog_item.stock_minimo,
                v_catalog_item.stock_objetivo,
                COALESCE(v_catalog_item.costo_ultimo, 0),
                COALESCE(v_catalog_item.costo_promedio, COALESCE(v_catalog_item.costo_ultimo, 0))
            )
            RETURNING * INTO v_existencia;
        END IF;

        v_disponible := round(COALESCE(v_existencia.stock_actual, 0) - COALESCE(v_existencia.stock_reservado, 0), 3);
        IF v_disponible < v_cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para reservar el producto %', v_item.catalog_item_id;
        END IF;

        UPDATE public.inventario_existencias
        SET stock_reservado = stock_reservado + v_cantidad,
            actualizado_en = now()
        WHERE id = v_existencia.id;

        INSERT INTO public.inventario_reservas (
            organizacion_id,
            quote_id,
            quote_item_id,
            catalog_item_id,
            almacen_id,
            cantidad,
            estado,
            motivo,
            creado_por,
            creado_en
        )
        VALUES (
            p_organizacion_id,
            p_quote_id,
            v_item.quote_item_id,
            v_item.catalog_item_id,
            p_almacen_id,
            v_cantidad,
            'activa',
            'Reserva por cotizacion aceptada',
            p_creado_por,
            now()
        );

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
            creado_en
        )
        VALUES (
            p_organizacion_id,
            v_item.catalog_item_id,
            p_almacen_id,
            'reserva',
            0,
            v_cantidad,
            COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, v_catalog_item.costo_promedio, v_catalog_item.costo_ultimo, 0),
            round(v_cantidad * COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, v_catalog_item.costo_promedio, v_catalog_item.costo_ultimo, 0), 4),
            'cotizacion',
            p_quote_id,
            'Reserva por cotizacion aceptada',
            p_creado_por,
            now()
        );
    END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.crm_liberar_inventario_cotizacion(
    uuid,
    uuid,
    uuid
);

CREATE OR REPLACE FUNCTION public.crm_liberar_inventario_cotizacion(
    p_organizacion_id uuid,
    p_quote_id uuid,
    p_liberado_por uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reserva record;
    v_existencia public.inventario_existencias%ROWTYPE;
BEGIN
    IF p_organizacion_id IS NULL OR p_quote_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion y la cotizacion son obligatorias';
    END IF;

    FOR v_reserva IN
        SELECT *
        FROM public.inventario_reservas
        WHERE organizacion_id = p_organizacion_id
          AND quote_id = p_quote_id
          AND estado = 'activa'
        FOR UPDATE
    LOOP
        SELECT *
        INTO v_existencia
        FROM public.inventario_existencias
        WHERE organizacion_id = p_organizacion_id
          AND catalog_item_id = v_reserva.catalog_item_id
          AND almacen_id = v_reserva.almacen_id
        FOR UPDATE;

        IF FOUND THEN
            UPDATE public.inventario_existencias
            SET stock_reservado = GREATEST(COALESCE(stock_reservado, 0) - v_reserva.cantidad, 0),
                actualizado_en = now()
            WHERE id = v_existencia.id;
        END IF;

        UPDATE public.inventario_reservas
        SET estado = 'liberada',
            liberado_por = p_liberado_por,
            liberado_en = now()
        WHERE id = v_reserva.id;

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
            creado_en
        )
        VALUES (
            p_organizacion_id,
            v_reserva.catalog_item_id,
            v_reserva.almacen_id,
            'liberacion_reserva',
            v_reserva.cantidad,
            0,
            COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, 0),
            round(v_reserva.cantidad * COALESCE(v_existencia.costo_promedio, v_existencia.costo_ultimo, 0), 4),
            'cotizacion',
            p_quote_id,
            'Liberacion por rechazo o cancelacion de cotizacion',
            p_liberado_por,
            now()
        );
    END LOOP;
END;
$$;

COMMIT;
