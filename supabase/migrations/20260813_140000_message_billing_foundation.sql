BEGIN;

-- Mensajería: consumo por tenant separado de la suscripción comercial Stripe.
-- Esta migración no genera cobros ni modifica mensajes históricos.

CREATE TABLE IF NOT EXISTS public.cobro_tarifas_app (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alcance text NOT NULL,
    organizacion_id uuid NULL,
    precio_mensaje numeric(12,4) NOT NULL,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    vigente_desde timestamptz NOT NULL,
    vigente_hasta timestamptz NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_por_usuario_id uuid NULL,
    cerrado_por_usuario_id uuid NULL,
    motivo text NULL,
    origen_registro text NOT NULL DEFAULT 'admin',
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cobro_tarifas_app_alcance_chk
        CHECK (alcance IN ('global', 'tenant')),
    CONSTRAINT cobro_tarifas_app_scope_org_chk
        CHECK ((alcance = 'global' AND organizacion_id IS NULL)
            OR (alcance = 'tenant' AND organizacion_id IS NOT NULL)),
    CONSTRAINT cobro_tarifas_app_price_chk CHECK (precio_mensaje >= 0),
    CONSTRAINT cobro_tarifas_app_currency_chk CHECK (moneda = 'MXN'),
    CONSTRAINT cobro_tarifas_app_validity_chk
        CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde),
    CONSTRAINT cobro_tarifas_app_org_fk
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT cobro_tarifas_app_created_by_fk
        FOREIGN KEY (creado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL,
    CONSTRAINT cobro_tarifas_app_closed_by_fk
        FOREIGN KEY (cerrado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.cobro_tarifas_proveedor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor text NOT NULL,
    canal text NOT NULL,
    pais_codigo_iso2 char(2) NOT NULL,
    categoria_meta text NOT NULL,
    iniciador_hilo text NOT NULL,
    precio_unitario numeric(12,4) NOT NULL,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    vigente_desde timestamptz NOT NULL,
    vigente_hasta timestamptz NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_por_usuario_id uuid NULL,
    cerrado_por_usuario_id uuid NULL,
    origen_registro text NOT NULL DEFAULT 'admin',
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cobro_tarifas_proveedor_price_chk CHECK (precio_unitario >= 0),
    CONSTRAINT cobro_tarifas_proveedor_currency_chk CHECK (moneda = 'MXN'),
    CONSTRAINT cobro_tarifas_proveedor_initiator_chk
        CHECK (iniciador_hilo IN ('cliente', 'empresa', 'desconocido')),
    CONSTRAINT cobro_tarifas_proveedor_validity_chk
        CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde),
    CONSTRAINT cobro_tarifas_proveedor_created_by_fk
        FOREIGN KEY (creado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL,
    CONSTRAINT cobro_tarifas_proveedor_closed_by_fk
        FOREIGN KEY (cerrado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.cobro_configuracion_tenant (
    organizacion_id uuid PRIMARY KEY,
    limite_mensajes_periodo integer NULL,
    limite_costo_app_periodo numeric(14,4) NULL,
    limite_costo_meta_periodo numeric(14,4) NULL,
    porcentaje_alerta_consumo smallint NOT NULL DEFAULT 80,
    suspension_automatica_por_limite boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cobro_config_tenant_org_fk
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT cobro_config_tenant_limit_messages_chk
        CHECK (limite_mensajes_periodo IS NULL OR limite_mensajes_periodo >= 0),
    CONSTRAINT cobro_config_tenant_limit_app_chk
        CHECK (limite_costo_app_periodo IS NULL OR limite_costo_app_periodo >= 0),
    CONSTRAINT cobro_config_tenant_limit_meta_chk
        CHECK (limite_costo_meta_periodo IS NULL OR limite_costo_meta_periodo >= 0),
    CONSTRAINT cobro_config_tenant_alert_pct_chk
        CHECK (porcentaje_alerta_consumo BETWEEN 1 AND 100)
);

CREATE TABLE IF NOT EXISTS public.cobro_periodos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    fecha_inicio timestamptz NOT NULL,
    fecha_fin timestamptz NOT NULL,
    estado text NOT NULL DEFAULT 'abierto',
    mensajes_cantidad integer NOT NULL DEFAULT 0,
    mensajes_entrantes_cantidad integer NOT NULL DEFAULT 0,
    mensajes_salientes_cantidad integer NOT NULL DEFAULT 0,
    hilos_con_actividad_cantidad integer NOT NULL DEFAULT 0,
    conversiones_cantidad integer NOT NULL DEFAULT 0,
    subtotal_mensajes numeric(14,4) NOT NULL DEFAULT 0,
    costo_meta_periodo numeric(14,4) NOT NULL DEFAULT 0,
    costo_mensaje_periodo numeric(14,4) NOT NULL DEFAULT 0,
    ajustes_total numeric(14,4) NOT NULL DEFAULT 0,
    total numeric(14,4) NOT NULL DEFAULT 0,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    cerrado_en timestamptz NULL,
    cerrado_por_usuario_id uuid NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cobro_periodos_org_fk
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT cobro_periodos_closed_by_fk
        FOREIGN KEY (cerrado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL,
    CONSTRAINT cobro_periodos_dates_chk CHECK (fecha_fin > fecha_inicio),
    CONSTRAINT cobro_periodos_status_chk
        CHECK (estado IN ('abierto', 'en_revision', 'cerrado', 'facturado', 'cancelado')),
    CONSTRAINT cobro_periodos_currency_chk CHECK (moneda = 'MXN'),
    CONSTRAINT cobro_periodos_counts_chk
        CHECK (mensajes_cantidad >= 0 AND mensajes_entrantes_cantidad >= 0
            AND mensajes_salientes_cantidad >= 0 AND hilos_con_actividad_cantidad >= 0
            AND conversiones_cantidad >= 0),
    CONSTRAINT cobro_periodos_amounts_chk
        CHECK (subtotal_mensajes >= 0 AND costo_meta_periodo >= 0
            AND costo_mensaje_periodo >= 0 AND total >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS cobro_periodos_org_id_uidx
    ON public.cobro_periodos (organizacion_id, id);

CREATE TABLE IF NOT EXISTS public.cobro_mensajes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    periodo_id uuid NOT NULL,
    mensaje_id uuid NOT NULL,
    conversacion_id uuid NOT NULL,
    proveedor text NOT NULL,
    proveedor_mensaje_id text NOT NULL,
    direccion text NOT NULL,
    tipo_contenido text NOT NULL,
    origen_mensaje text NOT NULL,
    es_plantilla boolean NOT NULL DEFAULT false,
    nombre_plantilla text NULL,
    idioma_plantilla text NULL,
    categoria_meta text NOT NULL DEFAULT 'unknown',
    tipo_pricing_meta text NULL,
    billable_meta boolean NULL,
    estado_proveedor text NOT NULL,
    aceptado_proveedor_en timestamptz NULL,
    facturable boolean NOT NULL DEFAULT false,
    motivo_no_facturable text NULL,
    tarifa_app_id uuid NOT NULL,
    origen_tarifa_app text NOT NULL,
    cargo_app_unitario numeric(12,4) NOT NULL DEFAULT 0,
    cargo_app_importe numeric(12,4) NOT NULL DEFAULT 0,
    tarifa_proveedor_id uuid NULL,
    costo_meta_aplica boolean NOT NULL DEFAULT false,
    costo_meta_unitario numeric(12,4) NOT NULL DEFAULT 0,
    costo_meta_importe numeric(12,4) NOT NULL DEFAULT 0,
    costo_total_mensaje numeric(12,4) NOT NULL DEFAULT 0,
    tipo_cargo text NOT NULL DEFAULT 'mensaje',
    fuente_registro text NOT NULL,
    conciliacion_estado text NOT NULL DEFAULT 'pendiente',
    conciliado_en timestamptz NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cobro_mensajes_org_message_fk
        FOREIGN KEY (organizacion_id, mensaje_id)
        REFERENCES public.mensajes(organizacion_id, id) ON DELETE CASCADE,
    CONSTRAINT cobro_mensajes_org_conversation_fk
        FOREIGN KEY (organizacion_id, conversacion_id)
        REFERENCES public.conversaciones(organizacion_id, id) ON DELETE CASCADE,
    CONSTRAINT cobro_mensajes_org_period_fk
        FOREIGN KEY (organizacion_id, periodo_id)
        REFERENCES public.cobro_periodos(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT cobro_mensajes_app_rate_fk
        FOREIGN KEY (tarifa_app_id) REFERENCES public.cobro_tarifas_app(id) ON DELETE RESTRICT,
    CONSTRAINT cobro_mensajes_provider_rate_fk
        FOREIGN KEY (tarifa_proveedor_id) REFERENCES public.cobro_tarifas_proveedor(id) ON DELETE RESTRICT,
    CONSTRAINT cobro_mensajes_direction_chk
        CHECK (direccion IN ('entrante', 'saliente')),
    CONSTRAINT cobro_mensajes_initiator_chk
        CHECK (origen_mensaje IN ('cliente', 'empresa', 'sistema', 'desconocido')),
    CONSTRAINT cobro_mensajes_category_chk
        CHECK (categoria_meta IN ('marketing', 'utility', 'authentication', 'service', 'referral_conversion', 'unknown')),
    CONSTRAINT cobro_mensajes_billable_amount_chk
        CHECK ((facturable AND cargo_app_importe = cargo_app_unitario)
            OR (NOT facturable AND cargo_app_importe = 0)),
    CONSTRAINT cobro_mensajes_meta_amount_chk
        CHECK ((costo_meta_aplica AND costo_meta_importe = costo_meta_unitario)
            OR (NOT costo_meta_aplica AND costo_meta_importe = 0)),
    CONSTRAINT cobro_mensajes_total_chk
        CHECK (costo_total_mensaje = costo_meta_importe + cargo_app_importe),
    CONSTRAINT cobro_mensajes_type_chk CHECK (tipo_cargo = 'mensaje'),
    CONSTRAINT cobro_mensajes_amounts_nonnegative_chk
        CHECK (cargo_app_unitario >= 0 AND cargo_app_importe >= 0
            AND costo_meta_unitario >= 0 AND costo_meta_importe >= 0)
);

CREATE TABLE IF NOT EXISTS public.cobro_hilos_resumen (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    periodo_id uuid NOT NULL,
    conversacion_id uuid NOT NULL,
    canal text NOT NULL,
    iniciador_hilo text NOT NULL DEFAULT 'desconocido',
    fecha_inicio_hilo timestamptz NOT NULL,
    fecha_primer_mensaje_saliente timestamptz NULL,
    mensaje_saliente_inicial_id uuid NULL,
    oportunidad_id uuid NULL,
    conversion_atribuida boolean NOT NULL DEFAULT false,
    conversion_en timestamptz NULL,
    mensajes_entrantes_cantidad integer NOT NULL DEFAULT 0,
    mensajes_salientes_cantidad integer NOT NULL DEFAULT 0,
    ultimo_mensaje_en timestamptz NULL,
    estado_hilo text NOT NULL DEFAULT 'activo',
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cobro_hilos_org_period_fk
        FOREIGN KEY (organizacion_id, periodo_id)
        REFERENCES public.cobro_periodos(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT cobro_hilos_org_conversation_fk
        FOREIGN KEY (organizacion_id, conversacion_id)
        REFERENCES public.conversaciones(organizacion_id, id) ON DELETE CASCADE,
    CONSTRAINT cobro_hilos_org_opportunity_fk
        FOREIGN KEY (organizacion_id, oportunidad_id)
        REFERENCES public.oportunidades(organizacion_id, id) ON DELETE SET NULL,
    CONSTRAINT cobro_hilos_initiator_chk
        CHECK (iniciador_hilo IN ('cliente', 'empresa', 'desconocido')),
    CONSTRAINT cobro_hilos_counts_chk
        CHECK (mensajes_entrantes_cantidad >= 0 AND mensajes_salientes_cantidad >= 0)
);

CREATE TABLE IF NOT EXISTS public.cobro_ajustes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    periodo_id uuid NOT NULL,
    tipo text NOT NULL,
    importe numeric(12,4) NOT NULL,
    moneda char(3) NOT NULL DEFAULT 'MXN',
    motivo text NOT NULL,
    referencia text NULL,
    creado_por_usuario_id uuid NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cobro_ajustes_org_period_fk
        FOREIGN KEY (organizacion_id, periodo_id)
        REFERENCES public.cobro_periodos(organizacion_id, id) ON DELETE RESTRICT,
    CONSTRAINT cobro_ajustes_created_by_fk
        FOREIGN KEY (creado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    CONSTRAINT cobro_ajustes_type_chk CHECK (tipo IN ('credito', 'cargo', 'reversa')),
    CONSTRAINT cobro_ajustes_currency_chk CHECK (moneda = 'MXN'),
    CONSTRAINT cobro_ajustes_amount_nonzero_chk CHECK (importe <> 0)
);

CREATE TABLE IF NOT EXISTS public.cobro_alertas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    periodo_id uuid NULL,
    tipo text NOT NULL,
    severidad text NOT NULL,
    estado text NOT NULL DEFAULT 'abierta',
    umbral numeric(14,4) NULL,
    valor_actual numeric(14,4) NULL,
    mensaje text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    resuelto_en timestamptz NULL,
    resuelto_por_usuario_id uuid NULL,
    CONSTRAINT cobro_alertas_org_fk
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT cobro_alertas_period_fk
        FOREIGN KEY (periodo_id) REFERENCES public.cobro_periodos(id) ON DELETE SET NULL,
    CONSTRAINT cobro_alertas_resolved_by_fk
        FOREIGN KEY (resuelto_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL,
    CONSTRAINT cobro_alertas_severity_chk
        CHECK (severidad IN ('info', 'warning', 'critical')),
    CONSTRAINT cobro_alertas_status_chk
        CHECK (estado IN ('abierta', 'acknowledged', 'resuelta', 'descartada'))
);

CREATE UNIQUE INDEX IF NOT EXISTS cobro_tarifas_app_global_active_uidx
    ON public.cobro_tarifas_app (alcance, activo)
    WHERE alcance = 'global' AND activo;

CREATE UNIQUE INDEX IF NOT EXISTS cobro_tarifas_app_tenant_active_uidx
    ON public.cobro_tarifas_app (organizacion_id, activo)
    WHERE alcance = 'tenant' AND activo;

CREATE INDEX IF NOT EXISTS cobro_tarifas_app_effective_idx
    ON public.cobro_tarifas_app (organizacion_id, alcance, vigente_desde DESC, vigente_hasta);

CREATE UNIQUE INDEX IF NOT EXISTS cobro_tarifas_proveedor_active_uidx
    ON public.cobro_tarifas_proveedor
        (proveedor, canal, pais_codigo_iso2, categoria_meta, iniciador_hilo, activo)
    WHERE activo;

CREATE INDEX IF NOT EXISTS cobro_tarifas_proveedor_effective_idx
    ON public.cobro_tarifas_proveedor
        (proveedor, canal, pais_codigo_iso2, categoria_meta, iniciador_hilo, vigente_desde DESC);

CREATE UNIQUE INDEX IF NOT EXISTS cobro_periodos_org_start_uidx
    ON public.cobro_periodos (organizacion_id, fecha_inicio);

CREATE INDEX IF NOT EXISTS cobro_periodos_org_status_idx
    ON public.cobro_periodos (organizacion_id, estado, fecha_inicio DESC);

CREATE UNIQUE INDEX IF NOT EXISTS cobro_mensajes_provider_uidx
    ON public.cobro_mensajes (organizacion_id, proveedor, proveedor_mensaje_id);

CREATE UNIQUE INDEX IF NOT EXISTS cobro_mensajes_message_uidx
    ON public.cobro_mensajes (organizacion_id, mensaje_id);

CREATE INDEX IF NOT EXISTS cobro_mensajes_org_period_idx
    ON public.cobro_mensajes (organizacion_id, periodo_id, facturable, creado_en DESC);

CREATE INDEX IF NOT EXISTS cobro_mensajes_org_category_idx
    ON public.cobro_mensajes (organizacion_id, categoria_meta, creado_en DESC);

CREATE UNIQUE INDEX IF NOT EXISTS cobro_hilos_org_period_conversation_uidx
    ON public.cobro_hilos_resumen (organizacion_id, periodo_id, conversacion_id);

CREATE INDEX IF NOT EXISTS cobro_hilos_org_conversion_idx
    ON public.cobro_hilos_resumen (organizacion_id, conversion_atribuida, conversion_en DESC);

CREATE INDEX IF NOT EXISTS cobro_ajustes_org_period_idx
    ON public.cobro_ajustes (organizacion_id, periodo_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS cobro_alertas_org_status_idx
    ON public.cobro_alertas (organizacion_id, estado, creado_en DESC);

CREATE INDEX IF NOT EXISTS cobro_alertas_type_status_idx
    ON public.cobro_alertas (tipo, estado, creado_en DESC);

ALTER TABLE public.cobro_tarifas_app ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_tarifas_app FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_tarifas_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_tarifas_proveedor FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_configuracion_tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_configuracion_tenant FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_periodos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_mensajes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_hilos_resumen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_hilos_resumen FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_ajustes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_alertas FORCE ROW LEVEL SECURITY;

-- Lectura propia para tenants y lectura global para el owner de la aplicación.
CREATE POLICY cobro_tarifas_app_select
    ON public.cobro_tarifas_app FOR SELECT TO authenticated
    USING (public.es_owner(auth.uid())
        OR alcance = 'global'
        OR organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cobro_tarifas_app_owner_write
    ON public.cobro_tarifas_app FOR ALL TO authenticated
    USING (public.es_owner(auth.uid()))
    WITH CHECK (public.es_owner(auth.uid()));

CREATE POLICY cobro_tarifas_proveedor_select
    ON public.cobro_tarifas_proveedor FOR SELECT TO authenticated
    USING (true);

CREATE POLICY cobro_tarifas_proveedor_owner_write
    ON public.cobro_tarifas_proveedor FOR ALL TO authenticated
    USING (public.es_owner(auth.uid()))
    WITH CHECK (public.es_owner(auth.uid()));

CREATE POLICY cobro_config_tenant_select
    ON public.cobro_configuracion_tenant FOR SELECT TO authenticated
    USING (public.es_owner(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cobro_config_tenant_owner_write
    ON public.cobro_configuracion_tenant FOR ALL TO authenticated
    USING (public.es_owner(auth.uid()))
    WITH CHECK (public.es_owner(auth.uid()));

CREATE POLICY cobro_periodos_select
    ON public.cobro_periodos FOR SELECT TO authenticated
    USING (public.es_owner(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cobro_periodos_owner_write
    ON public.cobro_periodos FOR ALL TO authenticated
    USING (public.es_owner(auth.uid()))
    WITH CHECK (public.es_owner(auth.uid()));

CREATE POLICY cobro_mensajes_select
    ON public.cobro_mensajes FOR SELECT TO authenticated
    USING (public.es_owner(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cobro_hilos_select
    ON public.cobro_hilos_resumen FOR SELECT TO authenticated
    USING (public.es_owner(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cobro_ajustes_select
    ON public.cobro_ajustes FOR SELECT TO authenticated
    USING (public.es_owner(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cobro_ajustes_owner_write
    ON public.cobro_ajustes FOR ALL TO authenticated
    USING (public.es_owner(auth.uid()))
    WITH CHECK (public.es_owner(auth.uid()));

CREATE POLICY cobro_alertas_select
    ON public.cobro_alertas FOR SELECT TO authenticated
    USING (public.es_owner(auth.uid())
        OR organizacion_id = public.usuario_organizacion_id(auth.uid()));

CREATE POLICY cobro_alertas_owner_write
    ON public.cobro_alertas FOR ALL TO authenticated
    USING (public.es_owner(auth.uid()))
    WITH CHECK (public.es_owner(auth.uid()));

GRANT SELECT ON
    public.cobro_tarifas_app,
    public.cobro_tarifas_proveedor,
    public.cobro_configuracion_tenant,
    public.cobro_periodos,
    public.cobro_mensajes,
    public.cobro_hilos_resumen,
    public.cobro_ajustes,
    public.cobro_alertas
TO authenticated;

GRANT ALL ON
    public.cobro_tarifas_app,
    public.cobro_tarifas_proveedor,
    public.cobro_configuracion_tenant,
    public.cobro_periodos,
    public.cobro_mensajes,
    public.cobro_hilos_resumen,
    public.cobro_ajustes,
    public.cobro_alertas
TO service_role;

-- Tarifas iniciales configurables. Son datos de configuración, no cargos.
INSERT INTO public.cobro_tarifas_app (
    alcance, precio_mensaje, moneda, vigente_desde, origen_registro, motivo
)
SELECT 'global', 0.09, 'MXN', now(), 'migracion_inicial', 'Tarifa inicial GEOACTIV por mensaje'
WHERE NOT EXISTS (
    SELECT 1 FROM public.cobro_tarifas_app
    WHERE alcance = 'global' AND activo
);

INSERT INTO public.cobro_tarifas_proveedor (
    proveedor, canal, pais_codigo_iso2, categoria_meta, iniciador_hilo,
    precio_unitario, moneda, vigente_desde, origen_registro
)
SELECT 'meta', 'whatsapp', 'MX', 'unknown', 'empresa', 0.5614, 'MXN', now(), 'migracion_inicial'
WHERE NOT EXISTS (
    SELECT 1 FROM public.cobro_tarifas_proveedor
    WHERE proveedor = 'meta'
      AND canal = 'whatsapp'
      AND pais_codigo_iso2 = 'MX'
      AND categoria_meta = 'unknown'
      AND iniciador_hilo = 'empresa'
      AND activo
);

COMMENT ON TABLE public.cobro_tarifas_app IS
    'Tarifas GEOACTIV por mensaje, globales o particulares por tenant. El owner administra cambios.';
COMMENT ON TABLE public.cobro_tarifas_proveedor IS
    'Tarifas publicadas/configuradas de Meta u otros proveedores; no son cargos de GEOACTIV.';
COMMENT ON TABLE public.cobro_mensajes IS
    'Ledger idempotente de mensajes entrantes y salientes con cargo GEOACTIV y costo del proveedor.';
COMMENT ON TABLE public.cobro_hilos_resumen IS
    'Resumen operativo y de conversiones por hilo; no genera cargo independiente.';

COMMIT;
