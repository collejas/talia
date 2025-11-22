BEGIN;

-- ============================================================================
-- Cuentas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cuentas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    alias text,
    tipo text,
    industria text,
    tamano text,
    sitio_web text,
    telefono text,
    correo text,
    direccion jsonb NOT NULL DEFAULT '{}'::jsonb,
    propietario_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cuentas_organizacion_id_idx ON public.cuentas (organizacion_id);
CREATE INDEX IF NOT EXISTS cuentas_propietario_idx ON public.cuentas (organizacion_id, propietario_usuario_id);

COMMENT ON TABLE public.cuentas IS 'Empresas (prospectos/clientes) dentro del CRM multi-tenant.';

-- ============================================================================
-- Actualizar contactos para enlazar con cuentas
-- ============================================================================

ALTER TABLE public.contactos
    ADD COLUMN IF NOT EXISTS cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contactos_cuenta_id_idx ON public.contactos (cuenta_id);

-- ============================================================================
-- Pipelines y etapas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.etapas_pipeline (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    codigo text NOT NULL,
    nombre text NOT NULL,
    orden smallint NOT NULL,
    probabilidad numeric(5,2),
    categoria text NOT NULL DEFAULT 'abierta',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organizacion_id, codigo),
    UNIQUE (organizacion_id, orden)
);

CREATE INDEX IF NOT EXISTS etapas_pipeline_org_idx ON public.etapas_pipeline (organizacion_id, orden);

-- ============================================================================
-- Oportunidades
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oportunidades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
    contacto_principal_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL,
    etapa_id uuid NOT NULL REFERENCES public.etapas_pipeline(id) ON DELETE RESTRICT,
    titulo text NOT NULL,
    descripcion text,
    monto_estimado numeric(14,2),
    moneda char(3) NOT NULL DEFAULT 'MXN',
    probabilidad numeric(5,2),
    fecha_cierre_probable date,
    estado text NOT NULL DEFAULT 'abierta',
    motivo_perdida text,
    propietario_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    asignado_a_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    cerrado_en timestamptz
);

CREATE INDEX IF NOT EXISTS oportunidades_org_idx ON public.oportunidades (organizacion_id, etapa_id);
CREATE INDEX IF NOT EXISTS oportunidades_propietario_idx ON public.oportunidades (organizacion_id, propietario_usuario_id);

COMMENT ON TABLE public.oportunidades IS 'Negocios en pipeline; reemplaza a lead_tarjetas.';

-- ============================================================================
-- Historial de etapas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oportunidad_etapas_historial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
    etapa_origen_id uuid REFERENCES public.etapas_pipeline(id) ON DELETE SET NULL,
    etapa_destino_id uuid NOT NULL REFERENCES public.etapas_pipeline(id) ON DELETE RESTRICT,
    cambiado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    cambiado_en timestamptz NOT NULL DEFAULT now(),
    motivo text,
    fuente text NOT NULL DEFAULT 'humano',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS oportunidad_historial_org_idx ON public.oportunidad_etapas_historial (organizacion_id, oportunidad_id, cambiado_en DESC);

-- ============================================================================
-- Actividades
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.actividades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    tipo text NOT NULL,
    canal text,
    asunto text,
    descripcion text,
    estado text NOT NULL DEFAULT 'pendiente',
    prioridad text NOT NULL DEFAULT 'media',
    fecha_vencimiento timestamptz,
    inicio_en timestamptz,
    fin_en timestamptz,
    sla_horas integer,
    recordatorio_en timestamptz,
    cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
    contacto_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL,
    oportunidad_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
    creado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    asignado_a_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS actividades_org_estado_idx ON public.actividades (organizacion_id, estado, prioridad);
CREATE INDEX IF NOT EXISTS actividades_oportunidad_idx ON public.actividades (organizacion_id, oportunidad_id);

-- ============================================================================
-- Tickets y comentarios
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
    contacto_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL,
    asunto text NOT NULL,
    descripcion text,
    estado text NOT NULL DEFAULT 'abierto',
    prioridad text NOT NULL DEFAULT 'media',
    canal_origen text,
    asignado_a_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    cerrado_en timestamptz
);

CREATE INDEX IF NOT EXISTS tickets_org_estado_idx ON public.tickets (organizacion_id, estado, prioridad);

CREATE TABLE IF NOT EXISTS public.ticket_comentarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    autor_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    autor_cliente_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL,
    mensaje text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Productos y cotizaciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.productos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    codigo text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    precio_base numeric(14,2),
    moneda char(3) NOT NULL DEFAULT 'MXN',
    activo boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organizacion_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.cotizaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    oportunidad_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
    cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
    contacto_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL,
    estatus text NOT NULL DEFAULT 'borrador',
    total numeric(14,2),
    moneda char(3) NOT NULL DEFAULT 'MXN',
    valida_hasta date,
    creada_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cotizacion_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id uuid NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
    producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
    descripcion text NOT NULL,
    cantidad numeric(12,2) NOT NULL DEFAULT 1,
    precio_unitario numeric(14,2),
    descuento_porcentaje numeric(5,2),
    subtotal numeric(14,2),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================================
-- Marketing: campañas y leads
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.campanas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    tipo text,
    canal text,
    presupuesto numeric(14,2),
    fecha_inicio date,
    fecha_fin date,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    campana_id uuid REFERENCES public.campanas(id) ON DELETE SET NULL,
    contacto_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL,
    cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
    origen text,
    estado text NOT NULL DEFAULT 'nuevo',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    convertido_a_contacto_id uuid REFERENCES public.contactos(id) ON DELETE SET NULL,
    convertido_a_cuenta_id uuid REFERENCES public.cuentas(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_eventos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    tipo text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    registrado_en timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Tags y taggings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    color text,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.taggings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    relacion_tipo text NOT NULL,
    relacion_id uuid NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tag_id, relacion_tipo, relacion_id)
);

-- ============================================================================
-- Archivos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.archivos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    relacion_tipo text NOT NULL,
    relacion_id uuid NOT NULL,
    nombre_original text NOT NULL,
    content_type text,
    tamano_bytes bigint,
    storage_path text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    subido_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    subido_en timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Notas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    relacion_tipo text NOT NULL,
    relacion_id uuid NOT NULL,
    texto text NOT NULL,
    visible_para_cliente boolean NOT NULL DEFAULT false,
    tipo text NOT NULL DEFAULT 'interna',
    creado_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Audit logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    accion text NOT NULL,
    tabla text NOT NULL,
    registro_id uuid,
    cambios jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip text,
    user_agent text,
    creado_en timestamptz NOT NULL DEFAULT now()
);

COMMIT;
