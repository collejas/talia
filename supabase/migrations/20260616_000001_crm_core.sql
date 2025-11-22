BEGIN;

-- Núcleo CRM: cuentas, contactos, etapas y oportunidades con aislamiento multi-tenant.
CREATE TABLE IF NOT EXISTS public.cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text,
  industria text,
  tamano text,
  sitio_web text,
  direccion jsonb,
  propietario_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cuentas_organizacion_id_idx ON public.cuentas (organizacion_id);
CREATE INDEX IF NOT EXISTS cuentas_propietario_idx ON public.cuentas (propietario_usuario_id);

CREATE TABLE IF NOT EXISTS public.contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  cuenta_id uuid REFERENCES public.cuentas (id) ON DELETE SET NULL,
  nombre text NOT NULL,
  apellido text,
  email text,
  telefono text,
  cargo text,
  canal_preferido text,
  propietario_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, lower(email))
);

CREATE INDEX IF NOT EXISTS contactos_organizacion_id_idx ON public.contactos (organizacion_id);
CREATE INDEX IF NOT EXISTS contactos_cuenta_id_idx ON public.contactos (cuenta_id);
CREATE INDEX IF NOT EXISTS contactos_propietario_idx ON public.contactos (propietario_usuario_id);

CREATE TABLE IF NOT EXISTS public.etapas_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  orden integer NOT NULL,
  probabilidad_default numeric(5,2),
  color text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, lower(nombre)),
  UNIQUE (organizacion_id, orden)
);

CREATE INDEX IF NOT EXISTS etapas_pipeline_organizacion_id_idx ON public.etapas_pipeline (organizacion_id);

CREATE TABLE IF NOT EXISTS public.oportunidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  cuenta_id uuid REFERENCES public.cuentas (id) ON DELETE SET NULL,
  contacto_id uuid REFERENCES public.contactos (id) ON DELETE SET NULL,
  etapa_id uuid REFERENCES public.etapas_pipeline (id) ON DELETE SET NULL,
  titulo text NOT NULL,
  monto_estimado numeric(14,2),
  moneda text DEFAULT 'MXN',
  probabilidad numeric(5,2),
  fecha_cierre_probable date,
  estado text NOT NULL DEFAULT 'abierta',
  motivo_perdida text,
  propietario_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oportunidades_organizacion_id_idx ON public.oportunidades (organizacion_id);
CREATE INDEX IF NOT EXISTS oportunidades_cuenta_id_idx ON public.oportunidades (cuenta_id);
CREATE INDEX IF NOT EXISTS oportunidades_contacto_id_idx ON public.oportunidades (contacto_id);
CREATE INDEX IF NOT EXISTS oportunidades_etapa_id_idx ON public.oportunidades (etapa_id);
CREATE INDEX IF NOT EXISTS oportunidades_propietario_idx ON public.oportunidades (propietario_usuario_id);
CREATE INDEX IF NOT EXISTS oportunidades_estado_idx ON public.oportunidades (estado);

CREATE TABLE IF NOT EXISTS public.oportunidad_etapas_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades (id) ON DELETE CASCADE,
  etapa_id uuid NOT NULL REFERENCES public.etapas_pipeline (id) ON DELETE CASCADE,
  cambiado_por_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  cambiado_en timestamptz NOT NULL DEFAULT now(),
  comentario text
);

CREATE INDEX IF NOT EXISTS oportunidad_etapas_historial_org_idx ON public.oportunidad_etapas_historial (organizacion_id);
CREATE INDEX IF NOT EXISTS oportunidad_etapas_historial_oportunidad_id_idx ON public.oportunidad_etapas_historial (oportunidad_id);
CREATE INDEX IF NOT EXISTS oportunidad_etapas_historial_etapa_id_idx ON public.oportunidad_etapas_historial (etapa_id);

-- RLS por organizacion.
ALTER TABLE public.cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapas_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidad_etapas_historial ENABLE ROW LEVEL SECURITY;

-- Políticas para cuentas.
DROP POLICY IF EXISTS cuentas_by_tenant ON public.cuentas;
CREATE POLICY cuentas_by_tenant
  ON public.cuentas
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS cuentas_service_role_all ON public.cuentas;
CREATE POLICY cuentas_service_role_all
  ON public.cuentas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas para contactos.
DROP POLICY IF EXISTS contactos_by_tenant ON public.contactos;
CREATE POLICY contactos_by_tenant
  ON public.contactos
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS contactos_service_role_all ON public.contactos;
CREATE POLICY contactos_service_role_all
  ON public.contactos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas para etapas.
DROP POLICY IF EXISTS etapas_pipeline_by_tenant ON public.etapas_pipeline;
CREATE POLICY etapas_pipeline_by_tenant
  ON public.etapas_pipeline
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS etapas_pipeline_service_role_all ON public.etapas_pipeline;
CREATE POLICY etapas_pipeline_service_role_all
  ON public.etapas_pipeline
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas para oportunidades.
DROP POLICY IF EXISTS oportunidades_by_tenant ON public.oportunidades;
CREATE POLICY oportunidades_by_tenant
  ON public.oportunidades
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS oportunidades_service_role_all ON public.oportunidades;
CREATE POLICY oportunidades_service_role_all
  ON public.oportunidades
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas para historial de etapas.
DROP POLICY IF EXISTS oportunidad_etapas_historial_by_tenant ON public.oportunidad_etapas_historial;
CREATE POLICY oportunidad_etapas_historial_by_tenant
  ON public.oportunidad_etapas_historial
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS oportunidad_etapas_historial_service_role_all ON public.oportunidad_etapas_historial;
CREATE POLICY oportunidad_etapas_historial_service_role_all
  ON public.oportunidad_etapas_historial
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
