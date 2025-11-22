BEGIN;

-- Tabla unificada de actividades/tareas con SLA y aislamiento multi-tenant.
CREATE TABLE IF NOT EXISTS public.actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  cuenta_id uuid REFERENCES public.cuentas (id) ON DELETE SET NULL,
  contacto_id uuid REFERENCES public.contactos (id) ON DELETE SET NULL,
  oportunidad_id uuid REFERENCES public.oportunidades (id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('llamada', 'reunion', 'email', 'whatsapp', 'nota', 'tarea')),
  canal text,
  asunto text NOT NULL,
  descripcion text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_progreso', 'completada', 'cancelada', 'vencida')),
  inicio_en timestamptz,
  fin_en timestamptz,
  prioridad text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'critica')),
  fecha_vencimiento date,
  sla_horas integer,
  recordatorio_en timestamptz,
  creado_por_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  asignado_a_usuario_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS actividades_organizacion_id_idx ON public.actividades (organizacion_id);
CREATE INDEX IF NOT EXISTS actividades_cuenta_id_idx ON public.actividades (cuenta_id);
CREATE INDEX IF NOT EXISTS actividades_contacto_id_idx ON public.actividades (contacto_id);
CREATE INDEX IF NOT EXISTS actividades_oportunidad_id_idx ON public.actividades (oportunidad_id);
CREATE INDEX IF NOT EXISTS actividades_asignado_a_idx ON public.actividades (asignado_a_usuario_id);
CREATE INDEX IF NOT EXISTS actividades_estado_idx ON public.actividades (estado);
CREATE INDEX IF NOT EXISTS actividades_prioridad_idx ON public.actividades (prioridad);
CREATE INDEX IF NOT EXISTS actividades_fecha_vencimiento_idx ON public.actividades (fecha_vencimiento);

ALTER TABLE public.actividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actividades_by_tenant ON public.actividades;
CREATE POLICY actividades_by_tenant
  ON public.actividades
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS actividades_service_role_all ON public.actividades;
CREATE POLICY actividades_service_role_all
  ON public.actividades
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
