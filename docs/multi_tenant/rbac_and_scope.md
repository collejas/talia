# RBAC y Scope (Multi-tenant)

Fecha: 2026-02-15

Objetivo
Definir un contrato estable para:
- roles y permisos *dentro* de un tenant (`organizacion_id`)
- acceso cross-tenant para operación de plataforma
- reglas de “scope” jerárquico (jefes/equipo) que gobiernan visibilidad y asignación

## 1) Dos capas: Plataforma vs Tenant

### A) Plataforma (cross-tenant)
Uso: soporte interno, onboarding, configuración/secretos/routing por tenant.

- Identidad: `public.platform_admins(user_id)`
- Alcance: puede operar sobre *cualquier* `organizacion_id` (cross-tenant).
- UI: `/settings/tenants` y endpoints `/api/admin/tenants/*`.
- No debe modelarse como rol tenant en `public.roles` porque esos roles están atados a un `organizacion_id`.

Nombre recomendado:
- `super_admin` (plataforma)

Estado actual (2026-02-15)
- En la BD actual ya existe un `platform_admins` registrado:
  - `b6cc6385-3741-4742-ae83-bcb0d99bc5c5` (`administracion@geoactiv.mx`, Jorge Torre Collejas)

### B) Tenant (por organizacion_id)
Uso: operación diaria del CRM (embudo, inbox, agenda, contactos/clientes, etc.).

- Catálogo: `public.roles(organizacion_id, codigo, nombre, ...)`
- Asignación: `public.usuarios_roles(organizacion_id, usuario_id, rol_id)`
- Capacidades finas: `public.permisos` + `public.roles_permisos`
- UI: `settings/rh` (roles, permisos, usuarios, empleados, jerarquía)

## 2) Scope jerárquico (mandos)

El acceso y filtrado real no es solo por rol; también depende del “equipo” del usuario.

Fuente de verdad:
- `public.empleados_supervisores(empleado_id, supervisor_id, organizacion_id)`

Funciones:
- `public.equipo_usuario_ids(p_uid)` devuelve recursivamente los subordinados del usuario dentro de su organización.
- `public.current_user_team_ids()` devuelve el equipo del usuario actual.
- `public.current_user_scope_ids()` devuelve `yo + mi equipo`.
- `public.is_in_current_user_scope(uid)` es true si `uid == auth.uid()` o pertenece al equipo.

Efecto:
- Vistas y RLS típicamente permiten ver/editar recursos donde `asignado_a_usuario_id` o `propietario_usuario_id` cae dentro de `current_user_scope_ids()`.

## 3) “Admin” en BD: nota importante

Hoy existe `public.es_admin(uid)` y se usa en RLS y funciones.

Hallazgo:
- `es_admin(uid)` solo evalúa verdadero si el usuario tiene un rol con `codigo = 'admin'` (por organización).
- Si existe un rol “alto” con código numérico (ej. `0001`) pero sin el código literal `'admin'`, no se considera admin por esa función.

Implicación:
- Si definimos `owner` / `admin_operativo`, hay que decidir si:
  1) `es_admin` se amplía (ej. `codigo IN ('admin','owner')`), o
  2) se crean funciones separadas (`es_owner`, `es_platform_admin`) y se ajustan políticas/validaciones.

Recomendación:
- Mantener `es_admin` como “superusuario del tenant” y/o crear `es_owner`.
- Mantener la plataforma aparte (`platform_admins`) para cross-tenant.

## 4) Roles v2 (propuestos) por tenant

Estos roles viven en `public.roles` por cada `organizacion_id`:
- `owner` (dueño tenant)
- `admin_operativo`
- `gerente_comercial` (reasigna dentro de su árbol)
- `coordinador` (reasigna dentro de su árbol)
- `agente`
- `capturista`
- `marketing`
- `soporte`
- `auditor`
- (opcional) `finanzas` / `legal`

El “scope” recomendado por rol:
- `owner` / `admin_operativo`: pueden ver todo el tenant (sin depender de equipo).
- `gerente_comercial`: ve su scope jerárquico (árbol completo).
- `coordinador`: ve su scope jerárquico (árbol completo) o solo equipo directo si así se define (ver sección 6).
- `agente`: ve solo lo propio (o su pequeño scope si se le asignan subordinados, raro).
- `auditor`: lectura amplia (típicamente todo el tenant) pero sin escritura.

## 5) Separación sugerida de responsabilidades

- Plataforma (`super_admin`):
  - CRUD tenants, routing, config, secretos, validación, auditoría cross-tenant.
- Tenant (`owner`):
  - Todo lo operativo del tenant: usuarios/roles/permisos, jerarquía, settings de negocio, acceso total a datos.
  - Puede editar `secretos` y `organizacion_rutas_canal` de su propio tenant.
- Tenant (`admin_operativo`):
  - Operación diaria: pipeline, inbox, agenda, contactos/clientes, reportes; gestión limitada de usuarios/roles.

## 6) Reglas de reasignación (para el plan)

Para “cambiar vendedor” (reasignar) de oportunidad/contacto:
- `owner`/`admin_operativo`: pueden reasignar a cualquier vendedor del tenant.
- `gerente_comercial`: puede reasignar dentro de su árbol (`equipo_usuario_ids(gerente)` + él mismo).
- `coordinador`: puede reasignar dentro de su árbol (recursivo) igual que `gerente_comercial`.
- `agente`: no puede reasignar.

Siempre:
- misma `organizacion_id`
- registrar auditoría (actor, from/to, motivo, timestamp)

Efecto esperado (alineación de asignaciones):
- `oportunidades.asignado_a_usuario_id` (vendedor asignado)
- `contactos.propietario_usuario_id` (vendedor asignado del contacto)
- `conversaciones.asignado_a_usuario_id` (asignado del inbox)

No se cambia (para preservar el origen/creador):
- `oportunidades.propietario_usuario_id`

## 7) Checklist técnico: acceso `owner` (RLS + endpoints)

Para que `owner` tenga acceso total a su tenant sin depender de `es_admin`, revisar y ajustar:

Funciones SQL (agregar `es_owner` donde hoy se usa `es_admin`):
- `public.puede_ver_contacto`
- `public.puede_ver_conversacion`
- `public.puede_ver_lead` (si aplica)
- Cualquier función de “scope” que use `es_admin` como bypass total.

Políticas RLS (agregar `es_owner` en las condiciones de “admin_all”):
- `contactos_admin_all`
- `clientes_admin_all`
- `oportunidades_admin_all`
- `usuarios_insert_admin` / `usuarios_update` / `usuarios_delete_admin`
- `empleados_insert_admin` / `empleados_update_admin` / `empleados_delete_admin`

Endpoints backend:
- `/api/admin/*` (hoy “platform admin only”): permitir `owner` **solo** para su `organizacion_id`.
- Endpoints de settings/roles/permisos que hoy asumen `es_admin` (validar que `owner` tenga acceso).

Datos a exponer en permisos:
- Si el panel necesita distinguir `owner`, agregar `es_owner` al payload de `/api/permissions` (o equivalente) para UI.

## 8) Dependencias técnicas de `owner`

Para que el rol `owner` funcione como “dueño” del tenant (sin acceso cross-tenant):
- `public.es_owner(uid)` debe existir y evaluarse en RLS/funciones que hacen bypass por admin.
- `public.mi_contexto_permisos()` debe exponer `es_owner` (o el rol debe incluirse en `roles[]`) para que el backend pueda decidir acceso.
- Los endpoints `/api/admin/tenants/*` deben aceptar `owner` solo si el `organizacion_id` solicitado coincide con su tenant.
- Acceso explícito a `organizaciones.config`, `organizacion_rutas_canal` y `secretos` del tenant, pero no a otros tenants.
