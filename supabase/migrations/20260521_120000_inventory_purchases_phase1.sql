BEGIN;

-- Fase 1: inventario base.
-- Objetivo:
-- - extender el catalogo para distinguir items controlados por inventario;
-- - crear almacenes;
-- - crear existencias actuales;
-- - crear bitacora inmutable de movimientos.

ALTER TABLE public.catalog_items
    ADD COLUMN IF NOT EXISTS codigo text,
    ADD COLUMN IF NOT EXISTS maneja_inventario boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS unidad_inventario text NOT NULL DEFAULT 'unidad',
    ADD COLUMN IF NOT EXISTS stock_minimo numeric(14,3),
    ADD COLUMN IF NOT EXISTS stock_objetivo numeric(14,3),
    ADD COLUMN IF NOT EXISTS costo_ultimo numeric(14,4),
    ADD COLUMN IF NOT EXISTS costo_promedio numeric(14,4),
    ADD COLUMN IF NOT EXISTS requiere_lote boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS requiere_serie boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS proveedor_principal_id uuid,
    ADD COLUMN IF NOT EXISTS activo_compra boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_org_codigo_unq
    ON public.catalog_items (organizacion_id, codigo)
    WHERE codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_items_org_maneja_inventario_idx
    ON public.catalog_items (organizacion_id, maneja_inventario, activo);

CREATE INDEX IF NOT EXISTS catalog_items_org_activo_compra_idx
    ON public.catalog_items (organizacion_id, activo_compra, activo);

CREATE TABLE IF NOT EXISTS public.almacenes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    tipo text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    es_principal boolean NOT NULL DEFAULT false,
    direccion_id uuid,
    responsable_usuario_id uuid,
    telefono text,
    email text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT almacenes_tipo_check CHECK (tipo = ANY (ARRAY['central'::text, 'sucursal'::text, 'transito'::text, 'consignacion'::text]))
);

COMMENT ON TABLE public.almacenes IS 'Almacenes fisicos o logicos para control de stock.';

CREATE UNIQUE INDEX IF NOT EXISTS almacenes_org_codigo_unq
    ON public.almacenes (organizacion_id, codigo);

CREATE INDEX IF NOT EXISTS almacenes_org_activo_idx
    ON public.almacenes (organizacion_id, activo, es_principal);

CREATE INDEX IF NOT EXISTS almacenes_responsable_idx
    ON public.almacenes (organizacion_id, responsable_usuario_id);

CREATE TABLE IF NOT EXISTS public.inventario_existencias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    almacen_id uuid NOT NULL,
    stock_actual numeric(14,3) NOT NULL DEFAULT 0,
    stock_reservado numeric(14,3) NOT NULL DEFAULT 0,
    stock_disponible numeric(14,3) GENERATED ALWAYS AS (stock_actual - stock_reservado) STORED,
    stock_minimo numeric(14,3),
    stock_objetivo numeric(14,3),
    costo_ultimo numeric(14,4),
    costo_promedio numeric(14,4),
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventario_existencias_stock_nonnegative_check CHECK (
        stock_actual >= 0
        AND stock_reservado >= 0
        AND stock_actual >= stock_reservado
    )
);

COMMENT ON TABLE public.inventario_existencias IS 'Estado actual del stock por producto y almacen.';

CREATE UNIQUE INDEX IF NOT EXISTS inventario_existencias_org_item_almacen_unq
    ON public.inventario_existencias (organizacion_id, catalog_item_id, almacen_id);

CREATE INDEX IF NOT EXISTS inventario_existencias_org_almacen_idx
    ON public.inventario_existencias (organizacion_id, almacen_id, stock_disponible);

CREATE INDEX IF NOT EXISTS inventario_existencias_org_item_idx
    ON public.inventario_existencias (organizacion_id, catalog_item_id);

CREATE TABLE IF NOT EXISTS public.inventario_movimientos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    almacen_id uuid NOT NULL,
    tipo text NOT NULL,
    cantidad_entrada numeric(14,3) NOT NULL DEFAULT 0,
    cantidad_salida numeric(14,3) NOT NULL DEFAULT 0,
    costo_unitario numeric(14,4),
    costo_total numeric(14,4),
    referencia_tipo text,
    referencia_id uuid,
    motivo text,
    creado_por uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    numero_documento text,
    folio_documento text,
    CONSTRAINT inventario_movimientos_tipo_check CHECK (
        tipo = ANY (ARRAY[
            'entrada_compra'::text,
            'salida_venta'::text,
            'ajuste_positivo'::text,
            'ajuste_negativo'::text,
            'transferencia_salida'::text,
            'transferencia_entrada'::text,
            'reserva'::text,
            'liberacion_reserva'::text,
            'devolucion_compra'::text,
            'devolucion_venta'::text
        ])
    ),
    CONSTRAINT inventario_movimientos_cantidades_check CHECK (
        cantidad_entrada >= 0
        AND cantidad_salida >= 0
        AND (cantidad_entrada > 0 OR cantidad_salida > 0)
        AND NOT (cantidad_entrada > 0 AND cantidad_salida > 0)
    ),
    CONSTRAINT inventario_movimientos_costos_check CHECK (
        costo_unitario IS NULL OR costo_unitario >= 0
    ),
    CONSTRAINT inventario_movimientos_total_check CHECK (
        costo_total IS NULL OR costo_total >= 0
    )
);

COMMENT ON TABLE public.inventario_movimientos IS 'Libro mayor inmutable de cambios de inventario.';

CREATE INDEX IF NOT EXISTS inventario_movimientos_org_item_fecha_idx
    ON public.inventario_movimientos (organizacion_id, catalog_item_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS inventario_movimientos_org_almacen_fecha_idx
    ON public.inventario_movimientos (organizacion_id, almacen_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS inventario_movimientos_org_referencia_idx
    ON public.inventario_movimientos (organizacion_id, referencia_tipo, referencia_id);

ALTER TABLE public.almacenes
    ADD CONSTRAINT almacenes_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.almacenes
    ADD CONSTRAINT almacenes_direccion_id_fkey
    FOREIGN KEY (direccion_id) REFERENCES public.direcciones(id) ON DELETE SET NULL;

ALTER TABLE public.almacenes
    ADD CONSTRAINT almacenes_responsable_usuario_id_fkey
    FOREIGN KEY (responsable_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.inventario_existencias
    ADD CONSTRAINT inventario_existencias_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.inventario_existencias
    ADD CONSTRAINT inventario_existencias_catalog_item_fkey
    FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE RESTRICT;

ALTER TABLE public.inventario_existencias
    ADD CONSTRAINT inventario_existencias_almacen_fkey
    FOREIGN KEY (almacen_id) REFERENCES public.almacenes(id) ON DELETE RESTRICT;

ALTER TABLE public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_catalog_item_fkey
    FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE RESTRICT;

ALTER TABLE public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_almacen_fkey
    FOREIGN KEY (almacen_id) REFERENCES public.almacenes(id) ON DELETE RESTRICT;

ALTER TABLE public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_creado_por_fkey
    FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.almacenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_existencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_almacenes_set_org ON public.almacenes;
CREATE TRIGGER t_almacenes_set_org
    BEFORE INSERT ON public.almacenes
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_inventario_existencias_set_org ON public.inventario_existencias;
CREATE TRIGGER t_inventario_existencias_set_org
    BEFORE INSERT ON public.inventario_existencias
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_inventario_movimientos_set_org ON public.inventario_movimientos;
CREATE TRIGGER t_inventario_movimientos_set_org
    BEFORE INSERT ON public.inventario_movimientos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_almacenes_touch_updated_at ON public.almacenes;
CREATE TRIGGER t_almacenes_touch_updated_at
    BEFORE UPDATE ON public.almacenes
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS t_inventario_existencias_touch_updated_at ON public.inventario_existencias;
CREATE TRIGGER t_inventario_existencias_touch_updated_at
    BEFORE UPDATE ON public.inventario_existencias
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY almacenes_select_org
    ON public.almacenes
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY almacenes_write_org
    ON public.almacenes
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY inventario_existencias_select_org
    ON public.inventario_existencias
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY inventario_existencias_write_org
    ON public.inventario_existencias
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY inventario_movimientos_select_org
    ON public.inventario_movimientos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY inventario_movimientos_insert_org
    ON public.inventario_movimientos
    FOR INSERT
    TO authenticated
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;
