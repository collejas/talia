BEGIN;

-- Tickets y soporte.
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  cuenta_id uuid REFERENCES public.cuentas (id) ON DELETE SET NULL,
  contacto_id uuid REFERENCES public.contactos (id) ON DELETE SET NULL,
  oportunidad_id uuid REFERENCES public.oportunidades (id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descripcion text,
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_progreso', 'resuelto', 'cerrado')),
  prioridad text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'critica')),
  canal_origen text,
  asignado_a_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  creado_por_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  cerrado_en timestamptz
);

CREATE INDEX IF NOT EXISTS tickets_organizacion_id_idx ON public.tickets (organizacion_id);
CREATE INDEX IF NOT EXISTS tickets_cuenta_id_idx ON public.tickets (cuenta_id);
CREATE INDEX IF NOT EXISTS tickets_contacto_id_idx ON public.tickets (contacto_id);
CREATE INDEX IF NOT EXISTS tickets_estado_idx ON public.tickets (estado);
CREATE INDEX IF NOT EXISTS tickets_prioridad_idx ON public.tickets (prioridad);
CREATE INDEX IF NOT EXISTS tickets_asignado_idx ON public.tickets (asignado_a_usuario_id);

CREATE TABLE IF NOT EXISTS public.ticket_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  autor_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  mensaje text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_comentarios_organizacion_id_idx ON public.ticket_comentarios (organizacion_id);
CREATE INDEX IF NOT EXISTS ticket_comentarios_ticket_id_idx ON public.ticket_comentarios (ticket_id);

-- Productos y cotizaciones.
CREATE TABLE IF NOT EXISTS public.productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  codigo text,
  nombre text NOT NULL,
  descripcion text,
  precio_base numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'MXN',
  activo boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, lower(nombre)),
  UNIQUE (organizacion_id, lower(codigo))
);

CREATE INDEX IF NOT EXISTS productos_organizacion_id_idx ON public.productos (organizacion_id);
CREATE INDEX IF NOT EXISTS productos_activo_idx ON public.productos (activo);

CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  oportunidad_id uuid REFERENCES public.oportunidades (id) ON DELETE SET NULL,
  cuenta_id uuid REFERENCES public.cuentas (id) ON DELETE SET NULL,
  contacto_id uuid REFERENCES public.contactos (id) ON DELETE SET NULL,
  estatus text NOT NULL DEFAULT 'borrador' CHECK (estatus IN ('borrador', 'enviada', 'aceptada', 'rechazada', 'cancelada')),
  total numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'MXN',
  valida_hasta date,
  creada_por_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cotizaciones_organizacion_id_idx ON public.cotizaciones (organizacion_id);
CREATE INDEX IF NOT EXISTS cotizaciones_oportunidad_id_idx ON public.cotizaciones (oportunidad_id);
CREATE INDEX IF NOT EXISTS cotizaciones_cuenta_id_idx ON public.cotizaciones (cuenta_id);
CREATE INDEX IF NOT EXISTS cotizaciones_estatus_idx ON public.cotizaciones (estatus);

CREATE TABLE IF NOT EXISTS public.cotizacion_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  cotizacion_id uuid NOT NULL REFERENCES public.cotizaciones (id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos (id) ON DELETE SET NULL,
  descripcion text NOT NULL,
  cantidad numeric(12,2) NOT NULL DEFAULT 1,
  precio_unitario numeric(14,2) NOT NULL DEFAULT 0,
  descuento_porcentaje numeric(5,2) NOT NULL DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cotizacion_items_organizacion_id_idx ON public.cotizacion_items (organizacion_id);
CREATE INDEX IF NOT EXISTS cotizacion_items_cotizacion_id_idx ON public.cotizacion_items (cotizacion_id);
CREATE INDEX IF NOT EXISTS cotizacion_items_producto_id_idx ON public.cotizacion_items (producto_id);

-- Marketing y leads.
CREATE TABLE IF NOT EXISTS public.campanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text,
  canal_principal text,
  fecha_inicio date,
  fecha_fin date,
  presupuesto numeric(14,2),
  moneda text NOT NULL DEFAULT 'MXN',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, lower(nombre))
);

CREATE INDEX IF NOT EXISTS campanas_organizacion_id_idx ON public.campanas (organizacion_id);
CREATE INDEX IF NOT EXISTS campanas_tipo_idx ON public.campanas (tipo);

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  campana_id uuid REFERENCES public.campanas (id) ON DELETE SET NULL,
  nombre text,
  email text,
  telefono text,
  origen text,
  canal text,
  estado text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'en_proceso', 'convertido', 'descartado')),
  convertido_a_contacto_id uuid REFERENCES public.contactos (id) ON DELETE SET NULL,
  convertido_a_cuenta_id uuid REFERENCES public.cuentas (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, lower(email))
);

CREATE INDEX IF NOT EXISTS leads_organizacion_id_idx ON public.leads (organizacion_id);
CREATE INDEX IF NOT EXISTS leads_campana_id_idx ON public.leads (campana_id);
CREATE INDEX IF NOT EXISTS leads_estado_idx ON public.leads (estado);

CREATE TABLE IF NOT EXISTS public.lead_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  registrado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_eventos_organizacion_id_idx ON public.lead_eventos (organizacion_id);
CREATE INDEX IF NOT EXISTS lead_eventos_lead_id_idx ON public.lead_eventos (lead_id);

-- Etiquetas, archivos y notas polimórficas.
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  color text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, lower(nombre))
);

CREATE INDEX IF NOT EXISTS tags_organizacion_id_idx ON public.tags (organizacion_id);

CREATE TABLE IF NOT EXISTS public.taggings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
  relacion_tipo text NOT NULL,
  relacion_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, relacion_tipo, relacion_id)
);

CREATE INDEX IF NOT EXISTS taggings_organizacion_id_idx ON public.taggings (organizacion_id);
CREATE INDEX IF NOT EXISTS taggings_relacion_idx ON public.taggings (relacion_tipo, relacion_id);

CREATE TABLE IF NOT EXISTS public.archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  relacion_tipo text NOT NULL,
  relacion_id uuid NOT NULL,
  nombre_original text NOT NULL,
  content_type text,
  tamano_bytes bigint,
  storage_path text NOT NULL,
  subido_por_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  subido_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archivos_organizacion_id_idx ON public.archivos (organizacion_id);
CREATE INDEX IF NOT EXISTS archivos_relacion_idx ON public.archivos (relacion_tipo, relacion_id);
CREATE INDEX IF NOT EXISTS archivos_subido_por_idx ON public.archivos (subido_por_usuario_id);

CREATE TABLE IF NOT EXISTS public.notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  relacion_tipo text NOT NULL,
  relacion_id uuid NOT NULL,
  texto text NOT NULL,
  tipo text NOT NULL DEFAULT 'interna' CHECK (tipo IN ('interna', 'publica', 'sistema')),
  visible_para_cliente boolean NOT NULL DEFAULT false,
  creado_por_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notas_organizacion_id_idx ON public.notas (organizacion_id);
CREATE INDEX IF NOT EXISTS notas_relacion_idx ON public.notas (relacion_tipo, relacion_id);
CREATE INDEX IF NOT EXISTS notas_tipo_idx ON public.notas (tipo);

-- Auditoría.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  actor_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  accion text NOT NULL,
  tabla text NOT NULL,
  registro_id uuid,
  cambios jsonb,
  ip text,
  user_agent text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_organizacion_id_idx ON public.audit_logs (organizacion_id);
CREATE INDEX IF NOT EXISTS audit_logs_tabla_idx ON public.audit_logs (tabla);

-- RLS para todas las tablas nuevas.
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taggings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas por tenant.
DROP POLICY IF EXISTS tickets_by_tenant ON public.tickets;
CREATE POLICY tickets_by_tenant
  ON public.tickets
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS tickets_service_role_all ON public.tickets;
CREATE POLICY tickets_service_role_all
  ON public.tickets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS ticket_comentarios_by_tenant ON public.ticket_comentarios;
CREATE POLICY ticket_comentarios_by_tenant
  ON public.ticket_comentarios
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS ticket_comentarios_service_role_all ON public.ticket_comentarios;
CREATE POLICY ticket_comentarios_service_role_all
  ON public.ticket_comentarios
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS productos_by_tenant ON public.productos;
CREATE POLICY productos_by_tenant
  ON public.productos
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS productos_service_role_all ON public.productos;
CREATE POLICY productos_service_role_all
  ON public.productos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS cotizaciones_by_tenant ON public.cotizaciones;
CREATE POLICY cotizaciones_by_tenant
  ON public.cotizaciones
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS cotizaciones_service_role_all ON public.cotizaciones;
CREATE POLICY cotizaciones_service_role_all
  ON public.cotizaciones
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS cotizacion_items_by_tenant ON public.cotizacion_items;
CREATE POLICY cotizacion_items_by_tenant
  ON public.cotizacion_items
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS cotizacion_items_service_role_all ON public.cotizacion_items;
CREATE POLICY cotizacion_items_service_role_all
  ON public.cotizacion_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS campanas_by_tenant ON public.campanas;
CREATE POLICY campanas_by_tenant
  ON public.campanas
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS campanas_service_role_all ON public.campanas;
CREATE POLICY campanas_service_role_all
  ON public.campanas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS leads_by_tenant ON public.leads;
CREATE POLICY leads_by_tenant
  ON public.leads
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS leads_service_role_all ON public.leads;
CREATE POLICY leads_service_role_all
  ON public.leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS lead_eventos_by_tenant ON public.lead_eventos;
CREATE POLICY lead_eventos_by_tenant
  ON public.lead_eventos
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS lead_eventos_service_role_all ON public.lead_eventos;
CREATE POLICY lead_eventos_service_role_all
  ON public.lead_eventos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS tags_by_tenant ON public.tags;
CREATE POLICY tags_by_tenant
  ON public.tags
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS tags_service_role_all ON public.tags;
CREATE POLICY tags_service_role_all
  ON public.tags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS taggings_by_tenant ON public.taggings;
CREATE POLICY taggings_by_tenant
  ON public.taggings
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS taggings_service_role_all ON public.taggings;
CREATE POLICY taggings_service_role_all
  ON public.taggings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS archivos_by_tenant ON public.archivos;
CREATE POLICY archivos_by_tenant
  ON public.archivos
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS archivos_service_role_all ON public.archivos;
CREATE POLICY archivos_service_role_all
  ON public.archivos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS notas_by_tenant ON public.notas;
CREATE POLICY notas_by_tenant
  ON public.notas
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS notas_service_role_all ON public.notas;
CREATE POLICY notas_service_role_all
  ON public.notas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS audit_logs_by_tenant ON public.audit_logs;
CREATE POLICY audit_logs_by_tenant
  ON public.audit_logs
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS audit_logs_service_role_all ON public.audit_logs;
CREATE POLICY audit_logs_service_role_all
  ON public.audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
