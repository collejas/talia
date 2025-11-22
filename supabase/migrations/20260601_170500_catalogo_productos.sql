BEGIN;

-- Tipos para el catálogo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'catalog_item_tipo'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.catalog_item_tipo AS ENUM ('producto', 'servicio', 'paquete');
    END IF;
END
$$;

-- Catálogo principal
CREATE TABLE IF NOT EXISTS public.catalog_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE,
    nombre text NOT NULL,
    tipo public.catalog_item_tipo DEFAULT 'servicio'::public.catalog_item_tipo NOT NULL,
    descripcion_corta text,
    descripcion_larga text,
    unidad text NOT NULL DEFAULT 'unidad',
    precio_base numeric(14,2),
    moneda character(3) NOT NULL DEFAULT 'MXN',
    impuestos jsonb NOT NULL DEFAULT '[]'::jsonb,
    activo boolean NOT NULL DEFAULT true,
    requiere_factura boolean NOT NULL DEFAULT false,
    clave_sat text,
    unidad_sat text,
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT catalog_items_precio_check CHECK (precio_base IS NULL OR precio_base >= (0)::numeric),
    CONSTRAINT catalog_items_moneda_check CHECK (char_length(moneda) = 3)
);

COMMENT ON TABLE public.catalog_items IS 'Listado administrable de productos, servicios o paquetes disponibles para cotizar.';
COMMENT ON COLUMN public.catalog_items.slug IS 'Identificador legible para URLs o integraciones.';
COMMENT ON COLUMN public.catalog_items.tipo IS 'Clasificación general (producto, servicio o paquete).';
COMMENT ON COLUMN public.catalog_items.unidad IS 'Unidad de medida mostrada en cotizaciones.';
COMMENT ON COLUMN public.catalog_items.precio_base IS 'Precio sugerido por unidad antes de descuentos.';
COMMENT ON COLUMN public.catalog_items.impuestos IS 'Lista JSON de impuestos aplicables (ej. IVA, ISR).';

CREATE INDEX IF NOT EXISTS catalog_items_activo_idx ON public.catalog_items USING btree (activo, tipo);

CREATE TRIGGER catalog_items_touch_updated_at
    BEFORE UPDATE ON public.catalog_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- Etiquetas del catálogo
CREATE TABLE IF NOT EXISTS public.catalog_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    nombre text NOT NULL,
    color text,
    descripcion text,
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_tags IS 'Etiquetas reutilizables para segmentar productos/servicios.';

CREATE TABLE IF NOT EXISTS public.catalog_item_tags (
    item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.catalog_tags(id) ON DELETE CASCADE,
    agregado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, tag_id)
);

-- Tabla de precios/versiones
CREATE TABLE IF NOT EXISTS public.catalog_item_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
    etiqueta text,
    moneda character(3) NOT NULL DEFAULT 'MXN',
    unidad text NOT NULL DEFAULT 'unidad',
    precio numeric(14,2) NOT NULL,
    descuento_porcentaje numeric(5,2),
    canal text,
    segmento text,
    vigente_desde date,
    vigente_hasta date,
    es_principal boolean NOT NULL DEFAULT false,
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT catalog_item_prices_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT catalog_item_prices_precio_check CHECK (precio >= (0)::numeric),
    CONSTRAINT catalog_item_prices_descuento_check CHECK (
        descuento_porcentaje IS NULL OR (descuento_porcentaje >= (0)::numeric AND descuento_porcentaje <= (100)::numeric)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_item_prices_principal_idx
    ON public.catalog_item_prices (item_id, moneda)
    WHERE es_principal;

CREATE INDEX IF NOT EXISTS catalog_item_prices_item_idx
    ON public.catalog_item_prices (item_id, vigente_desde);

CREATE TRIGGER catalog_item_prices_touch_updated_at
    BEFORE UPDATE ON public.catalog_item_prices
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- Ítems detallados por cotización
CREATE TABLE IF NOT EXISTS public.lead_cotizacion_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id uuid NOT NULL REFERENCES public.lead_cotizaciones(id) ON DELETE CASCADE,
    catalog_item_id uuid REFERENCES public.catalog_items(id),
    titulo text,
    descripcion text,
    unidad text NOT NULL DEFAULT 'unidad',
    cantidad numeric(12,2) NOT NULL DEFAULT 1,
    precio_unitario numeric(14,2),
    descuento numeric(14,2),
    subtotal numeric(14,2),
    impuestos numeric(14,2),
    total numeric(14,2),
    moneda character(3) NOT NULL DEFAULT 'MXN',
    orden integer NOT NULL DEFAULT 1,
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_cotizacion_items_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT lead_cotizacion_items_cantidad_check CHECK (cantidad > (0)::numeric),
    CONSTRAINT lead_cotizacion_items_precio_check CHECK (
        (precio_unitario IS NULL OR precio_unitario >= (0)::numeric)
        AND (descuento IS NULL OR descuento >= (0)::numeric)
        AND (subtotal IS NULL OR subtotal >= (0)::numeric)
        AND (impuestos IS NULL OR impuestos >= (0)::numeric)
        AND (total IS NULL OR total >= (0)::numeric)
    )
);

COMMENT ON TABLE public.lead_cotizacion_items IS 'Detalle normalizado de partidas incluidas en cada cotización.';

CREATE INDEX IF NOT EXISTS lead_cotizacion_items_cotizacion_idx
    ON public.lead_cotizacion_items (cotizacion_id, orden);

CREATE INDEX IF NOT EXISTS lead_cotizacion_items_catalog_idx
    ON public.lead_cotizacion_items (catalog_item_id);

CREATE TRIGGER lead_cotizacion_items_touch_updated_at
    BEFORE UPDATE ON public.lead_cotizacion_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- Ítems consolidados por lead ganado
CREATE TABLE IF NOT EXISTS public.lead_tarjeta_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_tarjeta_id uuid NOT NULL REFERENCES public.lead_tarjetas(id) ON DELETE CASCADE,
    cotizacion_item_id uuid REFERENCES public.lead_cotizacion_items(id) ON DELETE SET NULL,
    catalog_item_id uuid REFERENCES public.catalog_items(id),
    titulo text,
    descripcion text,
    unidad text NOT NULL DEFAULT 'unidad',
    cantidad numeric(12,2) NOT NULL DEFAULT 1,
    precio_unitario numeric(14,2),
    descuento numeric(14,2),
    subtotal numeric(14,2),
    impuestos numeric(14,2),
    total numeric(14,2),
    moneda character(3) NOT NULL DEFAULT 'MXN',
    cerrado_en timestamptz,
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_tarjeta_items_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT lead_tarjeta_items_cantidad_check CHECK (cantidad > (0)::numeric),
    CONSTRAINT lead_tarjeta_items_precio_check CHECK (
        (precio_unitario IS NULL OR precio_unitario >= (0)::numeric)
        AND (descuento IS NULL OR descuento >= (0)::numeric)
        AND (subtotal IS NULL OR subtotal >= (0)::numeric)
        AND (impuestos IS NULL OR impuestos >= (0)::numeric)
        AND (total IS NULL OR total >= (0)::numeric)
    )
);

COMMENT ON TABLE public.lead_tarjeta_items IS 'Snapshot de los productos/servicios realmente vendidos al cerrar la oportunidad.';

CREATE INDEX IF NOT EXISTS lead_tarjeta_items_lead_idx
    ON public.lead_tarjeta_items (lead_tarjeta_id);

CREATE INDEX IF NOT EXISTS lead_tarjeta_items_catalog_idx
    ON public.lead_tarjeta_items (catalog_item_id);

CREATE TRIGGER lead_tarjeta_items_touch_updated_at
    BEFORE UPDATE ON public.lead_tarjeta_items
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- Vistas de métricas
CREATE OR REPLACE VIEW public.ventas_por_producto_mes
WITH (security_invoker='true') AS
SELECT
    date_trunc('month', COALESCE(lt.cerrado_en, lti.creado_en))::date AS mes,
    lti.catalog_item_id,
    COALESCE(ci.nombre, lti.titulo) AS item_nombre,
    lti.moneda,
    SUM(COALESCE(lti.total, lti.subtotal, lti.cantidad * COALESCE(lti.precio_unitario, 0))) AS total_vendido,
    SUM(COALESCE(lti.cantidad, 0)) AS unidades_vendidas,
    COUNT(DISTINCT lti.lead_tarjeta_id) AS leads_ganados
FROM public.lead_tarjeta_items lti
JOIN public.lead_tarjetas lt ON lt.id = lti.lead_tarjeta_id
LEFT JOIN public.catalog_items ci ON ci.id = lti.catalog_item_id
GROUP BY mes, lti.catalog_item_id, item_nombre, lti.moneda;

COMMENT ON VIEW public.ventas_por_producto_mes IS 'Agregados mensuales de ventas por producto/servicio usando los items cerrados.';

CREATE OR REPLACE VIEW public.embudo_por_producto
WITH (security_invoker='true') AS
WITH latest_quotes AS (
    SELECT DISTINCT ON (lc.tarjeta_id)
        lc.id,
        lc.tarjeta_id,
        lc.estado
    FROM public.lead_cotizaciones lc
    ORDER BY lc.tarjeta_id, lc.version DESC
)
SELECT
    lt.tablero_id,
    lt.etapa_id,
    lci.catalog_item_id,
    COALESCE(ci.nombre, lci.titulo) AS item_nombre,
    lci.moneda,
    SUM(COALESCE(lci.total, lci.subtotal, lci.cantidad * COALESCE(lci.precio_unitario, 0))) AS monto_estimado,
    COUNT(DISTINCT lt.id) AS leads_con_cotizacion
FROM latest_quotes lq
JOIN public.lead_tarjetas lt ON lt.id = lq.tarjeta_id
JOIN public.lead_cotizacion_items lci ON lci.cotizacion_id = lq.id
LEFT JOIN public.catalog_items ci ON ci.id = lci.catalog_item_id
WHERE lt.cerrado_en IS NULL
GROUP BY lt.tablero_id, lt.etapa_id, lci.catalog_item_id, item_nombre, lci.moneda;

COMMENT ON VIEW public.embudo_por_producto IS 'Vista del pipeline agrupado por producto y etapa usando la última cotización disponible.';

-- Row level security
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_cotizacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tarjeta_items ENABLE ROW LEVEL SECURITY;

-- Catálogo: lectura general, escritura solo administradores
CREATE POLICY catalog_items_select
    ON public.catalog_items
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY catalog_items_insert_admin
    ON public.catalog_items
    FOR INSERT
    TO authenticated
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY catalog_items_update_admin
    ON public.catalog_items
    FOR UPDATE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY catalog_items_delete_admin
    ON public.catalog_items
    FOR DELETE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())));

-- Tags del catálogo
CREATE POLICY catalog_tags_select
    ON public.catalog_tags
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY catalog_tags_write_admin
    ON public.catalog_tags
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Relación item-tag
CREATE POLICY catalog_item_tags_select
    ON public.catalog_item_tags
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY catalog_item_tags_write_admin
    ON public.catalog_item_tags
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Precios del catálogo
CREATE POLICY catalog_item_prices_select
    ON public.catalog_item_prices
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY catalog_item_prices_insert_admin
    ON public.catalog_item_prices
    FOR INSERT
    TO authenticated
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY catalog_item_prices_update_admin
    ON public.catalog_item_prices
    FOR UPDATE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

CREATE POLICY catalog_item_prices_delete_admin
    ON public.catalog_item_prices
    FOR DELETE
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())));

-- Items de cotización (lectura limitada por lead)
CREATE POLICY lead_cotizacion_items_select
    ON public.lead_cotizacion_items
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR EXISTS (
            SELECT 1
            FROM public.lead_cotizaciones lc
            WHERE lc.id = lead_cotizacion_items.cotizacion_id
              AND public.puede_ver_lead(lc.tarjeta_id)
        )
    );

CREATE POLICY lead_cotizacion_items_write_admin
    ON public.lead_cotizacion_items
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

-- Items de lead ganado (lectura limitada por lead)
CREATE POLICY lead_tarjeta_items_select
    ON public.lead_tarjeta_items
    FOR SELECT
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        OR public.puede_ver_lead(lead_tarjeta_id)
    );

CREATE POLICY lead_tarjeta_items_write_admin
    ON public.lead_tarjeta_items
    FOR ALL
    TO authenticated
    USING (public.es_admin((SELECT auth.uid())))
    WITH CHECK (public.es_admin((SELECT auth.uid())));

COMMIT;
