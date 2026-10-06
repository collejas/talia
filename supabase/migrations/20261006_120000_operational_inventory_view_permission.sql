BEGIN;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES (
    'inventory.operations.view',
    'Consultar inventario operativo y existencias por almacén',
    581
)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inventory.operations.view'),
    ('admin', 'inventory.operations.view'),
    ('admin_operativo', 'inventory.operations.view'),
    ('supervisor', 'inventory.operations.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT organizacion.id, permission.codigo, permission.descripcion
FROM public.organizaciones AS organizacion
CROSS JOIN public.tenant_default_permissions AS permission
WHERE permission.codigo = 'inventory.operations.view'
ON CONFLICT (organizacion_id, codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion;

WITH role_scope AS (
    SELECT 'inventory.operations.view'::text AS codigo,
           unnest(ARRAY['owner', 'admin', 'admin_operativo', 'supervisor']) AS role_name
)
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT role.organizacion_id, role.id, permission.id
FROM public.roles AS role
JOIN role_scope
  ON lower(trim(role.nombre)) = role_scope.role_name
JOIN public.permisos AS permission
  ON permission.organizacion_id = role.organizacion_id
 AND permission.codigo = role_scope.codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
