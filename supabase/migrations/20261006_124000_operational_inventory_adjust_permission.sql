BEGIN;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES (
    'inventory.stock.adjust',
    'Registrar ajustes manuales de inventario',
    582
)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'inventory.stock.adjust'),
    ('admin_operativo', 'inventory.stock.adjust')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT organizacion.id, permission.codigo, permission.descripcion
FROM public.organizaciones AS organizacion
CROSS JOIN public.tenant_default_permissions AS permission
WHERE permission.codigo = 'inventory.stock.adjust'
ON CONFLICT (organizacion_id, codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion;

WITH role_scope AS (
    SELECT 'inventory.stock.adjust'::text AS codigo,
           unnest(ARRAY['owner', 'admin_operativo']) AS role_name
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

INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT role.organizacion_id, role.id, permission.id
FROM public.roles AS role
JOIN public.permisos AS permission
  ON permission.organizacion_id = role.organizacion_id
 AND permission.codigo = 'inventory.stock.adjust'
WHERE lower(trim(role.nombre)) = 'gerencia almacen'
   OR role.codigo = '0016'
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
