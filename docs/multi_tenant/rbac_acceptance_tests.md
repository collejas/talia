# RBAC: criterios de aceptación y pruebas (v1)

Fecha: 2026-02-15

Objetivo
Definir pruebas manuales/QA para validar que roles v2, scope jerárquico y reasignación funcionan igual en embudo, oportunidades, contactos e inbox.

## Preparación

- Tenant legacy: `00000000-0000-0000-0000-000000000001`
- Jerarquía: `empleados_supervisores` configurado (árbol).
- Usuarios de prueba:
  - `super_admin` (plataforma): usuario en `public.platform_admins`.
  - `owner` (tenant): usuario con rol `owner` en el tenant.
  - `admin_operativo`
  - `gerente_comercial`
  - `coordinador`
  - `agente`
  - `auditor`

## A) Plataforma (super_admin)

1) `/settings/tenants` visible y operable.
2) Puede editar cualquier tenant (cross-tenant):
   - `organizaciones.config`
   - `organizacion_rutas_canal`
   - `secretos` (A/B)
3) No depende de roles tenant para operar en `/api/admin/*`.

## B) Owner (tenant)

1) Puede operar *solo su tenant* en `/api/admin/*`:
   - config, rutas, secretos (A/B).
2) Puede ver todo el CRM del tenant:
   - embudo completo (todas las oportunidades del tenant)
   - inbox completo
   - contactos/clientes completos
3) Puede reasignar a cualquier vendedor del tenant:
   - ejecuta alineación (oportunidad/contacto/conversación)
   - NO cambia `oportunidades.propietario_usuario_id`.

## C) Admin operativo (tenant)

1) Puede operar embudo/inbox/contactos/agenda según permisos.
2) Reasignación:
   - si tiene `pipeline.reassign.any`, puede reasignar a cualquier vendedor del tenant.
3) No debe tener acceso cross-tenant (no entra a otros tenants).

## D) Gerente comercial (tenant)

1) Visibilidad: solo su scope (árbol) + lo propio.
2) Reasignación:
   - con `pipeline.reassign.team`, puede reasignar dentro de su árbol recursivo.
   - no puede reasignar fuera del árbol.

## E) Coordinador (tenant)

1) Visibilidad: solo su scope (árbol) + lo propio.
2) Reasignación:
   - con `pipeline.reassign.team`, puede reasignar dentro de su árbol recursivo (igual que gerente).

## F) Agente (tenant)

1) Embudo:
   - ve solo oportunidades asignadas a él (o dentro de su scope si existiera, normalmente solo él).
   - no ve filtro “Vendedor”.
2) KPIs:
   - se calculan solo para sus oportunidades en la vista.
3) No ve botones de reasignación.

## G) Auditor (tenant)

1) No puede editar datos operativos.
2) Si tiene `audit.view_all`:
   - ve auditoría completa del tenant.
3) Puede leer embudo/contactos/inbox solo en modo lectura (según permisos finales).

## H) Pruebas funcionales de reasignación (core)

Caso base: oportunidad abierta con:
- `oportunidades.asignado_a_usuario_id = Vendedor A`
- `contactos.propietario_usuario_id = Vendedor A`
- conversación asociada con `conversaciones.asignado_a_usuario_id = Vendedor A`
- `oportunidades.propietario_usuario_id = Creador X`

Pasos:
1) Actor con permiso reasigna a Vendedor B.
2) Verificar:
   - oportunidad asignada a B
   - contacto propietario = B
   - conversación asignada = B
   - propietario (creador) de oportunidad sigue siendo X
   - auditoría creada con from/to y actor
3) Verificar visibilidad:
   - A deja de ver (si fuera agente y ya no está en scope)
   - B comienza a ver

