BEGIN;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES (
    'inventory.stock.view',
    'Consultar existencias por almacén en el catálogo comercial',
    580
)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inventory.stock.view'),
    ('admin_operativo', 'inventory.stock.view'),
    ('gerente_comercial', 'inventory.stock.view'),
    ('coordinador', 'inventory.stock.view'),
    ('agente', 'inventory.stock.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT org.id, permission.codigo, permission.descripcion
FROM public.organizaciones AS org
CROSS JOIN public.tenant_default_permissions AS permission
WHERE permission.codigo = 'inventory.stock.view'
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

WITH role_scope AS (
    SELECT 'inventory.stock.view'::text AS codigo,
           unnest(ARRAY[
               'owner', 'admin', 'admin_operativo', 'gerente_comercial',
               'supervisor', 'coordinador', 'agente'
           ]) AS role_name
)
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT role.organizacion_id, role.id, permission.id
FROM public.roles AS role
JOIN role_scope ON lower(trim(role.nombre)) = role_scope.role_name
JOIN public.permisos AS permission
  ON permission.organizacion_id = role.organizacion_id
 AND permission.codigo = role_scope.codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
