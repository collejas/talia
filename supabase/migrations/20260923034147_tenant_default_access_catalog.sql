BEGIN;

-- Catálogo común que sirve de plantilla para todos los tenants.
CREATE TABLE IF NOT EXISTS public.tenant_default_roles (
    codigo text PRIMARY KEY,
    nombre text NOT NULL UNIQUE,
    descripcion text NOT NULL,
    orden integer NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_default_permissions (
    codigo text PRIMARY KEY,
    descripcion text NOT NULL,
    orden integer NOT NULL DEFAULT 100,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_default_role_permissions (
    rol_codigo text NOT NULL REFERENCES public.tenant_default_roles(codigo) ON DELETE CASCADE,
    permiso_codigo text NOT NULL REFERENCES public.tenant_default_permissions(codigo) ON DELETE CASCADE,
    creado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (rol_codigo, permiso_codigo)
);

CREATE INDEX IF NOT EXISTS tenant_default_role_permissions_permission_idx
    ON public.tenant_default_role_permissions (permiso_codigo, rol_codigo);

ALTER TABLE public.tenant_default_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_default_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_default_role_permissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_default_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tenant_default_permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tenant_default_role_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_default_roles TO service_role;
GRANT SELECT ON public.tenant_default_permissions TO service_role;
GRANT SELECT ON public.tenant_default_role_permissions TO service_role;

DROP POLICY IF EXISTS tenant_default_roles_service_read ON public.tenant_default_roles;
CREATE POLICY tenant_default_roles_service_read ON public.tenant_default_roles
    FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS tenant_default_permissions_service_read ON public.tenant_default_permissions;
CREATE POLICY tenant_default_permissions_service_read ON public.tenant_default_permissions
    FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS tenant_default_role_permissions_service_read ON public.tenant_default_role_permissions;
CREATE POLICY tenant_default_role_permissions_service_read ON public.tenant_default_role_permissions
    FOR SELECT TO service_role USING (true);
-- V2 es la matriz base común. Los tenants conservan sus asignaciones existentes;
-- esta plantilla solo se usa al crear roles o tenants nuevos.
INSERT INTO public.tenant_default_roles (codigo, nombre, descripcion, orden)
VALUES
    ('owner', 'owner', 'Propietario de la organización', 10),
    ('admin_operativo', 'admin_operativo', 'Administrador operativo', 20),
    ('gerente_comercial', 'gerente_comercial', 'Gerente comercial', 30),
    ('coordinador', 'coordinador', 'Coordinador comercial', 40),
    ('agente', 'agente', 'Agente comercial', 50),
    ('capturista', 'capturista', 'Captura y apoyo operativo', 60),
    ('marketing', 'marketing', 'Prospección y campañas', 70),
    ('soporte', 'soporte', 'Atención e inbox', 80),
    ('auditor', 'auditor', 'Lectura y auditoría', 90),
    ('finanzas', 'finanzas', 'Finanzas', 100),
    ('legal', 'legal', 'Legal', 110)
ON CONFLICT (codigo) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    orden = EXCLUDED.orden,
    activo = true,
    actualizado_en = now();

-- Conserva las descripciones útiles del catálogo actual y recupera los códigos
-- que ya existían en cualquiera de los tenants.
INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
SELECT
    p.codigo,
    coalesce(
        max(nullif(trim(p.descripcion), '')) FILTER (
            WHERE lower(trim(coalesce(p.descripcion, ''))) <> lower(trim(p.codigo))
        ),
        p.codigo
    ),
    row_number() OVER (ORDER BY p.codigo)::integer * 10
FROM public.permisos p
GROUP BY p.codigo
ON CONFLICT (codigo) DO NOTHING;

-- Permisos incluidos en V2 que podrían no estar aún en ningún tenant.
INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES
    ('pipeline.opportunities.delete', 'Eliminar oportunidades propias o asignadas sin eliminar contacto o empresa', 420),
    ('audit.view_all', 'Ver la auditoría completa de la organización', 430),
    ('pipeline.reassign.team', 'Reasignar oportunidades dentro del equipo', 440),
    ('pipeline.reassign.any', 'Reasignar oportunidades dentro de la organización', 450),
    ('contacts.reassign.team', 'Reasignar contactos dentro del equipo', 460),
    ('contacts.reassign.any', 'Reasignar contactos dentro de la organización', 470)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

UPDATE public.tenant_default_permissions AS p
SET descripcion = definitions.descripcion,
    actualizado_en = now()
FROM (
    VALUES
        ('accounts.view_sensitive_unowned', 'Ver datos sensibles de empresas fuera de su propiedad'),
        ('contacts.delete', 'Eliminar contactos'),
        ('contacts.export_csv', 'Exportar contactos a CSV'),
        ('contacts.view_sensitive_unowned', 'Ver datos sensibles de contactos fuera de su propiedad'),
        ('roles.write', 'Crear y actualizar roles'),
        ('usuarios.write', 'Crear y actualizar usuarios'),
        ('ver_busquedas_google', 'Consultar búsquedas de Google'),
        ('ver_busquedas_inegi', 'Consultar búsquedas de INEGI'),
        ('ejecutar_busquedas', 'Ejecutar búsquedas')
) AS definitions(codigo, descripcion)
WHERE p.codigo = definitions.codigo;

UPDATE public.permisos AS p
SET descripcion = catalog.descripcion
FROM public.tenant_default_permissions AS catalog
WHERE p.codigo = catalog.codigo
  AND catalog.descripcion <> p.codigo
  AND (p.descripcion IS NULL OR trim(p.descripcion) = p.codigo);

-- Una única matriz normalizada mantiene el mismo default para cada alta.
WITH role_permissions (rol_codigo, permission_codes) AS (
    VALUES
        ('owner', ARRAY['ver_panel','ver_inbox','conv.read','conv.write','conv.assign','messages.read','messages.write','contacts.read','contacts.write','contacts.delete','clientes.view','leads.view','pipeline.view','agenda.view','propuesta.view','reports.view','busquedas.view','busquedas.run','busquedas.delete','campaigns.view','activities.view','notes.view','files.view','tickets.view','audit.view','audit.view_all','user.manage','role.manage','settings.view','settings.manage','pipeline.reassign.any','contacts.reassign.any']::text[]),
        ('admin_operativo', ARRAY['ver_panel','ver_inbox','conv.read','conv.write','conv.assign','messages.read','messages.write','contacts.read','contacts.write','contacts.delete','clientes.view','leads.view','pipeline.view','agenda.view','propuesta.view','reports.view','busquedas.view','busquedas.run','campaigns.view','activities.view','notes.view','files.view','tickets.view','audit.view','pipeline.reassign.any','contacts.reassign.any','settings.view','user.manage']::text[]),
        ('gerente_comercial', ARRAY['ver_panel','ver_inbox','conv.read','conv.write','conv.assign','messages.read','messages.write','contacts.read','contacts.write','contacts.delete','clientes.view','leads.view','pipeline.view','agenda.view','propuesta.view','reports.view','busquedas.view','busquedas.run','campaigns.view','tickets.view','audit.view','pipeline.reassign.team','contacts.reassign.team']::text[]),
        ('coordinador', ARRAY['ver_panel','ver_inbox','conv.read','conv.write','messages.read','messages.write','contacts.read','contacts.write','contacts.delete','clientes.view','leads.view','pipeline.view','agenda.view','propuesta.view','reports.view','tickets.view','pipeline.reassign.team','contacts.reassign.team']::text[]),
        ('agente', ARRAY['ver_panel','ver_inbox','conv.read','conv.write','messages.read','messages.write','contacts.read','contacts.write','clientes.view','leads.view','pipeline.view','pipeline.opportunities.delete','agenda.view','propuesta.view']::text[]),
        ('capturista', ARRAY['ver_panel','contacts.read','contacts.write','pipeline.view','clientes.view','agenda.view']::text[]),
        ('marketing', ARRAY['ver_panel','busquedas.view','busquedas.run','campaigns.view','contacts.read','messages.read','reports.view']::text[]),
        ('soporte', ARRAY['ver_panel','ver_inbox','conv.read','conv.write','messages.read','messages.write','tickets.view']::text[]),
        ('auditor', ARRAY['ver_panel','reports.view','audit.view','audit.view_all','pipeline.view','contacts.read','clientes.view','conv.read','messages.read']::text[]),
        ('finanzas', ARRAY['ver_panel','pipeline.view','clientes.view','contacts.read','propuesta.view','reports.view','files.view']::text[]),
        ('legal', ARRAY['ver_panel','pipeline.view','clientes.view','contacts.read','propuesta.view','reports.view','files.view']::text[])
)
INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
SELECT rp.rol_codigo, p.codigo
FROM role_permissions rp
CROSS JOIN LATERAL unnest(rp.permission_codes) AS p(codigo)
ON CONFLICT DO NOTHING;

-- Completa el catálogo local de todos los tenants sin reemplazar ni resetear
-- permisos ya personalizados.
INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT o.id, p.codigo, p.descripcion
FROM public.organizaciones o
CROSS JOIN public.tenant_default_permissions p
WHERE p.activo
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

-- Crea solo roles V2 faltantes. Sus permisos iniciales se asignan únicamente
-- durante esta inserción; los roles existentes conservan su matriz actual.
WITH inserted_roles AS (
    INSERT INTO public.roles (organizacion_id, nombre, descripcion)
    SELECT o.id, dr.nombre, dr.descripcion
    FROM public.organizaciones o
    CROSS JOIN public.tenant_default_roles dr
    WHERE dr.activo
      AND NOT EXISTS (
          SELECT 1 FROM public.roles r
          WHERE r.organizacion_id = o.id
            AND lower(trim(r.nombre)) = lower(trim(dr.nombre))
      )
    RETURNING organizacion_id, id, nombre
)
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT ir.organizacion_id, ir.id, p.id
FROM inserted_roles ir
JOIN public.tenant_default_roles dr
  ON lower(trim(dr.nombre)) = lower(trim(ir.nombre))
JOIN public.tenant_default_role_permissions drp ON drp.rol_codigo = dr.codigo
JOIN public.permisos p
  ON p.organizacion_id = ir.organizacion_id
 AND p.codigo = drp.permiso_codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

-- La eliminación de oportunidad es parte explícita del rol agente V2.
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT r.organizacion_id, r.id, p.id
FROM public.roles r
JOIN public.permisos p
  ON p.organizacion_id = r.organizacion_id
 AND p.codigo = 'pipeline.opportunities.delete'
WHERE lower(trim(r.nombre)) = 'agente'
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

-- Materializa los departamentos y puestos centrales en los tenants existentes.
INSERT INTO public.departamentos (organizacion_id, nombre)
SELECT o.id, c.nombre
FROM public.organizaciones o
CROSS JOIN public.tenant_bootstrap_catalog c
WHERE c.tipo = 'departamento' AND c.activo
ON CONFLICT (organizacion_id, nombre) DO NOTHING;

INSERT INTO public.puestos (organizacion_id, nombre)
SELECT o.id, c.nombre
FROM public.organizaciones o
CROSS JOIN public.tenant_bootstrap_catalog c
WHERE c.tipo = 'puesto' AND c.activo
  AND NOT EXISTS (
      SELECT 1 FROM public.puestos p
      WHERE p.organizacion_id = o.id
        AND lower(trim(p.nombre)) = lower(trim(c.nombre))
  );

-- Todo alta de organización obtiene los mismos defaults, sin depender del
-- endpoint que inició el alta.
CREATE OR REPLACE FUNCTION public.bootstrap_new_tenant_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
    SELECT NEW.id, p.codigo, p.descripcion
    FROM public.tenant_default_permissions p
    WHERE p.activo
    ON CONFLICT (organizacion_id, codigo) DO NOTHING;

    INSERT INTO public.roles (organizacion_id, nombre, descripcion)
    SELECT NEW.id, r.nombre, r.descripcion
    FROM public.tenant_default_roles r
    WHERE r.activo
    ON CONFLICT DO NOTHING;

    INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
    SELECT NEW.id, r.id, p.id
    FROM public.tenant_default_role_permissions rp
    JOIN public.tenant_default_roles dr ON dr.codigo = rp.rol_codigo AND dr.activo
    JOIN public.roles r
      ON r.organizacion_id = NEW.id
     AND lower(trim(r.nombre)) = lower(trim(dr.nombre))
    JOIN public.permisos p
      ON p.organizacion_id = NEW.id
     AND p.codigo = rp.permiso_codigo
    ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

    INSERT INTO public.departamentos (organizacion_id, nombre)
    SELECT NEW.id, c.nombre
    FROM public.tenant_bootstrap_catalog c
    WHERE c.tipo = 'departamento' AND c.activo
    ON CONFLICT (organizacion_id, nombre) DO NOTHING;

    INSERT INTO public.puestos (organizacion_id, nombre)
    SELECT NEW.id, c.nombre
    FROM public.tenant_bootstrap_catalog c
    WHERE c.tipo = 'puesto' AND c.activo
      AND NOT EXISTS (
          SELECT 1 FROM public.puestos p
          WHERE p.organizacion_id = NEW.id
            AND lower(trim(p.nombre)) = lower(trim(c.nombre))
      );

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.bootstrap_new_tenant_defaults() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_bootstrap_new_tenant_defaults ON public.organizaciones;
CREATE TRIGGER trg_bootstrap_new_tenant_defaults
AFTER INSERT ON public.organizaciones
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_new_tenant_defaults();

COMMIT;
