BEGIN;

-- A client can have many commercial opportunities. The client remains the
-- master entity; the opportunity stores the historical customer relation.
ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS cliente_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'oportunidades_cliente_org_fkey'
    ) THEN
        ALTER TABLE public.oportunidades
            ADD CONSTRAINT oportunidades_cliente_org_fkey
            FOREIGN KEY (organizacion_id, cliente_id)
            REFERENCES public.clientes (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS oportunidades_org_cliente_idx
    ON public.oportunidades (organizacion_id, cliente_id, creado_en DESC)
    WHERE cliente_id IS NOT NULL;

-- Backfill won opportunities belonging to an existing client. Open and lost
-- opportunities remain prospects and must not become customer history.
UPDATE public.oportunidades o
   SET cliente_id = c.id
  FROM public.clientes c
 WHERE c.organizacion_id = o.organizacion_id
   AND c.contacto_id = o.contacto_principal_id
   AND o.estado = 'ganada'
   AND o.cliente_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cotizaciones_one_accepted_per_opportunity_uidx
    ON public.cotizaciones (organizacion_id, oportunidad_id)
    WHERE lower(estatus) = 'aceptada' AND oportunidad_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ventas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    cuenta_id uuid NOT NULL,
    oportunidad_id uuid NOT NULL,
    cotizacion_id uuid NOT NULL,
    estatus text NOT NULL DEFAULT 'pendiente_pago',
    subtotal numeric(14, 2) NOT NULL DEFAULT 0,
    impuestos numeric(14, 2) NOT NULL DEFAULT 0,
    total numeric(14, 2) NOT NULL,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    fecha_venta timestamptz NOT NULL DEFAULT now(),
    fecha_pago_completo timestamptz,
    creado_por_usuario_id uuid,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ventas_estatus_check CHECK (estatus IN (
        'pendiente_pago', 'pago_parcial', 'pagada', 'cancelada', 'reembolsada'
    )),
    CONSTRAINT ventas_subtotal_check CHECK (subtotal >= 0),
    CONSTRAINT ventas_impuestos_check CHECK (impuestos >= 0),
    CONSTRAINT ventas_total_check CHECK (total >= 0),
    CONSTRAINT ventas_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT ventas_org_id_key UNIQUE (organizacion_id, id),
    CONSTRAINT ventas_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT ventas_cliente_org_fkey FOREIGN KEY (organizacion_id, cliente_id)
        REFERENCES public.clientes (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT ventas_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id)
        REFERENCES public.cuentas (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT ventas_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id)
        REFERENCES public.oportunidades (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT ventas_cotizacion_org_fkey FOREIGN KEY (organizacion_id, cotizacion_id)
        REFERENCES public.cotizaciones (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT ventas_usuario_org_fkey FOREIGN KEY (organizacion_id, creado_por_usuario_id)
        REFERENCES public.usuarios (organizacion_id, id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ventas_org_oportunidad_uidx
    ON public.ventas (organizacion_id, oportunidad_id);

CREATE UNIQUE INDEX IF NOT EXISTS ventas_org_cotizacion_uidx
    ON public.ventas (organizacion_id, cotizacion_id);

CREATE INDEX IF NOT EXISTS ventas_org_cliente_fecha_idx
    ON public.ventas (organizacion_id, cliente_id, fecha_venta DESC);

CREATE INDEX IF NOT EXISTS ventas_org_estatus_fecha_idx
    ON public.ventas (organizacion_id, estatus, fecha_venta DESC);

CREATE TABLE IF NOT EXISTS public.venta_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    venta_id uuid NOT NULL,
    catalog_item_id uuid,
    descripcion text NOT NULL,
    cantidad numeric(14, 4) NOT NULL,
    precio_unitario numeric(14, 2) NOT NULL,
    descuento_monto numeric(14, 2) NOT NULL DEFAULT 0,
    impuestos numeric(14, 2) NOT NULL DEFAULT 0,
    subtotal numeric(14, 2) NOT NULL,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    orden integer NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT venta_items_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT venta_items_venta_org_fkey FOREIGN KEY (organizacion_id, venta_id)
        REFERENCES public.ventas (organizacion_id, id) ON DELETE CASCADE,
    CONSTRAINT venta_items_cantidad_check CHECK (cantidad > 0),
    CONSTRAINT venta_items_precio_check CHECK (precio_unitario >= 0),
    CONSTRAINT venta_items_descuento_check CHECK (descuento_monto >= 0),
    CONSTRAINT venta_items_impuestos_check CHECK (impuestos >= 0),
    CONSTRAINT venta_items_subtotal_check CHECK (subtotal >= 0),
    CONSTRAINT venta_items_moneda_check CHECK (char_length(moneda) = 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS venta_items_org_id_key
    ON public.venta_items (organizacion_id, id);

CREATE INDEX IF NOT EXISTS venta_items_org_venta_orden_idx
    ON public.venta_items (organizacion_id, venta_id, orden);

CREATE TABLE IF NOT EXISTS public.pagos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    venta_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    cuenta_id uuid NOT NULL,
    oportunidad_id uuid NOT NULL,
    monto numeric(14, 2) NOT NULL,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    tipo_pago text NOT NULL DEFAULT 'parcial',
    estatus text NOT NULL DEFAULT 'registrado',
    fecha_pago timestamptz NOT NULL DEFAULT now(),
    fecha_confirmacion timestamptz,
    metodo_pago text,
    referencia_pago text,
    registrado_por_usuario_id uuid,
    notas text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pagos_monto_check CHECK (monto > 0),
    CONSTRAINT pagos_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT pagos_tipo_check CHECK (tipo_pago IN ('anticipo', 'parcial', 'liquidacion', 'otro')),
    CONSTRAINT pagos_estatus_check CHECK (estatus IN ('registrado', 'confirmado', 'rechazado', 'reembolsado', 'cancelado')),
    CONSTRAINT pagos_org_fkey FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT pagos_venta_org_fkey FOREIGN KEY (organizacion_id, venta_id)
        REFERENCES public.ventas (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pagos_cliente_org_fkey FOREIGN KEY (organizacion_id, cliente_id)
        REFERENCES public.clientes (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pagos_cuenta_org_fkey FOREIGN KEY (organizacion_id, cuenta_id)
        REFERENCES public.cuentas (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pagos_oportunidad_org_fkey FOREIGN KEY (organizacion_id, oportunidad_id)
        REFERENCES public.oportunidades (organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT pagos_usuario_org_fkey FOREIGN KEY (organizacion_id, registrado_por_usuario_id)
        REFERENCES public.usuarios (organizacion_id, id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS pagos_org_id_key
    ON public.pagos (organizacion_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS pagos_org_referencia_uidx
    ON public.pagos (organizacion_id, referencia_pago)
    WHERE referencia_pago IS NOT NULL;

CREATE INDEX IF NOT EXISTS pagos_org_venta_fecha_idx
    ON public.pagos (organizacion_id, venta_id, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS pagos_org_cliente_fecha_idx
    ON public.pagos (organizacion_id, cliente_id, fecha_pago DESC);

ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ventas_service_role_all ON public.ventas;
CREATE POLICY ventas_service_role_all ON public.ventas
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS venta_items_service_role_all ON public.venta_items;
CREATE POLICY venta_items_service_role_all ON public.venta_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pagos_service_role_all ON public.pagos;
CREATE POLICY pagos_service_role_all ON public.pagos
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ventas IS 'Ventas formales confirmadas a partir de oportunidades y cotizaciones.';
COMMENT ON TABLE public.venta_items IS 'Detalle explícito de productos y servicios vendidos.';
COMMENT ON TABLE public.pagos IS 'Pagos y movimientos de cobro de una venta.';

COMMIT;
