# Plan de implementación: tenant switch para `platform_admin`

Fecha: 2026-03-26

## Objetivo

Permitir que el usuario `platform_admin` opere vistas tenant-scoped (por ejemplo `settings/usuarios`) sobre cualquier tenant, sin romper el aislamiento multi-tenant y sin cambiar el modelo actual de identidad.

## Contexto y decisión de arquitectura

- Modelo actual confirmado:
  - `public.usuarios` pertenece a un solo `organizacion_id`.
  - `public.usuarios.correo` es único global.
  - `public.usuarios_roles` se valida por `(organizacion_id, usuario_id, rol_id)`.
- Con ese modelo, **no** conviene duplicar el mismo correo en todos los tenants.
- Patrón recomendado:
  - `platform_admin`: acceso cross-tenant de plataforma.
  - `owner`: acceso solo a su tenant.
  - `tenant switch` para definir el tenant operativo actual del `platform_admin`.

## Alcance

Incluye:
- Selector de tenant operativo para `platform_admin`.
- Propagación segura del tenant seleccionado a vistas existentes tenant-scoped.
- Guardas anti-fuga de tenant en backend.
- Auditoría de contexto efectivo.

No incluye:
- Refactor de modelo de identidad a usuarios multi-tenant nativos.
- Login con selector empresa/correo/contraseña.

## Avance actual (2026-03-26)

- [x] TKT-01 completado.
- [x] TKT-02 completado.
- [ ] TKT-03 pendiente.
- [x] TKT-04 completado (botón de entrada desde detalle tenant).
- [ ] TKT-05 pendiente.
- [ ] TKT-06 pendiente.
- [ ] TKT-07 pendiente.
- [ ] TKT-08 pendiente.

Cambios implementados:
- Cookie de contexto de tenant: `talia.tenant_context`.
- Endpoint interno del panel para contexto:
  - `GET /api/platform-admin/tenant-context`
  - `PUT /api/platform-admin/tenant-context`
  - `DELETE /api/platform-admin/tenant-context`
- Validación de seguridad en `PUT`:
  - verifica `platform_admin` con `/admin/me/platform-admin`.
  - valida existencia del tenant con `/admin/tenants/{tenant_id}`.
- Resolución de organización ajustada:
  - `frontend/panel/src/lib/settings/org.ts`
  - usa override solo cuando el usuario es `platform_admin`.
  - mantiene fallback al `organizacion_id` del JWT para usuarios normales.
- Limpieza de contexto en flujo de sesión:
  - login/logout/session limpian `talia.tenant_context`.
- Integración en detalle tenant:
  - botón “Operar este tenant” en `/settings/tenants/[tenantId]`
  - setea contexto y redirige a `/settings/usuarios`.

## Tickets de implementación

### TKT-01: Tenant Context (server-side)

Objetivo:
- Definir tenant activo por sesión para `platform_admin`.

Cambios:
- Panel API: `PUT /api/platform-admin/tenant-context` (set), `DELETE /api/platform-admin/tenant-context` (clear), `GET /api/platform-admin/tenant-context` (read).
- Autorización: `require_platform_admin`.
- Persistencia: cookie de sesión httpOnly (o mecanismo equivalente server-side).

Entregable:
- Contexto de tenant activo persistente durante sesión.

Riesgo:
- Bajo.

Estimación:
- 0.5 - 1 día.

### TKT-02: Resolver `organizacion_id` con override seguro

Objetivo:
- Que el tenant activo controle las vistas tenant-scoped cuando el actor es `platform_admin`.

Cambios:
- Frontend server util: ajustar resolución de org en `frontend/panel/src/lib/settings/org.ts`.
- Regla:
  - Usuario normal/owner: usar `organizacion_id` del JWT.
  - `platform_admin`: permitir override desde tenant context.
- Mantener `enforceOrganization` en llamadas REST.

Entregable:
- Vistas como `settings/usuarios`, `settings/roles`, `settings/permisos`, `settings/empleados` responden al tenant activo.

Riesgo:
- Medio (impacto transversal en lectura/escritura de datos tenant-scoped).

Estimación:
- 1 día.

### TKT-03: UI switcher de tenant

Objetivo:
- Exponer control de cambio de tenant solo a `platform_admin`.

Cambios:
- Sidebar/header: selector de tenant.
- Banner: “Operando como tenant: {nombre}”.
- Acción: “Salir de contexto”.

Entregable:
- Cambio de tenant operativo sin relogin.

Riesgo:
- Bajo.

Estimación:
- 1 día.

### TKT-04: Integración con `/settings/tenants`

Objetivo:
- Iniciar operación tenant-scoped directo desde detalle de tenant.

Cambios:
- Botón “Operar este tenant” en `/settings/tenants/[tenantId]`.
- Acción: set context + redirect (ej. `/settings/usuarios`).

Entregable:
- Flujo onboarding -> operación inmediato.

Riesgo:
- Bajo.

Estimación:
- 0.5 día.

### TKT-05: Guardas backend anti-fuga

Objetivo:
- Blindar accesos cross-tenant no autorizados.

Cambios:
- Validar que operaciones con `organizacion_id` explícito solo acepten:
  - `platform_admin` cross-tenant.
  - `owner` dentro de su tenant (`owner_scope_violation` fuera de scope).
- Revisión de endpoints operativos sensibles para rechazar override ilegal.

Entregable:
- Cero cruce accidental de tenant.

Riesgo:
- Medio.

Estimación:
- 1 día.

### TKT-06: Auditoría de contexto efectivo

Objetivo:
- Trazabilidad completa del actor y tenant objetivo.

Cambios:
- Log estructurado en backend:
  - `actor_user_id`
  - `is_platform_admin`
  - `effective_organizacion_id`
  - acción y endpoint
- Opcional recomendado: tabla de auditoría dedicada.

Entregable:
- Evidencia verificable de operación cross-tenant.

Riesgo:
- Bajo.

Estimación:
- 0.5 - 1 día.

### TKT-07: QA de aceptación RBAC

Objetivo:
- Validar funcional y seguridad end-to-end.

Pruebas mínimas:
- `platform_admin` opera tenant A y tenant B correctamente.
- `owner` solo opera su tenant.
- Usuario normal no puede cambiar tenant efectivo.
- Listados y altas/ediciones de `settings/usuarios` obedecen tenant activo.

Referencia:
- `docs/multi_tenant/rbac_acceptance_tests.md`

Entregable:
- Checklist de aceptación completado.

Riesgo:
- Bajo.

Estimación:
- 0.5 día.

### TKT-08: Actualización documental y runbook

Objetivo:
- Alinear documentación funcional y técnica al tenant switch.

Cambios:
- Actualizar:
  - `docs/Instructivo_creacion_tenant/crear_tenant.md`
  - `docs/multi_tenant/plan_admin_ui_tenants.md`
  - `docs/multi_tenant/tenants_onboarding.md`
- Agregar flujo operativo para soporte/plataforma.

Entregable:
- Runbook de operación y troubleshooting.

Riesgo:
- Bajo.

Estimación:
- 0.5 día.

## Orden recomendado

1. TKT-01
2. TKT-02
3. TKT-03
4. TKT-04
5. TKT-05
6. TKT-06
7. TKT-07
8. TKT-08

## Estimación total

- 5 a 7 días hábiles.

## Criterios de éxito

- `platform_admin` puede operar cualquier tenant sin relogin y con trazabilidad.
- `owner` mantiene aislamiento estricto a su tenant.
- No hay fugas de datos entre tenants en vistas operativas.
- El onboarding y la operación diaria quedan cubiertos sin cambios manuales en `.env`.
