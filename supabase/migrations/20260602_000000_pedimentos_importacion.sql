BEGIN;

-- Pedimentos de importacion:
-- capa aduanal que agrupa varias ordenes de compra internacionales y
-- concentra los gastos del pedimento mas los gastos asociados a las ordenes.

-- ============================================================================
-- Catalogo de agentes aduanales
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agentes_aduanales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    nombre text NOT NULL,
    patente text,
    razon_social text,
    rfc text,
    contacto text,
    telefono text,
    email text,
    direccion text,
    activo boolean NOT NULL DEFAULT true,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agentes_aduanales_nombre_check CHECK (length(trim(nombre)) > 0)
);

COMMENT ON TABLE public.agentes_aduanales IS 'Catalogo de agentes aduanales reutilizable para pedimentos de importacion.';

CREATE UNIQUE INDEX IF NOT EXISTS agentes_aduanales_org_patente_unq
    ON public.agentes_aduanales (organizacion_id, lower(trim(patente)))
    WHERE patente IS NOT NULL AND length(trim(patente)) > 0;

CREATE INDEX IF NOT EXISTS agentes_aduanales_org_activo_nombre_idx
    ON public.agentes_aduanales (organizacion_id, activo, nombre);

CREATE INDEX IF NOT EXISTS agentes_aduanales_org_rfc_idx
    ON public.agentes_aduanales (organizacion_id, rfc);

ALTER TABLE public.agentes_aduanales
    ADD CONSTRAINT agentes_aduanales_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.agentes_aduanales ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_agentes_aduanales_set_org ON public.agentes_aduanales;
CREATE TRIGGER t_agentes_aduanales_set_org
    BEFORE INSERT ON public.agentes_aduanales
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_agentes_aduanales_touch_updated_at ON public.agentes_aduanales;
CREATE TRIGGER t_agentes_aduanales_touch_updated_at
    BEFORE UPDATE ON public.agentes_aduanales
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY agentes_aduanales_select_org
    ON public.agentes_aduanales
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY agentes_aduanales_write_org
    ON public.agentes_aduanales
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agentes_aduanales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agentes_aduanales TO service_role;
REVOKE ALL ON public.agentes_aduanales FROM anon;

-- ============================================================================
-- Pedimentos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pedimentos_importacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    numero_pedimento text NOT NULL,
    agente_aduanal_id uuid,
    estado text NOT NULL DEFAULT 'borrador',
    fecha_pedimento date,
    fecha_presentacion date,
    fecha_liberacion date,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    tipo_cambio numeric(14,6),
    subtotal_aduanal numeric(14,4) NOT NULL DEFAULT 0,
    gastos_pedimento_total numeric(14,4) NOT NULL DEFAULT 0,
    gastos_ordenes_total numeric(14,4) NOT NULL DEFAULT 0,
    costo_total_prorrateable numeric(14,4) NOT NULL DEFAULT 0,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedimentos_importacion_estado_check CHECK (
        estado = ANY (ARRAY[
            'borrador'::text,
            'en_integracion'::text,
            'presentado'::text,
            'pagado'::text,
            'cerrado'::text,
            'cancelado'::text
        ])
    ),
    CONSTRAINT pedimentos_importacion_numero_check CHECK (length(trim(numero_pedimento)) > 0),
    CONSTRAINT pedimentos_importacion_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT pedimentos_importacion_totales_check CHECK (
        subtotal_aduanal >= 0
        AND gastos_pedimento_total >= 0
        AND gastos_ordenes_total >= 0
        AND costo_total_prorrateable >= 0
    ),
    CONSTRAINT pedimentos_importacion_tipo_cambio_check CHECK (tipo_cambio IS NULL OR tipo_cambio > 0)
);

COMMENT ON TABLE public.pedimentos_importacion IS 'Cabecera del pedimento de importacion que agrupa varias ordenes internacionales.';

CREATE UNIQUE INDEX IF NOT EXISTS pedimentos_importacion_org_numero_unq
    ON public.pedimentos_importacion (organizacion_id, lower(trim(numero_pedimento)));

CREATE INDEX IF NOT EXISTS pedimentos_importacion_org_estado_fecha_idx
    ON public.pedimentos_importacion (organizacion_id, estado, fecha_pedimento DESC);

CREATE INDEX IF NOT EXISTS pedimentos_importacion_org_agente_idx
    ON public.pedimentos_importacion (organizacion_id, agente_aduanal_id);

ALTER TABLE public.pedimentos_importacion
    ADD CONSTRAINT pedimentos_importacion_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion
    ADD CONSTRAINT pedimentos_importacion_agente_aduanal_id_fkey
    FOREIGN KEY (agente_aduanal_id) REFERENCES public.agentes_aduanales(id) ON DELETE SET NULL;

ALTER TABLE public.pedimentos_importacion
    ADD CONSTRAINT pedimentos_importacion_moneda_fkey
    FOREIGN KEY (moneda) REFERENCES public.monedas(codigo) ON DELETE RESTRICT;

ALTER TABLE public.pedimentos_importacion ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_pedimentos_importacion_set_org ON public.pedimentos_importacion;
CREATE TRIGGER t_pedimentos_importacion_set_org
    BEFORE INSERT ON public.pedimentos_importacion
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_pedimentos_importacion_touch_updated_at ON public.pedimentos_importacion;
CREATE TRIGGER t_pedimentos_importacion_touch_updated_at
    BEFORE UPDATE ON public.pedimentos_importacion
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY pedimentos_importacion_select_org
    ON public.pedimentos_importacion
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY pedimentos_importacion_write_org
    ON public.pedimentos_importacion
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedimentos_importacion TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedimentos_importacion TO service_role;
REVOKE ALL ON public.pedimentos_importacion FROM anon;

COMMENT ON COLUMN public.pedimentos_importacion.gastos_pedimento_total IS 'Total en moneda base de los gastos inherentes al pedimento.';
COMMENT ON COLUMN public.pedimentos_importacion.gastos_ordenes_total IS 'Total en moneda base de los gastos tipo gasto asociados a las ordenes ligadas.';
COMMENT ON COLUMN public.pedimentos_importacion.costo_total_prorrateable IS 'Total global que se prorratea entre todos los items del pedimento.';

-- ============================================================================
-- Relacion pedimento <-> ordenes de compra
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pedimentos_importacion_ordenes_compra (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    pedimento_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    rol text NOT NULL DEFAULT 'principal',
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedimentos_importacion_ordenes_compra_rol_check CHECK (
        rol = ANY (ARRAY['principal'::text, 'complementaria'::text, 'parcial'::text])
    )
);

COMMENT ON TABLE public.pedimentos_importacion_ordenes_compra IS 'Relacion entre un pedimento y las ordenes de compra internacionales incluidas.';

CREATE UNIQUE INDEX IF NOT EXISTS pedimentos_importacion_ordenes_compra_unq
    ON public.pedimentos_importacion_ordenes_compra (pedimento_id, orden_compra_id);

CREATE INDEX IF NOT EXISTS pedimentos_importacion_ordenes_compra_org_pedimento_idx
    ON public.pedimentos_importacion_ordenes_compra (organizacion_id, pedimento_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS pedimentos_importacion_ordenes_compra_org_orden_idx
    ON public.pedimentos_importacion_ordenes_compra (organizacion_id, orden_compra_id);

ALTER TABLE public.pedimentos_importacion_ordenes_compra
    ADD CONSTRAINT pedimentos_importacion_ordenes_compra_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_ordenes_compra
    ADD CONSTRAINT pedimentos_importacion_ordenes_compra_pedimento_id_fkey
    FOREIGN KEY (pedimento_id) REFERENCES public.pedimentos_importacion(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_ordenes_compra
    ADD CONSTRAINT pedimentos_importacion_ordenes_compra_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_ordenes_compra ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_pedimentos_importacion_ordenes_compra_set_org ON public.pedimentos_importacion_ordenes_compra;
CREATE TRIGGER t_pedimentos_importacion_ordenes_compra_set_org
    BEFORE INSERT ON public.pedimentos_importacion_ordenes_compra
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_pedimentos_importacion_ordenes_compra_touch_updated_at ON public.pedimentos_importacion_ordenes_compra;
CREATE TRIGGER t_pedimentos_importacion_ordenes_compra_touch_updated_at
    BEFORE UPDATE ON public.pedimentos_importacion_ordenes_compra
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY pedimentos_importacion_ordenes_compra_select_org
    ON public.pedimentos_importacion_ordenes_compra
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY pedimentos_importacion_ordenes_compra_write_org
    ON public.pedimentos_importacion_ordenes_compra
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedimentos_importacion_ordenes_compra TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedimentos_importacion_ordenes_compra TO service_role;
REVOKE ALL ON public.pedimentos_importacion_ordenes_compra FROM anon;

-- ============================================================================
-- Gastos del pedimento
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pedimentos_importacion_gastos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    pedimento_id uuid NOT NULL,
    tipo_gasto text NOT NULL,
    descripcion text,
    monto numeric(14,4) NOT NULL,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    tipo_cambio numeric(14,6) NOT NULL DEFAULT 1,
    monto_mxn numeric(14,4) GENERATED ALWAYS AS (round((coalesce(monto, 0) * coalesce(tipo_cambio, 1))::numeric, 4)) STORED,
    fecha_gasto date,
    referencia_factura text,
    archivo_id uuid,
    estado text NOT NULL DEFAULT 'registrado',
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedimentos_importacion_gastos_tipo_check CHECK (length(trim(tipo_gasto)) > 0),
    CONSTRAINT pedimentos_importacion_gastos_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT pedimentos_importacion_gastos_monto_check CHECK (monto >= 0),
    CONSTRAINT pedimentos_importacion_gastos_tipo_cambio_check CHECK (tipo_cambio > 0),
    CONSTRAINT pedimentos_importacion_gastos_estado_check CHECK (
        estado = ANY (ARRAY['pendiente'::text, 'registrado'::text, 'pagado'::text, 'cancelado'::text])
    )
);

COMMENT ON TABLE public.pedimentos_importacion_gastos IS 'Gastos inherentes al pedimento que forman parte del costo compartido.';

CREATE INDEX IF NOT EXISTS pedimentos_importacion_gastos_org_pedimento_idx
    ON public.pedimentos_importacion_gastos (organizacion_id, pedimento_id, estado, fecha_gasto DESC);

CREATE INDEX IF NOT EXISTS pedimentos_importacion_gastos_org_tipo_idx
    ON public.pedimentos_importacion_gastos (organizacion_id, tipo_gasto, estado);

ALTER TABLE public.pedimentos_importacion_gastos
    ADD CONSTRAINT pedimentos_importacion_gastos_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_gastos
    ADD CONSTRAINT pedimentos_importacion_gastos_pedimento_id_fkey
    FOREIGN KEY (pedimento_id) REFERENCES public.pedimentos_importacion(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_gastos
    ADD CONSTRAINT pedimentos_importacion_gastos_moneda_fkey
    FOREIGN KEY (moneda) REFERENCES public.monedas(codigo) ON DELETE RESTRICT;

ALTER TABLE public.pedimentos_importacion_gastos
    ADD CONSTRAINT pedimentos_importacion_gastos_archivo_id_fkey
    FOREIGN KEY (archivo_id) REFERENCES public.archivos(id) ON DELETE SET NULL;

ALTER TABLE public.pedimentos_importacion_gastos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_pedimentos_importacion_gastos_set_org ON public.pedimentos_importacion_gastos;
CREATE TRIGGER t_pedimentos_importacion_gastos_set_org
    BEFORE INSERT ON public.pedimentos_importacion_gastos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_pedimentos_importacion_gastos_touch_updated_at ON public.pedimentos_importacion_gastos;
CREATE TRIGGER t_pedimentos_importacion_gastos_touch_updated_at
    BEFORE UPDATE ON public.pedimentos_importacion_gastos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY pedimentos_importacion_gastos_select_org
    ON public.pedimentos_importacion_gastos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY pedimentos_importacion_gastos_write_org
    ON public.pedimentos_importacion_gastos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedimentos_importacion_gastos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedimentos_importacion_gastos TO service_role;
REVOKE ALL ON public.pedimentos_importacion_gastos FROM anon;

-- ============================================================================
-- Prorrateo por item
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pedimentos_importacion_prorrateos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    pedimento_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    orden_compra_item_id uuid NOT NULL,
    base_prorrateo text NOT NULL DEFAULT 'valor',
    base_item numeric(14,6) NOT NULL DEFAULT 0,
    base_total numeric(14,6) NOT NULL DEFAULT 0,
    porcentaje_prorrateo numeric(14,8) NOT NULL DEFAULT 0,
    costo_pedimento_asignado numeric(14,4) NOT NULL DEFAULT 0,
    costo_orden_asignado numeric(14,4) NOT NULL DEFAULT 0,
    costo_total_asignado numeric(14,4) NOT NULL DEFAULT 0,
    costo_unitario_adicional numeric(14,4) NOT NULL DEFAULT 0,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedimentos_importacion_prorrateos_base_check CHECK (
        base_prorrateo = ANY (ARRAY['valor'::text, 'peso'::text, 'volumen'::text, 'mixto'::text])
    ),
    CONSTRAINT pedimentos_importacion_prorrateos_base_item_check CHECK (base_item >= 0),
    CONSTRAINT pedimentos_importacion_prorrateos_base_total_check CHECK (base_total >= 0),
    CONSTRAINT pedimentos_importacion_prorrateos_porcentaje_check CHECK (porcentaje_prorrateo >= 0 AND porcentaje_prorrateo <= 1),
    CONSTRAINT pedimentos_importacion_prorrateos_costos_check CHECK (
        costo_pedimento_asignado >= 0
        AND costo_orden_asignado >= 0
        AND costo_total_asignado >= 0
        AND costo_unitario_adicional >= 0
    )
);

COMMENT ON TABLE public.pedimentos_importacion_prorrateos IS 'Detalle calculado del prorrateo de costos compartidos por item del pedimento.';

CREATE UNIQUE INDEX IF NOT EXISTS pedimentos_importacion_prorrateos_unq
    ON public.pedimentos_importacion_prorrateos (pedimento_id, orden_compra_item_id);

CREATE INDEX IF NOT EXISTS pedimentos_importacion_prorrateos_org_pedimento_idx
    ON public.pedimentos_importacion_prorrateos (organizacion_id, pedimento_id, orden_compra_id);

CREATE INDEX IF NOT EXISTS pedimentos_importacion_prorrateos_org_item_idx
    ON public.pedimentos_importacion_prorrateos (organizacion_id, orden_compra_item_id);

ALTER TABLE public.pedimentos_importacion_prorrateos
    ADD CONSTRAINT pedimentos_importacion_prorrateos_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_prorrateos
    ADD CONSTRAINT pedimentos_importacion_prorrateos_pedimento_id_fkey
    FOREIGN KEY (pedimento_id) REFERENCES public.pedimentos_importacion(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_prorrateos
    ADD CONSTRAINT pedimentos_importacion_prorrateos_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_prorrateos
    ADD CONSTRAINT pedimentos_importacion_prorrateos_orden_compra_item_id_fkey
    FOREIGN KEY (orden_compra_item_id) REFERENCES public.ordenes_compra_items(id) ON DELETE CASCADE;

ALTER TABLE public.pedimentos_importacion_prorrateos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_pedimentos_importacion_prorrateos_set_org ON public.pedimentos_importacion_prorrateos;
CREATE TRIGGER t_pedimentos_importacion_prorrateos_set_org
    BEFORE INSERT ON public.pedimentos_importacion_prorrateos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_pedimentos_importacion_prorrateos_touch_updated_at ON public.pedimentos_importacion_prorrateos;
CREATE TRIGGER t_pedimentos_importacion_prorrateos_touch_updated_at
    BEFORE UPDATE ON public.pedimentos_importacion_prorrateos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY pedimentos_importacion_prorrateos_select_org
    ON public.pedimentos_importacion_prorrateos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY pedimentos_importacion_prorrateos_write_org
    ON public.pedimentos_importacion_prorrateos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedimentos_importacion_prorrateos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedimentos_importacion_prorrateos TO service_role;
REVOKE ALL ON public.pedimentos_importacion_prorrateos FROM anon;

-- ============================================================================
-- Integridad de organizacion entre pedimento, orden y agente
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_validate_pedimentos_importacion_org_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org uuid;
    v_item_org uuid;
    v_item_orden_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'pedimentos_importacion' THEN
        IF NEW.agente_aduanal_id IS NOT NULL THEN
            SELECT organizacion_id
            INTO v_org
            FROM public.agentes_aduanales
            WHERE id = NEW.agente_aduanal_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Agente aduanal no encontrado';
            END IF;

            IF v_org <> NEW.organizacion_id THEN
                RAISE EXCEPTION 'El agente aduanal debe pertenecer a la misma organizacion';
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'pedimentos_importacion_ordenes_compra' THEN
        SELECT organizacion_id
        INTO v_org
        FROM public.pedimentos_importacion
        WHERE id = NEW.pedimento_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Pedimento no encontrado';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'El pedimento debe pertenecer a la misma organizacion';
        END IF;

        SELECT organizacion_id
        INTO v_org
        FROM public.ordenes_compra
        WHERE id = NEW.orden_compra_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Orden de compra no encontrada';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'La orden de compra debe pertenecer a la misma organizacion';
        END IF;
    ELSIF TG_TABLE_NAME = 'pedimentos_importacion_gastos' THEN
        SELECT organizacion_id
        INTO v_org
        FROM public.pedimentos_importacion
        WHERE id = NEW.pedimento_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Pedimento no encontrado';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'El gasto debe pertenecer a la misma organizacion que el pedimento';
        END IF;
    ELSIF TG_TABLE_NAME = 'pedimentos_importacion_prorrateos' THEN
        SELECT organizacion_id
        INTO v_org
        FROM public.pedimentos_importacion
        WHERE id = NEW.pedimento_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Pedimento no encontrado';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'El prorrateo debe pertenecer a la misma organizacion que el pedimento';
        END IF;

        SELECT organizacion_id, orden_compra_id
        INTO v_item_org, v_item_orden_id
        FROM public.ordenes_compra_items
        WHERE id = NEW.orden_compra_item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item de orden de compra no encontrado';
        END IF;

        IF v_item_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'El item debe pertenecer a la misma organizacion';
        END IF;

        IF v_item_orden_id <> NEW.orden_compra_id THEN
            RAISE EXCEPTION 'El item no corresponde a la orden de compra indicada';
        END IF;

        SELECT organizacion_id
        INTO v_org
        FROM public.ordenes_compra
        WHERE id = NEW.orden_compra_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Orden de compra no encontrada';
        END IF;

        IF v_org <> NEW.organizacion_id THEN
            RAISE EXCEPTION 'La orden de compra debe pertenecer a la misma organizacion';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_pedimentos_importacion_validate_org ON public.pedimentos_importacion;
CREATE TRIGGER t_pedimentos_importacion_validate_org
    BEFORE INSERT OR UPDATE ON public.pedimentos_importacion
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_validate_pedimentos_importacion_org_integrity();

DROP TRIGGER IF EXISTS t_pedimentos_importacion_ordenes_compra_validate_org ON public.pedimentos_importacion_ordenes_compra;
CREATE TRIGGER t_pedimentos_importacion_ordenes_compra_validate_org
    BEFORE INSERT OR UPDATE ON public.pedimentos_importacion_ordenes_compra
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_validate_pedimentos_importacion_org_integrity();

DROP TRIGGER IF EXISTS t_pedimentos_importacion_gastos_validate_org ON public.pedimentos_importacion_gastos;
CREATE TRIGGER t_pedimentos_importacion_gastos_validate_org
    BEFORE INSERT OR UPDATE ON public.pedimentos_importacion_gastos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_validate_pedimentos_importacion_org_integrity();

DROP TRIGGER IF EXISTS t_pedimentos_importacion_prorrateos_validate_org ON public.pedimentos_importacion_prorrateos;
CREATE TRIGGER t_pedimentos_importacion_prorrateos_validate_org
    BEFORE INSERT OR UPDATE ON public.pedimentos_importacion_prorrateos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_validate_pedimentos_importacion_org_integrity();

-- ============================================================================
-- Vistas auxiliares
-- ============================================================================

CREATE OR REPLACE VIEW public.pedimentos_importacion_items_v AS
SELECT
    rel.organizacion_id,
    rel.pedimento_id,
    rel.orden_compra_id,
    oc.folio AS orden_folio,
    item.id AS orden_compra_item_id,
    item.numero_partida,
    item.catalog_item_id,
    item.proveedor_item_id,
    item.sku,
    item.descripcion,
    item.marca,
    item.modelo,
    item.fabricante,
    item.pais_origen_codigo_iso2,
    item.pais_procedencia_codigo_iso2,
    item.fraccion_arancelaria,
    item.hs_code,
    item.nico,
    item.cantidad_solicitada,
    item.cantidad_recibida,
    item.unidad,
    item.precio_unitario,
    item.descuento_porcentaje,
    item.subtotal,
    item.impuestos,
    item.total,
    item.peso_neto,
    item.peso_bruto,
    item.volumen_cbm,
    item.lote,
    item.numero_serie,
    item.fecha_caducidad,
    item.observaciones,
    item.creado_en,
    item.actualizado_en
FROM public.pedimentos_importacion_ordenes_compra rel
JOIN public.ordenes_compra oc
    ON oc.id = rel.orden_compra_id
JOIN public.ordenes_compra_items item
    ON item.orden_compra_id = rel.orden_compra_id
   AND item.organizacion_id = rel.organizacion_id;

COMMENT ON VIEW public.pedimentos_importacion_items_v IS 'Vista de items incluidos en cada pedimento a partir de las ordenes ligadas.';

CREATE OR REPLACE VIEW public.pedimentos_importacion_gastos_ordenes_v AS
SELECT
    rel.organizacion_id,
    rel.pedimento_id,
    rel.orden_compra_id,
    pago.id AS orden_compra_pago_programado_id,
    pago.tipo_pago,
    pago.evento_base,
    pago.monto,
    pago.moneda_codigo,
    pago.estado,
    pago.fecha_evento_real,
    pago.fecha_pago_real,
    pago.referencia_pago,
    pago.observaciones,
    pago.creado_en,
    pago.actualizado_en
FROM public.pedimentos_importacion_ordenes_compra rel
JOIN public.ordenes_compra_pagos_programados pago
    ON pago.organizacion_id = rel.organizacion_id
   AND pago.orden_compra_id = rel.orden_compra_id
WHERE pago.tipo_pago = 'parcial'
  AND pago.evento_base = 'gasto_adicional'
  AND pago.estado <> 'cancelado';

COMMENT ON VIEW public.pedimentos_importacion_gastos_ordenes_v IS 'Vista de movimientos de gasto adicionales de las ordenes que participan en un pedimento.';

GRANT SELECT ON public.pedimentos_importacion_items_v TO authenticated;
GRANT SELECT ON public.pedimentos_importacion_items_v TO service_role;
REVOKE ALL ON public.pedimentos_importacion_items_v FROM anon;

GRANT SELECT ON public.pedimentos_importacion_gastos_ordenes_v TO authenticated;
GRANT SELECT ON public.pedimentos_importacion_gastos_ordenes_v TO service_role;
REVOKE ALL ON public.pedimentos_importacion_gastos_ordenes_v FROM anon;

COMMIT;
