# Matriz de permisos por rol (v2)

Fecha: 2026-02-15

Estado
Matriz aprobada para uso en tenants desde el 23 de septiembre de 2026. La matriz v1 queda como referencia histórica para los roles legacy.

Objetivo
Definir un set de roles “de negocio” para inmobiliarias (tenant) y separar claramente el acceso de plataforma (cross-tenant).

Notas
- Los roles tenant viven en `public.roles` por `organizacion_id`.
- El catálogo central de defaults vive en `public.tenant_default_roles`, `public.tenant_default_permissions` y `public.tenant_default_role_permissions`.
- Al crear una organización, el trigger `bootstrap_new_tenant_defaults` copia los roles, permisos, departamentos, puestos y etapas base a sus tablas tenant-scoped. Cada tenant conserva su propia asignación editable de roles.
- El acceso cross-tenant NO es un rol tenant: usar `public.platform_admins` (super_admin).
- El “scope” (equipo/jerarquía) se controla con `empleados_supervisores` + `equipo_usuario_ids` / `is_in_current_user_scope`.
- La matriz aplica a roles del tenant; no concede acceso cross-tenant.

## Plataforma (cross-tenant)

| Actor | Dónde vive | Puede |
| --- | --- | --- |
| super_admin | `public.platform_admins` | CRUD tenants, routing, config, secretos, validación, debug cross-tenant |

## Roles tenant (v2)

Roles propuestos (códigos sugeridos):
- `owner`
- `admin_operativo`
- `gerente_comercial`
- `coordinador`
- `agente`
- `capturista`
- `marketing`
- `soporte`
- `auditor`
- `finanzas` (opcional)
- `legal` (opcional)

## Permisos (códigos existentes)

Estos ya existen o ya se usan en backend/panel:
- Core panel: `ver_panel`
- Inbox/Conversaciones: `ver_inbox`, `conv.read`, `conv.write`, `conv.assign`, `messages.read`, `messages.write`
- CRM: `pipeline.view`, `leads.view`, `contacts.read`, `contacts.write`, `contacts.delete`, `clientes.view`
- Agenda/Propuesta: `agenda.view`, `propuesta.view`
- Reportes: `reports.view`
- Prospección: `busquedas.view`, `busquedas.run`, `busquedas.delete`, `campaigns.view`
- Settings: `settings.view`, `settings.manage`, `user.manage`, `role.manage`
- Auditoría/otros: `audit.view`, `tickets.view`, `activities.view`, `notes.view`, `files.view`, `propiedades.view`

## Permisos nuevos (propuestos)

Estos son para cubrir control fino de jerarquías y reasignaciones.

- `pipeline.reassign.team` (reasignar oportunidades dentro del scope jerárquico)
- `pipeline.reassign.any` (reasignar a cualquiera dentro del tenant)
- `contacts.reassign.team` (cambiar propietario de contacto dentro del scope)
- `contacts.reassign.any` (cambiar propietario a cualquiera dentro del tenant)
- `contacts.view_sensitive_unowned` (ver teléfono, email y dirección de contactos ajenos al propietario)
- `accounts.view_sensitive_unowned` (ver teléfono, email y dirección de empresas ajenas al propietario)
- `contacts.export_csv` (exportar CSV desde la vista de contactos)
- `audit.view_all` (ver auditoría completa del tenant)
- `settings.secrets.manage` (si en el futuro se delega secretos del tenant sin platform admin)
- `pipeline.opportunities.delete` (eliminar una oportunidad propia o asignada; no elimina contacto ni empresa)

Nota de comportamiento (reasignación)
- La operación “cambiar vendedor” debe alinear:
  - `oportunidades.asignado_a_usuario_id`
  - `contactos.propietario_usuario_id`
  - `conversaciones.asignado_a_usuario_id`
- No debe cambiar `oportunidades.propietario_usuario_id` (para conservar el registro del creador).

## Permisos por rol (tenant)

Regla general: además del permiso, se respeta el “scope” (equipo) salvo `owner/admin_operativo` que típicamente ven todo el tenant.

| Rol | Permisos |
| --- | --- |
| owner | ver_panel, ver_inbox, conv.read, conv.write, conv.assign, messages.read, messages.write, contacts.read, contacts.write, contacts.delete, clientes.view, leads.view, pipeline.view, agenda.view, propuesta.view, reports.view, busquedas.view, busquedas.run, busquedas.delete, campaigns.view, activities.view, notes.view, files.view, tickets.view, audit.view, audit.view_all (nuevo), user.manage, role.manage, settings.view, settings.manage, pipeline.reassign.any (nuevo), contacts.reassign.any (nuevo) |
| admin_operativo | ver_panel, ver_inbox, conv.read, conv.write, conv.assign, messages.read, messages.write, contacts.read, contacts.write, contacts.delete, clientes.view, leads.view, pipeline.view, agenda.view, propuesta.view, reports.view, busquedas.view, busquedas.run, campaigns.view, activities.view, notes.view, files.view, tickets.view, audit.view, pipeline.reassign.any (nuevo), contacts.reassign.any (nuevo), settings.view, user.manage (limitado) |
| gerente_comercial | ver_panel, ver_inbox, conv.read, conv.write, conv.assign, messages.read, messages.write, contacts.read, contacts.write, contacts.delete, clientes.view, leads.view, pipeline.view, agenda.view, propuesta.view, reports.view, busquedas.view, busquedas.run, campaigns.view, tickets.view, audit.view, pipeline.reassign.team (nuevo), contacts.reassign.team (nuevo) |
| coordinador | ver_panel, ver_inbox, conv.read, conv.write, messages.read, messages.write, contacts.read, contacts.write, contacts.delete, clientes.view, leads.view, pipeline.view, agenda.view, propuesta.view, reports.view, tickets.view, pipeline.reassign.team (nuevo), contacts.reassign.team (nuevo) |
| agente | ver_panel, ver_inbox, conv.read, conv.write, messages.read, messages.write, contacts.read, contacts.write, clientes.view, leads.view, pipeline.view, pipeline.opportunities.delete (nuevo), agenda.view, propuesta.view |
| capturista | ver_panel, contacts.read, contacts.write (limitado), pipeline.view (solo lectura), clientes.view (solo lectura), agenda.view (solo lectura) |
| marketing | ver_panel, busquedas.view, busquedas.run, campaigns.view, contacts.read, messages.read, reports.view |
| soporte | ver_panel, ver_inbox, conv.read, conv.write, messages.read, messages.write, tickets.view |
| auditor | ver_panel, reports.view, audit.view, audit.view_all (nuevo), pipeline.view (solo lectura), contacts.read, clientes.view, conv.read, messages.read |
| finanzas | ver_panel, pipeline.view, clientes.view, contacts.read, propuesta.view, reports.view, files.view |
| legal | ver_panel, pipeline.view, clientes.view, contacts.read, propuesta.view, reports.view, files.view |

## Vistas (recordatorio)

- `/settings/variables` es la vista principal para owner/admin del tenant (sobre su propia `organizacion_id`).
- `/settings/tenants` se oculta en UI para no-platform-admin; si un owner llega por URL, backend debe limitar a su organización y bloquear acceso fuera de scope.

## Aplicación en roles legacy existentes

Para conservar usuarios durante la transición, los roles legacy reciben temporalmente el conjunto equivalente: `Admin` → `admin_operativo`, `Supervisor` → `gerente_comercial`, `Agente` → `agente`. `Invitado` queda sin permisos; asignar roles v2 a sus usuarios según su función.

## Aprovisionamiento común

Los catálogos centrales son la fuente de los defaults para todos los tenants. Los registros en `roles`, `permisos` y `roles_permisos` siguen ligados a `organizacion_id` para mantener el aislamiento y permitir ajustes por organización. La creación de tenants ya no depende de una matriz de permisos cargada desde archivos del backend ni de sincronización automática al arrancar.

## Migración (resumen)

1) Crear roles v2 por tenant (sin quitar roles legacy).
2) Crear permisos nuevos en `public.permisos`.
3) Asignar roles v2 a usuarios gradualmente.
4) Ajustar backend/UI para usar permisos nuevos en reasignación (y auditoría amplia).
5) Deprecar roles legacy (`0001/0002/0003/admin`) cuando ya no se usen.
