BEGIN;

-- Extraer el tenant desde el JWT para usarlo en RLS.
CREATE OR REPLACE FUNCTION public.current_organizacion_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'organizacion_id', '')::uuid;
$$;

COMMENT ON FUNCTION public.current_organizacion_id()
  IS 'Obtiene el identificador de organizacion desde el JWT de Supabase, usado por las políticas multi-tenant.';

-- Tenants del sistema.
CREATE TABLE IF NOT EXISTS public.organizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  razon_social text,
  rfc text,
  pais text,
  estado text,
  ciudad text,
  dominio_principal text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado_onboarding text NOT NULL DEFAULT 'pendiente',
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  dado_de_baja_en timestamptz,
  pausado_en timestamptz,
  cancelado_en timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS organizaciones_dominio_principal_key
  ON public.organizaciones (lower(dominio_principal))
  WHERE dominio_principal IS NOT NULL;

-- Catálogo de roles por organización.
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, lower(nombre))
);

CREATE INDEX IF NOT EXISTS roles_organizacion_id_idx ON public.roles (organizacion_id);

-- Usuarios pertenecientes a una organización.
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  email text NOT NULL,
  nombre text,
  telefono text,
  estado text NOT NULL DEFAULT 'activo',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, lower(email))
);

CREATE INDEX IF NOT EXISTS usuarios_organizacion_id_idx ON public.usuarios (organizacion_id);
CREATE INDEX IF NOT EXISTS usuarios_estado_idx ON public.usuarios (estado);

-- Relación many-to-many entre usuarios y roles.
CREATE TABLE IF NOT EXISTS public.usuario_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL REFERENCES public.organizaciones (id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  rol_id uuid NOT NULL REFERENCES public.roles (id) ON DELETE CASCADE,
  asignado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacion_id, usuario_id, rol_id)
);

CREATE INDEX IF NOT EXISTS usuario_roles_organizacion_id_idx ON public.usuario_roles (organizacion_id);
CREATE INDEX IF NOT EXISTS usuario_roles_usuario_id_idx ON public.usuario_roles (usuario_id);
CREATE INDEX IF NOT EXISTS usuario_roles_rol_id_idx ON public.usuario_roles (rol_id);

-- Reglas de RLS basadas en el tenant del JWT.
ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizaciones_by_tenant ON public.organizaciones;
CREATE POLICY organizaciones_by_tenant
  ON public.organizaciones
  FOR SELECT
  TO authenticated
  USING (id = public.current_organizacion_id());

DROP POLICY IF EXISTS organizaciones_admin_all ON public.organizaciones;
CREATE POLICY organizaciones_admin_all
  ON public.organizaciones
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS roles_by_tenant ON public.roles;
CREATE POLICY roles_by_tenant
  ON public.roles
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS roles_service_role_all ON public.roles;
CREATE POLICY roles_service_role_all
  ON public.roles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS usuarios_by_tenant ON public.usuarios;
CREATE POLICY usuarios_by_tenant
  ON public.usuarios
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS usuarios_service_role_all ON public.usuarios;
CREATE POLICY usuarios_service_role_all
  ON public.usuarios
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS usuario_roles_by_tenant ON public.usuario_roles;
CREATE POLICY usuario_roles_by_tenant
  ON public.usuario_roles
  FOR ALL
  TO authenticated
  USING (organizacion_id = public.current_organizacion_id())
  WITH CHECK (organizacion_id = public.current_organizacion_id());

DROP POLICY IF EXISTS usuario_roles_service_role_all ON public.usuario_roles;
CREATE POLICY usuario_roles_service_role_all
  ON public.usuario_roles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
