BEGIN;

-- Fase 2: proveedores y compras.
-- Objetivo:
-- - administrar proveedores vinculados a cuentas/personas;
-- - relacionar productos con proveedores;
-- - crear ordenes de compra con sus lineas.

CREATE TABLE IF NOT EXISTS public.proveedores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    cuenta_id uuid,
    codigo_proveedor text NOT NULL,
    razon_social text NOT NULL,
    nombre_comercial text,
    rfc text,
    correo text,
    telefono text,
    contacto_principal_persona_id uuid,
    plazo_pago_dias integer,
    plazo_entrega_dias integer,
    limite_credito numeric(14,2),
    moneda_preferida character(3) NOT NULL DEFAULT 'MXN',
    activo boolean NOT NULL DEFAULT true,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT proveedores_moneda_check CHECK (char_length(moneda_preferida) = 3),
    CONSTRAINT proveedores_plazo_pago_check CHECK (plazo_pago_dias IS NULL OR plazo_pago_dias >= 0),
    CONSTRAINT proveedores_plazo_entrega_check CHECK (plazo_entrega_dias IS NULL OR plazo_entrega_dias >= 0),
    CONSTRAINT proveedores_limite_credito_check CHECK (limite_credito IS NULL OR limite_credito >= 0)
);

COMMENT ON TABLE public.proveedores IS 'Proveedores de compra vinculados al tenant y opcionalmente a una cuenta CRM.';

CREATE UNIQUE INDEX IF NOT EXISTS proveedores_org_codigo_unq
    ON public.proveedores (organizacion_id, codigo_proveedor);

CREATE UNIQUE INDEX IF NOT EXISTS proveedores_org_cuenta_unq
    ON public.proveedores (organizacion_id, cuenta_id)
    WHERE cuenta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS proveedores_org_activo_idx
    ON public.proveedores (organizacion_id, activo, codigo_proveedor);

CREATE INDEX IF NOT EXISTS proveedores_contacto_idx
    ON public.proveedores (organizacion_id, contacto_principal_persona_id);

CREATE TABLE IF NOT EXISTS public.proveedor_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    proveedor_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    sku_proveedor text,
    nombre_proveedor text,
    costo_ultimo numeric(14,4),
    costo_referencial numeric(14,4),
    moneda character(3) NOT NULL DEFAULT 'MXN',
    compra_minima numeric(14,3),
    lead_time_dias integer,
    es_principal boolean NOT NULL DEFAULT false,
    vigente_desde date,
    vigente_hasta date,
    activo boolean NOT NULL DEFAULT true,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT proveedor_items_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT proveedor_items_costo_ultimo_check CHECK (costo_ultimo IS NULL OR costo_ultimo >= 0),
    CONSTRAINT proveedor_items_costo_ref_check CHECK (costo_referencial IS NULL OR costo_referencial >= 0),
    CONSTRAINT proveedor_items_compra_minima_check CHECK (compra_minima IS NULL OR compra_minima >= 0),
    CONSTRAINT proveedor_items_lead_time_check CHECK (lead_time_dias IS NULL OR lead_time_dias >= 0),
    CONSTRAINT proveedor_items_vigencia_check CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde)
);

COMMENT ON TABLE public.proveedor_items IS 'Catalogo de productos que ofrece cada proveedor con condiciones de compra.';

CREATE UNIQUE INDEX IF NOT EXISTS proveedor_items_org_proveedor_item_unq
    ON public.proveedor_items (organizacion_id, proveedor_id, catalog_item_id);

CREATE INDEX IF NOT EXISTS proveedor_items_org_item_idx
    ON public.proveedor_items (organizacion_id, catalog_item_id, activo);

CREATE INDEX IF NOT EXISTS proveedor_items_org_proveedor_idx
    ON public.proveedor_items (organizacion_id, proveedor_id, activo);

CREATE TABLE IF NOT EXISTS public.ordenes_compra (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    folio text NOT NULL,
    proveedor_id uuid NOT NULL,
    almacen_destino_id uuid NOT NULL,
    estado text NOT NULL DEFAULT 'borrador',
    fecha_emision timestamptz NOT NULL DEFAULT now(),
    fecha_entrega_estimada date,
    moneda character(3) NOT NULL DEFAULT 'MXN',
    subtotal numeric(14,4) NOT NULL DEFAULT 0,
    descuento_total numeric(14,4) NOT NULL DEFAULT 0,
    impuestos_total numeric(14,4) NOT NULL DEFAULT 0,
    total numeric(14,4) NOT NULL DEFAULT 0,
    solicitado_por_usuario_id uuid,
    aprobado_por_usuario_id uuid,
    referencia_externa text,
    observaciones text,
    instrucciones_entrega text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ordenes_compra_estado_check CHECK (
        estado = ANY (ARRAY[
            'borrador'::text,
            'enviada'::text,
            'aprobada'::text,
            'parcial'::text,
            'recibida'::text,
            'cerrada'::text,
            'cancelada'::text
        ])
    ),
    CONSTRAINT ordenes_compra_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT ordenes_compra_totales_check CHECK (
        subtotal >= 0
        AND descuento_total >= 0
        AND impuestos_total >= 0
        AND total >= 0
    )
);

COMMENT ON TABLE public.ordenes_compra IS 'Encabezado de ordenes de compra por proveedor y almacen destino.';

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_compra_org_folio_unq
    ON public.ordenes_compra (organizacion_id, folio);

CREATE INDEX IF NOT EXISTS ordenes_compra_org_estado_fecha_idx
    ON public.ordenes_compra (organizacion_id, estado, fecha_emision DESC);

CREATE INDEX IF NOT EXISTS ordenes_compra_org_proveedor_idx
    ON public.ordenes_compra (organizacion_id, proveedor_id, fecha_emision DESC);

CREATE INDEX IF NOT EXISTS ordenes_compra_org_almacen_idx
    ON public.ordenes_compra (organizacion_id, almacen_destino_id, fecha_emision DESC);

CREATE TABLE IF NOT EXISTS public.ordenes_compra_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    proveedor_item_id uuid,
    cantidad_solicitada numeric(14,3) NOT NULL,
    cantidad_recibida numeric(14,3) NOT NULL DEFAULT 0,
    unidad text NOT NULL DEFAULT 'unidad',
    costo_unitario numeric(14,4) NOT NULL,
    descuento_porcentaje numeric(5,2),
    subtotal numeric(14,4) NOT NULL,
    impuestos numeric(14,4) NOT NULL DEFAULT 0,
    total numeric(14,4) NOT NULL,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ordenes_compra_items_cantidad_check CHECK (cantidad_solicitada > 0 AND cantidad_recibida >= 0 AND cantidad_recibida <= cantidad_solicitada),
    CONSTRAINT ordenes_compra_items_unidad_check CHECK (length(trim(unidad)) > 0),
    CONSTRAINT ordenes_compra_items_costo_check CHECK (costo_unitario >= 0),
    CONSTRAINT ordenes_compra_items_descuento_check CHECK (descuento_porcentaje IS NULL OR (descuento_porcentaje >= 0 AND descuento_porcentaje <= 100)),
    CONSTRAINT ordenes_compra_items_totales_check CHECK (subtotal >= 0 AND impuestos >= 0 AND total >= 0)
);

COMMENT ON TABLE public.ordenes_compra_items IS 'Lineas de detalle de cada orden de compra.';

CREATE INDEX IF NOT EXISTS ordenes_compra_items_org_orden_idx
    ON public.ordenes_compra_items (organizacion_id, orden_compra_id);

CREATE INDEX IF NOT EXISTS ordenes_compra_items_org_item_idx
    ON public.ordenes_compra_items (organizacion_id, catalog_item_id);

CREATE INDEX IF NOT EXISTS ordenes_compra_items_org_proveedor_item_idx
    ON public.ordenes_compra_items (organizacion_id, proveedor_item_id);

ALTER TABLE public.proveedores
    ADD CONSTRAINT proveedores_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.proveedores
    ADD CONSTRAINT proveedores_cuenta_id_fkey
    FOREIGN KEY (cuenta_id) REFERENCES public.cuentas(id) ON DELETE SET NULL;

ALTER TABLE public.proveedores
    ADD CONSTRAINT proveedores_contacto_principal_persona_id_fkey
    FOREIGN KEY (contacto_principal_persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;

ALTER TABLE public.proveedor_items
    ADD CONSTRAINT proveedor_items_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.proveedor_items
    ADD CONSTRAINT proveedor_items_proveedor_id_fkey
    FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE CASCADE;

ALTER TABLE public.proveedor_items
    ADD CONSTRAINT proveedor_items_catalog_item_id_fkey
    FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE RESTRICT;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_proveedor_id_fkey
    FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE RESTRICT;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_almacen_destino_id_fkey
    FOREIGN KEY (almacen_destino_id) REFERENCES public.almacenes(id) ON DELETE RESTRICT;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_solicitado_por_usuario_id_fkey
    FOREIGN KEY (solicitado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_aprobado_por_usuario_id_fkey
    FOREIGN KEY (aprobado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_catalog_item_id_fkey
    FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE RESTRICT;

ALTER TABLE public.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_proveedor_item_id_fkey
    FOREIGN KEY (proveedor_item_id) REFERENCES public.proveedor_items(id) ON DELETE SET NULL;

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedor_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra_items ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_proveedores_set_org ON public.proveedores;
CREATE TRIGGER t_proveedores_set_org
    BEFORE INSERT ON public.proveedores
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_proveedor_items_set_org ON public.proveedor_items;
CREATE TRIGGER t_proveedor_items_set_org
    BEFORE INSERT ON public.proveedor_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_ordenes_compra_set_org ON public.ordenes_compra;
CREATE TRIGGER t_ordenes_compra_set_org
    BEFORE INSERT ON public.ordenes_compra
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_ordenes_compra_items_set_org ON public.ordenes_compra_items;
CREATE TRIGGER t_ordenes_compra_items_set_org
    BEFORE INSERT ON public.ordenes_compra_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_proveedores_touch_updated_at ON public.proveedores;
CREATE TRIGGER t_proveedores_touch_updated_at
    BEFORE UPDATE ON public.proveedores
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS t_proveedor_items_touch_updated_at ON public.proveedor_items;
CREATE TRIGGER t_proveedor_items_touch_updated_at
    BEFORE UPDATE ON public.proveedor_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS t_ordenes_compra_touch_updated_at ON public.ordenes_compra;
CREATE TRIGGER t_ordenes_compra_touch_updated_at
    BEFORE UPDATE ON public.ordenes_compra
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS t_ordenes_compra_items_touch_updated_at ON public.ordenes_compra_items;
CREATE TRIGGER t_ordenes_compra_items_touch_updated_at
    BEFORE UPDATE ON public.ordenes_compra_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY proveedores_select_org
    ON public.proveedores
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY proveedores_write_org
    ON public.proveedores
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY proveedor_items_select_org
    ON public.proveedor_items
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY proveedor_items_write_org
    ON public.proveedor_items
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_select_org
    ON public.ordenes_compra
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_write_org
    ON public.ordenes_compra
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_items_select_org
    ON public.ordenes_compra_items
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_items_write_org
    ON public.ordenes_compra_items
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

ALTER TABLE public.catalog_items
    ADD CONSTRAINT catalog_items_proveedor_principal_id_fkey
    FOREIGN KEY (proveedor_principal_id) REFERENCES public.proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS catalog_items_proveedor_principal_idx
    ON public.catalog_items (proveedor_principal_id);

COMMIT;
