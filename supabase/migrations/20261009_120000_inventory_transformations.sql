BEGIN;

-- Transformaciones de inventario: formulas, ordenes y snapshots operativos.
-- Las tablas son tenant-safe y no modifican existencias hasta ejecutar una orden.

CREATE TABLE IF NOT EXISTS public.transformaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    codigo text NOT NULL,
    nombre text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    estado text NOT NULL DEFAULT 'borrador',
    unidad_produccion text NOT NULL DEFAULT 'unidad',
    cantidad_produccion numeric(14,3) NOT NULL DEFAULT 1,
    merma_esperada numeric(7,4) NOT NULL DEFAULT 0,
    activo boolean NOT NULL DEFAULT true,
    creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transformaciones_codigo_check CHECK (length(trim(codigo)) > 0),
    CONSTRAINT transformaciones_nombre_check CHECK (length(trim(nombre)) > 0),
    CONSTRAINT transformaciones_version_check CHECK (version > 0),
    CONSTRAINT transformaciones_estado_check CHECK (estado IN ('borrador', 'activa', 'inactiva')),
    CONSTRAINT transformaciones_cantidad_check CHECK (cantidad_produccion > 0),
    CONSTRAINT transformaciones_merma_check CHECK (merma_esperada >= 0 AND merma_esperada <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS transformaciones_org_id_uidx
    ON public.transformaciones (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS transformaciones_org_codigo_version_uidx
    ON public.transformaciones (organizacion_id, codigo, version);
CREATE INDEX IF NOT EXISTS transformaciones_org_estado_idx
    ON public.transformaciones (organizacion_id, estado, activo, nombre);

CREATE TABLE IF NOT EXISTS public.transformacion_componentes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    transformacion_id uuid NOT NULL REFERENCES public.transformaciones(id) ON DELETE CASCADE,
    catalog_item_id uuid NOT NULL,
    cantidad_requerida numeric(14,3) NOT NULL,
    unidad text NOT NULL,
    porcentaje_merma numeric(7,4) NOT NULL DEFAULT 0,
    orden integer NOT NULL DEFAULT 1,
    CONSTRAINT transformacion_componentes_item_org_fkey
        FOREIGN KEY (organizacion_id, catalog_item_id)
        REFERENCES public.catalog_items (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT transformacion_componentes_cantidad_check CHECK (cantidad_requerida > 0),
    CONSTRAINT transformacion_componentes_unidad_check CHECK (length(trim(unidad)) > 0),
    CONSTRAINT transformacion_componentes_merma_check CHECK (porcentaje_merma >= 0 AND porcentaje_merma <= 100),
    CONSTRAINT transformacion_componentes_orden_check CHECK (orden > 0)
);

CREATE INDEX IF NOT EXISTS transformacion_componentes_org_transformacion_idx
    ON public.transformacion_componentes (organizacion_id, transformacion_id, orden);
CREATE INDEX IF NOT EXISTS transformacion_componentes_org_item_idx
    ON public.transformacion_componentes (organizacion_id, catalog_item_id);

CREATE TABLE IF NOT EXISTS public.transformacion_salidas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    transformacion_id uuid NOT NULL REFERENCES public.transformaciones(id) ON DELETE CASCADE,
    catalog_item_id uuid,
    cantidad_producida numeric(14,3) NOT NULL,
    unidad text NOT NULL,
    porcentaje_costo numeric(7,4) NOT NULL DEFAULT 100,
    es_merma boolean NOT NULL DEFAULT false,
    nombre_merma text,
    CONSTRAINT transformacion_salidas_item_org_fkey
        FOREIGN KEY (organizacion_id, catalog_item_id)
        REFERENCES public.catalog_items (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT transformacion_salidas_cantidad_check CHECK (cantidad_producida > 0),
    CONSTRAINT transformacion_salidas_unidad_check CHECK (length(trim(unidad)) > 0),
    CONSTRAINT transformacion_salidas_costo_check CHECK (porcentaje_costo >= 0 AND porcentaje_costo <= 100),
    CONSTRAINT transformacion_salidas_merma_check CHECK (
        (es_merma = true AND catalog_item_id IS NULL AND length(trim(coalesce(nombre_merma, ''))) > 0)
        OR (es_merma = false AND catalog_item_id IS NOT NULL AND nombre_merma IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS transformacion_salidas_org_transformacion_idx
    ON public.transformacion_salidas (organizacion_id, transformacion_id);
CREATE INDEX IF NOT EXISTS transformacion_salidas_org_item_idx
    ON public.transformacion_salidas (organizacion_id, catalog_item_id)
    WHERE catalog_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ordenes_transformacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    transformacion_id uuid NOT NULL,
    almacen_origen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
    almacen_destino_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
    estado text NOT NULL DEFAULT 'confirmada',
    cantidad_lotes numeric(14,3) NOT NULL DEFAULT 1,
    fecha_operacion timestamptz NOT NULL DEFAULT now(),
    usuario_responsable_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    confirmado_en timestamptz,
    ejecutado_en timestamptz,
    cancelado_en timestamptz,
    CONSTRAINT ordenes_transformacion_transformacion_org_fkey
        FOREIGN KEY (organizacion_id, transformacion_id)
        REFERENCES public.transformaciones (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT ordenes_transformacion_cantidad_check CHECK (cantidad_lotes > 0),
    CONSTRAINT ordenes_transformacion_estado_check CHECK (estado IN ('borrador', 'confirmada', 'ejecutada', 'cancelada'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_transformacion_org_id_uidx
    ON public.ordenes_transformacion (organizacion_id, id);
CREATE INDEX IF NOT EXISTS ordenes_transformacion_org_estado_fecha_idx
    ON public.ordenes_transformacion (organizacion_id, estado, fecha_operacion DESC);
CREATE INDEX IF NOT EXISTS ordenes_transformacion_org_formula_idx
    ON public.ordenes_transformacion (organizacion_id, transformacion_id, fecha_operacion DESC);

CREATE TABLE IF NOT EXISTS public.ordenes_transformacion_componentes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    orden_transformacion_id uuid NOT NULL REFERENCES public.ordenes_transformacion(id) ON DELETE CASCADE,
    catalog_item_id uuid NOT NULL,
    cantidad_requerida numeric(14,3) NOT NULL,
    cantidad_consumida numeric(14,3) NOT NULL DEFAULT 0,
    unidad text NOT NULL,
    costo_unitario numeric(14,4),
    lote text,
    serie text,
    CONSTRAINT ordenes_transformacion_componentes_item_org_fkey
        FOREIGN KEY (organizacion_id, catalog_item_id)
        REFERENCES public.catalog_items (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT ordenes_transformacion_componentes_cantidad_check CHECK (cantidad_requerida > 0 AND cantidad_consumida >= 0),
    CONSTRAINT ordenes_transformacion_componentes_unidad_check CHECK (length(trim(unidad)) > 0)
);

CREATE INDEX IF NOT EXISTS ordenes_transformacion_componentes_org_order_idx
    ON public.ordenes_transformacion_componentes (organizacion_id, orden_transformacion_id);

CREATE TABLE IF NOT EXISTS public.ordenes_transformacion_salidas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    orden_transformacion_id uuid NOT NULL REFERENCES public.ordenes_transformacion(id) ON DELETE CASCADE,
    catalog_item_id uuid,
    cantidad_planeada numeric(14,3) NOT NULL,
    cantidad_producida numeric(14,3) NOT NULL DEFAULT 0,
    unidad text NOT NULL,
    porcentaje_costo numeric(7,4) NOT NULL DEFAULT 0,
    es_merma boolean NOT NULL DEFAULT false,
    nombre_merma text,
    costo_unitario numeric(14,4),
    lote text,
    serie text,
    CONSTRAINT ordenes_transformacion_salidas_item_org_fkey
        FOREIGN KEY (organizacion_id, catalog_item_id)
        REFERENCES public.catalog_items (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT ordenes_transformacion_salidas_cantidad_check CHECK (cantidad_planeada > 0 AND cantidad_producida >= 0),
    CONSTRAINT ordenes_transformacion_salidas_unidad_check CHECK (length(trim(unidad)) > 0)
);

CREATE INDEX IF NOT EXISTS ordenes_transformacion_salidas_org_order_idx
    ON public.ordenes_transformacion_salidas (organizacion_id, orden_transformacion_id);

ALTER TABLE public.inventario_movimientos
    DROP CONSTRAINT IF EXISTS inventario_movimientos_tipo_check;
ALTER TABLE public.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_tipo_check CHECK (
        tipo = ANY (ARRAY[
            'entrada_compra', 'salida_venta', 'ajuste_positivo', 'ajuste_negativo',
            'transferencia_salida', 'transferencia_entrada', 'reserva',
            'liberacion_reserva', 'devolucion_compra', 'devolucion_venta',
            'consumo_transformacion', 'produccion_transformacion', 'merma_transformacion',
            'reversa_consumo_transformacion', 'reversa_produccion_transformacion'
        ])
    );

CREATE INDEX IF NOT EXISTS inventario_movimientos_org_transformacion_idx
    ON public.inventario_movimientos (organizacion_id, referencia_id, creado_en DESC)
    WHERE referencia_tipo = 'orden_transformacion';

ALTER TABLE public.transformaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transformacion_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transformacion_salidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_transformacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_transformacion_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_transformacion_salidas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.transformaciones, public.transformacion_componentes,
    public.transformacion_salidas, public.ordenes_transformacion,
    public.ordenes_transformacion_componentes, public.ordenes_transformacion_salidas
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.transformaciones, public.transformacion_componentes,
    public.transformacion_salidas, public.ordenes_transformacion,
    public.ordenes_transformacion_componentes, public.ordenes_transformacion_salidas TO service_role;

CREATE OR REPLACE FUNCTION public.crm_crear_transformacion(
    p_organizacion_id uuid,
    p_codigo text,
    p_nombre text,
    p_version integer,
    p_unidad_produccion text,
    p_cantidad_produccion numeric,
    p_merma_esperada numeric,
    p_componentes jsonb,
    p_salidas jsonb,
    p_creado_por uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transformacion_id uuid;
    v_component jsonb;
    v_output jsonb;
    v_output_cost numeric := 0;
BEGIN
    IF jsonb_typeof(p_componentes) <> 'array' OR jsonb_array_length(p_componentes) = 0 THEN
        RAISE EXCEPTION 'transformacion_componentes_requeridos' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_salidas) <> 'array' OR jsonb_array_length(p_salidas) = 0 THEN
        RAISE EXCEPTION 'transformacion_salidas_requeridas' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.transformaciones (
        organizacion_id, codigo, nombre, version, estado, unidad_produccion,
        cantidad_produccion, merma_esperada, creado_por
    ) VALUES (
        p_organizacion_id, trim(p_codigo), trim(p_nombre), p_version, 'borrador',
        trim(p_unidad_produccion), p_cantidad_produccion, coalesce(p_merma_esperada, 0), p_creado_por
    ) RETURNING id INTO v_transformacion_id;

    FOR v_component IN SELECT value FROM jsonb_array_elements(p_componentes)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.catalog_items ci
            WHERE ci.organizacion_id = p_organizacion_id
              AND ci.id = (v_component->>'catalog_item_id')::uuid
              AND ci.maneja_inventario = true
        ) THEN
            RAISE EXCEPTION 'componente_inventariable_no_encontrado' USING ERRCODE = '23503';
        END IF;
        INSERT INTO public.transformacion_componentes (
            organizacion_id, transformacion_id, catalog_item_id, cantidad_requerida,
            unidad, porcentaje_merma, orden
        ) VALUES (
            p_organizacion_id, v_transformacion_id, (v_component->>'catalog_item_id')::uuid,
            (v_component->>'cantidad_requerida')::numeric, trim(v_component->>'unidad'),
            coalesce((v_component->>'porcentaje_merma')::numeric, 0),
            coalesce((v_component->>'orden')::integer, 1)
        );
    END LOOP;

    FOR v_output IN SELECT value FROM jsonb_array_elements(p_salidas)
    LOOP
        IF coalesce((v_output->>'es_merma')::boolean, false) = false THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.catalog_items ci
                WHERE ci.organizacion_id = p_organizacion_id
                  AND ci.id = (v_output->>'catalog_item_id')::uuid
                  AND ci.maneja_inventario = true
            ) THEN
                RAISE EXCEPTION 'salida_inventariable_no_encontrada' USING ERRCODE = '23503';
            END IF;
        END IF;
        IF coalesce((v_output->>'es_merma')::boolean, false) = false THEN
            v_output_cost := v_output_cost + coalesce((v_output->>'porcentaje_costo')::numeric, 100);
        END IF;
        INSERT INTO public.transformacion_salidas (
            organizacion_id, transformacion_id, catalog_item_id, cantidad_producida,
            unidad, porcentaje_costo, es_merma, nombre_merma
        ) VALUES (
            p_organizacion_id, v_transformacion_id,
            CASE WHEN coalesce((v_output->>'es_merma')::boolean, false) THEN NULL ELSE (v_output->>'catalog_item_id')::uuid END,
            (v_output->>'cantidad_producida')::numeric, trim(v_output->>'unidad'),
            coalesce((v_output->>'porcentaje_costo')::numeric, 100),
            coalesce((v_output->>'es_merma')::boolean, false),
            NULLIF(trim(v_output->>'nombre_merma'), '')
        );
    END LOOP;

    IF v_output_cost > 100.0001 OR v_output_cost < 99.9999 THEN
        RAISE EXCEPTION 'distribucion_costo_invalida' USING ERRCODE = '22023';
    END IF;
    RETURN v_transformacion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_crear_orden_transformacion(
    p_organizacion_id uuid,
    p_transformacion_id uuid,
    p_almacen_origen_id uuid,
    p_almacen_destino_id uuid,
    p_cantidad_lotes numeric,
    p_fecha_operacion timestamptz DEFAULT now(),
    p_observaciones text DEFAULT NULL,
    p_usuario_responsable_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_formula public.transformaciones%ROWTYPE;
    v_component public.transformacion_componentes%ROWTYPE;
    v_output public.transformacion_salidas%ROWTYPE;
BEGIN
    SELECT * INTO v_formula
    FROM public.transformaciones
    WHERE organizacion_id = p_organizacion_id AND id = p_transformacion_id
      AND estado = 'activa' AND activo = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'transformacion_no_encontrada' USING ERRCODE = 'P0002'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE organizacion_id = p_organizacion_id AND id = p_almacen_origen_id AND activo) THEN
        RAISE EXCEPTION 'almacen_origen_no_encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE organizacion_id = p_organizacion_id AND id = p_almacen_destino_id AND activo) THEN
        RAISE EXCEPTION 'almacen_destino_no_encontrado' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.ordenes_transformacion (
        organizacion_id, transformacion_id, almacen_origen_id, almacen_destino_id,
        estado, cantidad_lotes, fecha_operacion, usuario_responsable_id, observaciones,
        confirmado_en
    ) VALUES (
        p_organizacion_id, p_transformacion_id, p_almacen_origen_id, p_almacen_destino_id,
        'confirmada', p_cantidad_lotes, coalesce(p_fecha_operacion, now()),
        p_usuario_responsable_id, p_observaciones, now()
    ) RETURNING id INTO v_order_id;

    FOR v_component IN SELECT * FROM public.transformacion_componentes WHERE organizacion_id = p_organizacion_id AND transformacion_id = p_transformacion_id ORDER BY orden
    LOOP
        INSERT INTO public.ordenes_transformacion_componentes (
            organizacion_id, orden_transformacion_id, catalog_item_id, cantidad_requerida, unidad
        ) VALUES (
            p_organizacion_id, v_order_id, v_component.catalog_item_id,
            v_component.cantidad_requerida * p_cantidad_lotes, v_component.unidad
        );
    END LOOP;
    FOR v_output IN SELECT * FROM public.transformacion_salidas WHERE organizacion_id = p_organizacion_id AND transformacion_id = p_transformacion_id
    LOOP
        INSERT INTO public.ordenes_transformacion_salidas (
            organizacion_id, orden_transformacion_id, catalog_item_id, cantidad_planeada,
            unidad, porcentaje_costo, es_merma, nombre_merma
        ) VALUES (
            p_organizacion_id, v_order_id, v_output.catalog_item_id,
            v_output.cantidad_producida * p_cantidad_lotes, v_output.unidad,
            v_output.porcentaje_costo, v_output.es_merma, v_output.nombre_merma
        );
    END LOOP;
    RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_ejecutar_orden_transformacion(
    p_organizacion_id uuid,
    p_orden_transformacion_id uuid,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.ordenes_transformacion%ROWTYPE;
    v_component public.ordenes_transformacion_componentes%ROWTYPE;
    v_output public.ordenes_transformacion_salidas%ROWTYPE;
    v_stock numeric;
    v_input_total numeric := 0;
    v_output_cost numeric;
    v_movement_id uuid;
BEGIN
    SELECT * INTO v_order FROM public.ordenes_transformacion
    WHERE organizacion_id = p_organizacion_id AND id = p_orden_transformacion_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'orden_transformacion_no_encontrada' USING ERRCODE = 'P0002'; END IF;
    IF v_order.estado <> 'confirmada' THEN RAISE EXCEPTION 'orden_transformacion_no_ejecutable' USING ERRCODE = '22023'; END IF;

    FOR v_component IN SELECT * FROM public.ordenes_transformacion_componentes WHERE organizacion_id = p_organizacion_id AND orden_transformacion_id = v_order.id FOR UPDATE
    LOOP
        SELECT stock_actual - stock_reservado INTO v_stock
        FROM public.inventario_existencias
        WHERE organizacion_id = p_organizacion_id AND catalog_item_id = v_component.catalog_item_id AND almacen_id = v_order.almacen_origen_id
        FOR UPDATE;
        IF coalesce(v_stock, 0) < v_component.cantidad_requerida THEN
            RAISE EXCEPTION 'inventario_insuficiente:%', v_component.catalog_item_id USING ERRCODE = '23514';
        END IF;
        SELECT coalesce(costo_promedio, costo_ultimo, 0) INTO v_component.costo_unitario
        FROM public.inventario_existencias
        WHERE organizacion_id = p_organizacion_id AND catalog_item_id = v_component.catalog_item_id AND almacen_id = v_order.almacen_origen_id;
        UPDATE public.ordenes_transformacion_componentes
        SET costo_unitario = v_component.costo_unitario
        WHERE id = v_component.id;
        v_input_total := v_input_total + v_component.cantidad_requerida * coalesce(v_component.costo_unitario, 0);
    END LOOP;

    FOR v_component IN SELECT * FROM public.ordenes_transformacion_componentes WHERE organizacion_id = p_organizacion_id AND orden_transformacion_id = v_order.id
    LOOP
        UPDATE public.inventario_existencias
        SET stock_actual = stock_actual - v_component.cantidad_requerida, actualizado_en = now()
        WHERE organizacion_id = p_organizacion_id AND catalog_item_id = v_component.catalog_item_id AND almacen_id = v_order.almacen_origen_id;
        INSERT INTO public.inventario_movimientos (
            organizacion_id, catalog_item_id, almacen_id, tipo, cantidad_salida,
            costo_unitario, costo_total, referencia_tipo, referencia_id, motivo, creado_por
        ) VALUES (
            p_organizacion_id, v_component.catalog_item_id, v_order.almacen_origen_id,
            'consumo_transformacion', v_component.cantidad_requerida, v_component.costo_unitario,
            v_component.cantidad_requerida * coalesce(v_component.costo_unitario, 0),
            'orden_transformacion', v_order.id, 'Consumo de transformación', p_usuario_id
        ) RETURNING id INTO v_movement_id;
        UPDATE public.ordenes_transformacion_componentes
        SET cantidad_consumida = cantidad_requerida, costo_unitario = v_component.costo_unitario
        WHERE id = v_component.id;
    END LOOP;

    FOR v_output IN SELECT * FROM public.ordenes_transformacion_salidas WHERE organizacion_id = p_organizacion_id AND orden_transformacion_id = v_order.id
    LOOP
        v_output_cost := CASE WHEN v_output.es_merma THEN 0 ELSE v_input_total * v_output.porcentaje_costo / 100 END;
        IF NOT v_output.es_merma THEN
            INSERT INTO public.inventario_existencias (
                organizacion_id, catalog_item_id, almacen_id, stock_actual, stock_reservado,
                costo_ultimo, costo_promedio
            ) VALUES (
                p_organizacion_id, v_output.catalog_item_id, v_order.almacen_destino_id,
                v_output.cantidad_planeada, 0, v_output_cost / NULLIF(v_output.cantidad_planeada, 0),
                v_output_cost / NULLIF(v_output.cantidad_planeada, 0)
            )
            ON CONFLICT (organizacion_id, catalog_item_id, almacen_id) DO UPDATE
            SET stock_actual = public.inventario_existencias.stock_actual + EXCLUDED.stock_actual,
                costo_ultimo = EXCLUDED.costo_ultimo,
                costo_promedio = EXCLUDED.costo_promedio,
                actualizado_en = now();
            INSERT INTO public.inventario_movimientos (
                organizacion_id, catalog_item_id, almacen_id, tipo, cantidad_entrada,
                costo_unitario, costo_total, referencia_tipo, referencia_id, motivo, creado_por
            ) VALUES (
                p_organizacion_id, v_output.catalog_item_id, v_order.almacen_destino_id,
                'produccion_transformacion', v_output.cantidad_planeada,
                v_output_cost / NULLIF(v_output.cantidad_planeada, 0), v_output_cost,
                'orden_transformacion', v_order.id, 'Producción de transformación', p_usuario_id
            );
        END IF;
        UPDATE public.ordenes_transformacion_salidas
        SET cantidad_producida = cantidad_planeada,
            costo_unitario = CASE WHEN es_merma THEN NULL ELSE v_output_cost / NULLIF(cantidad_planeada, 0) END
        WHERE id = v_output.id;
    END LOOP;

    UPDATE public.ordenes_transformacion
    SET estado = 'ejecutada', ejecutado_en = now()
    WHERE id = v_order.id;
    RETURN v_order.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_crear_transformacion(uuid, text, text, integer, text, numeric, numeric, jsonb, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_crear_orden_transformacion(uuid, uuid, uuid, uuid, numeric, timestamptz, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_ejecutar_orden_transformacion(uuid, uuid, uuid) TO service_role;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES
    ('inventory.transformations.view', 'Consultar formulas y ordenes de transformación', 583),
    ('inventory.transformations.manage', 'Administrar formulas de transformación', 584),
    ('inventory.transformations.execute', 'Ejecutar transformaciones de inventario', 585),
    ('inventory.transformations.reverse', 'Revertir transformaciones ejecutadas', 586)
ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = true, actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inventory.transformations.view'),
    ('admin_operativo', 'inventory.transformations.view'),
    ('coordinador', 'inventory.transformations.view'),
    ('owner', 'inventory.transformations.manage'),
    ('admin_operativo', 'inventory.transformations.manage'),
    ('owner', 'inventory.transformations.execute'),
    ('admin_operativo', 'inventory.transformations.execute'),
    ('owner', 'inventory.transformations.reverse'),
    ('admin_operativo', 'inventory.transformations.reverse')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT o.id, p.codigo, p.descripcion
FROM public.organizaciones o
JOIN public.tenant_default_permissions p ON p.codigo LIKE 'inventory.transformations.%'
ON CONFLICT (organizacion_id, codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion;

WITH role_scope AS (
    SELECT * FROM (VALUES
        ('inventory.transformations.view', 'owner'),
        ('inventory.transformations.view', 'admin_operativo'),
        ('inventory.transformations.view', 'coordinador'),
        ('inventory.transformations.manage', 'owner'),
        ('inventory.transformations.manage', 'admin_operativo'),
        ('inventory.transformations.execute', 'owner'),
        ('inventory.transformations.execute', 'admin_operativo'),
        ('inventory.transformations.reverse', 'owner'),
        ('inventory.transformations.reverse', 'admin_operativo')
    ) AS permissions(codigo, role_name)
)
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT role.organizacion_id, role.id, permission.id
FROM public.roles role
JOIN role_scope scope ON lower(trim(role.nombre)) = scope.role_name
JOIN public.permisos permission ON permission.organizacion_id = role.organizacion_id AND permission.codigo = scope.codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
