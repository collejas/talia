BEGIN;

-- Extension del modulo de compras para soportar ordenes locales e internacionales
-- sin duplicar el flujo operativo existente.

-- ============================================================================
-- Catalogos de soporte
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incoterms (
    codigo text PRIMARY KEY,
    nombre text NOT NULL,
    version text NOT NULL DEFAULT '2020',
    tipo_transporte text NOT NULL,
    descripcion text,
    activo boolean NOT NULL DEFAULT true,
    vigente_desde date,
    vigente_hasta date,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT incoterms_codigo_ck CHECK (codigo ~ '^[A-Z]{3}$'),
    CONSTRAINT incoterms_tipo_transporte_ck CHECK (tipo_transporte = ANY (ARRAY['general'::text, 'maritimo'::text]))
);

COMMENT ON TABLE public.incoterms IS 'Catalogo de Incoterms reutilizable por ordenes locales e internacionales.';

CREATE INDEX IF NOT EXISTS incoterms_nombre_idx
    ON public.incoterms (nombre);

ALTER TABLE public.incoterms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incoterms_select_authenticated ON public.incoterms;
CREATE POLICY incoterms_select_authenticated
    ON public.incoterms
    FOR SELECT
    TO authenticated
    USING (true);

CREATE TABLE IF NOT EXISTS public.monedas (
    codigo text PRIMARY KEY,
    nombre text NOT NULL,
    simbolo text,
    pais_principal_codigo_iso2 text,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT monedas_codigo_ck CHECK (codigo ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE public.monedas IS 'Catalogo ISO 4217 de monedas usadas en compras y pagos.';

CREATE INDEX IF NOT EXISTS monedas_nombre_idx
    ON public.monedas (nombre);

ALTER TABLE public.monedas
    ADD CONSTRAINT monedas_pais_principal_codigo_iso2_fkey
    FOREIGN KEY (pais_principal_codigo_iso2)
    REFERENCES public.geo_paises(codigo_iso2)
    ON DELETE SET NULL;

ALTER TABLE public.monedas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monedas_select_authenticated ON public.monedas;
CREATE POLICY monedas_select_authenticated
    ON public.monedas
    FOR SELECT
    TO authenticated
    USING (true);

CREATE TABLE IF NOT EXISTS public.modos_transporte (
    codigo text PRIMARY KEY,
    nombre text NOT NULL,
    descripcion text,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT modos_transporte_codigo_ck CHECK (codigo ~ '^[a-z0-9_]+$')
);

COMMENT ON TABLE public.modos_transporte IS 'Catalogo de modos de transporte para logistica de ordenes de compra.';

CREATE INDEX IF NOT EXISTS modos_transporte_nombre_idx
    ON public.modos_transporte (nombre);

ALTER TABLE public.modos_transporte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modos_transporte_select_authenticated ON public.modos_transporte;
CREATE POLICY modos_transporte_select_authenticated
    ON public.modos_transporte
    FOR SELECT
    TO authenticated
    USING (true);

INSERT INTO public.incoterms (codigo, nombre, version, tipo_transporte, descripcion)
VALUES
    ('EXW', 'Ex Works', '2020', 'general', 'El vendedor pone la mercancia a disposicion en sus instalaciones'),
    ('FCA', 'Free Carrier', '2020', 'general', 'Entrega al transportista designado por el comprador'),
    ('CPT', 'Carriage Paid To', '2020', 'general', 'Transporte pagado hasta el lugar de destino convenido'),
    ('CIP', 'Carriage and Insurance Paid To', '2020', 'general', 'Transporte y seguro pagados hasta el destino convenido'),
    ('DAP', 'Delivered At Place', '2020', 'general', 'Entrega en lugar convenido sin descarga'),
    ('DPU', 'Delivered at Place Unloaded', '2020', 'general', 'Entrega en lugar convenido descargada'),
    ('DDP', 'Delivered Duty Paid', '2020', 'general', 'Entrega con derechos pagados'),
    ('FAS', 'Free Alongside Ship', '2020', 'maritimo', 'Entrega al costado del buque'),
    ('FOB', 'Free On Board', '2020', 'maritimo', 'Entrega a bordo del buque'),
    ('CFR', 'Cost and Freight', '2020', 'maritimo', 'Costo y flete hasta el puerto de destino'),
    ('CIF', 'Cost, Insurance and Freight', '2020', 'maritimo', 'Costo, seguro y flete hasta el puerto de destino')
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    version = EXCLUDED.version,
    tipo_transporte = EXCLUDED.tipo_transporte,
    descripcion = EXCLUDED.descripcion,
    actualizado_en = now();

INSERT INTO public.monedas (codigo, nombre, simbolo, pais_principal_codigo_iso2)
VALUES
    ('MXN', 'Peso mexicano', '$', 'MX'),
    ('USD', 'Dolar estadounidense', '$', 'US'),
    ('EUR', 'Euro', '€', NULL),
    ('CAD', 'Dolar canadiense', '$', 'CA'),
    ('GBP', 'Libra esterlina', '£', 'GB'),
    ('JPY', 'Yen japones', '¥', 'JP'),
    ('CNY', 'Yuan chino', '¥', 'CN'),
    ('CHF', 'Franco suizo', 'CHF', 'CH'),
    ('AUD', 'Dolar australiano', '$', 'AU')
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    simbolo = EXCLUDED.simbolo,
    pais_principal_codigo_iso2 = EXCLUDED.pais_principal_codigo_iso2,
    actualizado_en = now();

INSERT INTO public.modos_transporte (codigo, nombre, descripcion)
VALUES
    ('maritimo', 'Maritimo', 'Transporte por via maritima'),
    ('aereo', 'Aereo', 'Transporte por via aerea'),
    ('terrestre', 'Terrestre', 'Transporte por carretera o ferrocarril'),
    ('courier', 'Courier', 'Mensajeria o paqueteria internacional'),
    ('multimodal', 'Multimodal', 'Combinacion de varios medios de transporte')
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    actualizado_en = now();

-- ============================================================================
-- Extensiones a ordenes de compra existentes
-- ============================================================================

ALTER TABLE public.ordenes_compra
    ADD COLUMN IF NOT EXISTS tipo_operacion text NOT NULL DEFAULT 'nacional',
    ADD COLUMN IF NOT EXISTS tipo_cambio_referencia numeric(14,6),
    ADD COLUMN IF NOT EXISTS vigencia_hasta date,
    ADD COLUMN IF NOT EXISTS proforma_referencia text;

UPDATE public.ordenes_compra
SET tipo_operacion = COALESCE(NULLIF(tipo_operacion, ''), 'nacional')
WHERE tipo_operacion IS NULL OR tipo_operacion = '';

ALTER TABLE public.ordenes_compra
    DROP CONSTRAINT IF EXISTS ordenes_compra_estado_check;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_estado_check CHECK (
        estado = ANY (ARRAY[
            'borrador'::text,
            'enviada'::text,
            'aprobada'::text,
            'parcial'::text,
            'recibida'::text,
            'cerrada'::text,
            'cancelada'::text,
            'en_revision'::text,
            'autorizada'::text,
            'aceptada_por_proveedor'::text,
            'parcialmente_embarcada'::text,
            'embarcada'::text
        ])
    );

ALTER TABLE public.ordenes_compra
    DROP CONSTRAINT IF EXISTS ordenes_compra_tipo_operacion_check;

ALTER TABLE public.ordenes_compra
    ADD CONSTRAINT ordenes_compra_tipo_operacion_check CHECK (
        tipo_operacion = ANY (ARRAY['nacional'::text, 'internacional'::text])
    );

CREATE INDEX IF NOT EXISTS ordenes_compra_org_tipo_estado_fecha_idx
    ON public.ordenes_compra (organizacion_id, tipo_operacion, estado, fecha_emision DESC);

ALTER TABLE public.ordenes_compra_items
    ADD COLUMN IF NOT EXISTS numero_partida integer,
    ADD COLUMN IF NOT EXISTS descripcion text,
    ADD COLUMN IF NOT EXISTS marca text,
    ADD COLUMN IF NOT EXISTS modelo text,
    ADD COLUMN IF NOT EXISTS fabricante text,
    ADD COLUMN IF NOT EXISTS pais_origen_codigo_iso2 text,
    ADD COLUMN IF NOT EXISTS pais_procedencia_codigo_iso2 text,
    ADD COLUMN IF NOT EXISTS fraccion_arancelaria text,
    ADD COLUMN IF NOT EXISTS hs_code text,
    ADD COLUMN IF NOT EXISTS nico text,
    ADD COLUMN IF NOT EXISTS peso_neto numeric(14,4),
    ADD COLUMN IF NOT EXISTS peso_bruto numeric(14,4),
    ADD COLUMN IF NOT EXISTS volumen_cbm numeric(14,4),
    ADD COLUMN IF NOT EXISTS lote text,
    ADD COLUMN IF NOT EXISTS numero_serie text,
    ADD COLUMN IF NOT EXISTS fecha_caducidad date;

ALTER TABLE public.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_pais_origen_codigo_iso2_fkey
    FOREIGN KEY (pais_origen_codigo_iso2) REFERENCES public.geo_paises(codigo_iso2) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra_items
    ADD CONSTRAINT ordenes_compra_items_pais_procedencia_codigo_iso2_fkey
    FOREIGN KEY (pais_procedencia_codigo_iso2) REFERENCES public.geo_paises(codigo_iso2) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_compra_items_org_orden_partida_unq
    ON public.ordenes_compra_items (organizacion_id, orden_compra_id, numero_partida)
    WHERE numero_partida IS NOT NULL;

CREATE INDEX IF NOT EXISTS ordenes_compra_items_org_origen_idx
    ON public.ordenes_compra_items (organizacion_id, pais_origen_codigo_iso2);

CREATE INDEX IF NOT EXISTS ordenes_compra_items_org_procedencia_idx
    ON public.ordenes_compra_items (organizacion_id, pais_procedencia_codigo_iso2);

-- ============================================================================
-- Tablas satelite por orden
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ordenes_compra_condiciones_comerciales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    incoterm_codigo text,
    incoterm_version text,
    lugar_incoterm text,
    responsable_flete text,
    responsable_seguro text,
    responsable_despacho_exportacion text,
    responsable_despacho_importacion text,
    responsable_impuestos_importacion text,
    permite_embarques_parciales boolean NOT NULL DEFAULT true,
    permite_transbordos boolean NOT NULL DEFAULT true,
    gastos_bancarios text,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ordenes_compra_condiciones_comerciales IS 'Snapshot de condiciones comerciales e Incoterm por orden de compra.';

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_compra_condiciones_comerciales_orden_unq
    ON public.ordenes_compra_condiciones_comerciales (orden_compra_id);

ALTER TABLE public.ordenes_compra_condiciones_comerciales
    ADD CONSTRAINT ordenes_compra_condiciones_comerciales_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_condiciones_comerciales
    ADD CONSTRAINT ordenes_compra_condiciones_comerciales_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_condiciones_comerciales
    ADD CONSTRAINT ordenes_compra_condiciones_comerciales_incoterm_codigo_fkey
    FOREIGN KEY (incoterm_codigo) REFERENCES public.incoterms(codigo) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra_condiciones_comerciales ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_ordenes_compra_condiciones_comerciales_set_org ON public.ordenes_compra_condiciones_comerciales;
CREATE TRIGGER t_ordenes_compra_condiciones_comerciales_set_org
    BEFORE INSERT ON public.ordenes_compra_condiciones_comerciales
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_ordenes_compra_condiciones_comerciales_touch_updated_at ON public.ordenes_compra_condiciones_comerciales;
CREATE TRIGGER t_ordenes_compra_condiciones_comerciales_touch_updated_at
    BEFORE UPDATE ON public.ordenes_compra_condiciones_comerciales
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY ordenes_compra_condiciones_comerciales_select_org
    ON public.ordenes_compra_condiciones_comerciales
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_condiciones_comerciales_write_org
    ON public.ordenes_compra_condiciones_comerciales
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ordenes_compra_condiciones_pago (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    forma_pago text,
    moneda_pago text,
    porcentaje_anticipo numeric(5,2),
    monto_anticipo numeric(14,4),
    porcentaje_saldo numeric(5,2),
    monto_saldo numeric(14,4),
    momento_pago_saldo text,
    dias_credito integer,
    comisiones_bancarias text,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ordenes_compra_condiciones_pago_dias_credito_ck CHECK (dias_credito IS NULL OR dias_credito >= 0)
);

COMMENT ON TABLE public.ordenes_compra_condiciones_pago IS 'Snapshot de condiciones de pago por orden de compra.';

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_compra_condiciones_pago_orden_unq
    ON public.ordenes_compra_condiciones_pago (orden_compra_id);

ALTER TABLE public.ordenes_compra_condiciones_pago
    ADD CONSTRAINT ordenes_compra_condiciones_pago_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_condiciones_pago
    ADD CONSTRAINT ordenes_compra_condiciones_pago_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_condiciones_pago
    ADD CONSTRAINT ordenes_compra_condiciones_pago_moneda_pago_fkey
    FOREIGN KEY (moneda_pago) REFERENCES public.monedas(codigo) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra_condiciones_pago ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_ordenes_compra_condiciones_pago_set_org ON public.ordenes_compra_condiciones_pago;
CREATE TRIGGER t_ordenes_compra_condiciones_pago_set_org
    BEFORE INSERT ON public.ordenes_compra_condiciones_pago
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_ordenes_compra_condiciones_pago_touch_updated_at ON public.ordenes_compra_condiciones_pago;
CREATE TRIGGER t_ordenes_compra_condiciones_pago_touch_updated_at
    BEFORE UPDATE ON public.ordenes_compra_condiciones_pago
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY ordenes_compra_condiciones_pago_select_org
    ON public.ordenes_compra_condiciones_pago
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_condiciones_pago_write_org
    ON public.ordenes_compra_condiciones_pago
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ordenes_compra_logistica (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    modo_transporte_codigo text,
    fecha_requerida_embarque date,
    fecha_estimada_embarque date,
    fecha_estimada_arribo date,
    puerto_origen text,
    puerto_destino text,
    aeropuerto_origen text,
    aeropuerto_destino text,
    lugar_entrega_final text,
    direccion_entrega text,
    tipo_embarque text,
    tipo_contenedor text,
    forwarder_nombre text,
    numero_booking text,
    numero_bl_awb text,
    tracking text,
    peso_neto_total numeric(14,4),
    peso_bruto_total numeric(14,4),
    volumen_total_cbm numeric(14,4),
    cantidad_bultos integer,
    tipo_empaque text,
    marcas_embarque text,
    requiere_seguro boolean NOT NULL DEFAULT false,
    monto_asegurado numeric(14,4),
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ordenes_compra_logistica IS 'Snapshot logistico por orden de compra.';

CREATE UNIQUE INDEX IF NOT EXISTS ordenes_compra_logistica_orden_unq
    ON public.ordenes_compra_logistica (orden_compra_id);

ALTER TABLE public.ordenes_compra_logistica
    ADD CONSTRAINT ordenes_compra_logistica_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_logistica
    ADD CONSTRAINT ordenes_compra_logistica_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_logistica
    ADD CONSTRAINT ordenes_compra_logistica_modo_transporte_codigo_fkey
    FOREIGN KEY (modo_transporte_codigo) REFERENCES public.modos_transporte(codigo) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra_logistica ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_ordenes_compra_logistica_set_org ON public.ordenes_compra_logistica;
CREATE TRIGGER t_ordenes_compra_logistica_set_org
    BEFORE INSERT ON public.ordenes_compra_logistica
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_ordenes_compra_logistica_touch_updated_at ON public.ordenes_compra_logistica;
CREATE TRIGGER t_ordenes_compra_logistica_touch_updated_at
    BEFORE UPDATE ON public.ordenes_compra_logistica
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY ordenes_compra_logistica_select_org
    ON public.ordenes_compra_logistica
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_logistica_write_org
    ON public.ordenes_compra_logistica
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ordenes_compra_documentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    tipo_documento text NOT NULL,
    obligatorio boolean NOT NULL DEFAULT false,
    estado text,
    fecha_limite date,
    archivo_id uuid,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ordenes_compra_documentos IS 'Documentos requeridos o anexos de una orden de compra.';

CREATE INDEX IF NOT EXISTS ordenes_compra_documentos_org_orden_idx
    ON public.ordenes_compra_documentos (organizacion_id, orden_compra_id);

CREATE INDEX IF NOT EXISTS ordenes_compra_documentos_org_tipo_idx
    ON public.ordenes_compra_documentos (organizacion_id, tipo_documento, estado);

ALTER TABLE public.ordenes_compra_documentos
    ADD CONSTRAINT ordenes_compra_documentos_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_documentos
    ADD CONSTRAINT ordenes_compra_documentos_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_documentos
    ADD CONSTRAINT ordenes_compra_documentos_archivo_id_fkey
    FOREIGN KEY (archivo_id) REFERENCES public.archivos(id) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra_documentos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_ordenes_compra_documentos_set_org ON public.ordenes_compra_documentos;
CREATE TRIGGER t_ordenes_compra_documentos_set_org
    BEFORE INSERT ON public.ordenes_compra_documentos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_ordenes_compra_documentos_touch_updated_at ON public.ordenes_compra_documentos;
CREATE TRIGGER t_ordenes_compra_documentos_touch_updated_at
    BEFORE UPDATE ON public.ordenes_compra_documentos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY ordenes_compra_documentos_select_org
    ON public.ordenes_compra_documentos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_documentos_write_org
    ON public.ordenes_compra_documentos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ordenes_compra_autorizaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    usuario_id uuid,
    rol text NOT NULL,
    estado text NOT NULL,
    comentario text,
    fecha_autorizacion timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ordenes_compra_autorizaciones IS 'Aprobaciones y autorizaciones de una orden de compra.';

CREATE INDEX IF NOT EXISTS ordenes_compra_autorizaciones_org_orden_idx
    ON public.ordenes_compra_autorizaciones (organizacion_id, orden_compra_id);

CREATE INDEX IF NOT EXISTS ordenes_compra_autorizaciones_org_estado_idx
    ON public.ordenes_compra_autorizaciones (organizacion_id, estado, fecha_autorizacion DESC);

ALTER TABLE public.ordenes_compra_autorizaciones
    ADD CONSTRAINT ordenes_compra_autorizaciones_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_autorizaciones
    ADD CONSTRAINT ordenes_compra_autorizaciones_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_autorizaciones
    ADD CONSTRAINT ordenes_compra_autorizaciones_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra_autorizaciones ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_ordenes_compra_autorizaciones_set_org ON public.ordenes_compra_autorizaciones;
CREATE TRIGGER t_ordenes_compra_autorizaciones_set_org
    BEFORE INSERT ON public.ordenes_compra_autorizaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_ordenes_compra_autorizaciones_touch_updated_at ON public.ordenes_compra_autorizaciones;
CREATE TRIGGER t_ordenes_compra_autorizaciones_touch_updated_at
    BEFORE UPDATE ON public.ordenes_compra_autorizaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE POLICY ordenes_compra_autorizaciones_select_org
    ON public.ordenes_compra_autorizaciones
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_autorizaciones_write_org
    ON public.ordenes_compra_autorizaciones
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ordenes_compra_eventos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    orden_compra_id uuid NOT NULL,
    usuario_id uuid,
    evento text NOT NULL,
    descripcion text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ordenes_compra_eventos IS 'Bitacora historica de eventos de una orden de compra.';

CREATE INDEX IF NOT EXISTS ordenes_compra_eventos_org_orden_fecha_idx
    ON public.ordenes_compra_eventos (organizacion_id, orden_compra_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS ordenes_compra_eventos_org_evento_idx
    ON public.ordenes_compra_eventos (organizacion_id, evento, creado_en DESC);

ALTER TABLE public.ordenes_compra_eventos
    ADD CONSTRAINT ordenes_compra_eventos_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_eventos
    ADD CONSTRAINT ordenes_compra_eventos_orden_compra_id_fkey
    FOREIGN KEY (orden_compra_id) REFERENCES public.ordenes_compra(id) ON DELETE CASCADE;

ALTER TABLE public.ordenes_compra_eventos
    ADD CONSTRAINT ordenes_compra_eventos_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.ordenes_compra_eventos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_ordenes_compra_eventos_set_org ON public.ordenes_compra_eventos;
CREATE TRIGGER t_ordenes_compra_eventos_set_org
    BEFORE INSERT ON public.ordenes_compra_eventos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

CREATE POLICY ordenes_compra_eventos_select_org
    ON public.ordenes_compra_eventos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY ordenes_compra_eventos_insert_org
    ON public.ordenes_compra_eventos
    FOR INSERT
    TO authenticated
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;
