# Roadmap RBAC (roles v2 + plataforma)

Fecha: 2026-02-15

Objetivo
Aterrizar el trabajo para migrar desde roles legacy (`0001/0002/0003/admin`) a roles v2 (owner/admin_operativo/...) y separar plataforma (`super_admin`).

## Fase 0: Decisiones (bloqueantes)

- Elegir definición de “admin del tenant”:
  - Opción A: `es_admin(uid)` considera admin si tiene rol `codigo IN ('admin','owner')`.
  - Opción B: `es_admin` queda igual y se crea `es_owner`. Se actualizan políticas/validaciones a la combinación correcta.
- Definir si `owner` puede:
  - ver/rotar secretos del tenant (nivel A/B) o si eso se queda solo en plataforma.
- Definir si `coordinador` significa:
  - equipo directo solamente (1 nivel), o
  - árbol completo (recursivo) igual a `gerente_comercial`.

Decisiones tomadas (2026-02-15)
- Se elige Opción B: `owner` NO cuenta dentro de `es_admin`. Se crea `es_owner` y se ajustan políticas/validaciones donde aplique.
- `coordinador` opera con árbol completo (recursivo).
- `owner` (tenant) puede editar secretos y `organizacion_rutas_canal` de su propio tenant.
- La reasignación alinea `oportunidades.asignado_a_usuario_id`, `contactos.propietario_usuario_id` y `conversaciones.asignado_a_usuario_id` sin cambiar `oportunidades.propietario_usuario_id`.

## Fase 1: Preparación (sin cambios de comportamiento)

- BD (tenant):
  - Crear roles v2 en `public.roles` para el tenant legacy `000...001`.
  - Mantener roles legacy coexistiendo.
- Permisos:
  - Agregar permisos nuevos propuestos (si se aprueban): reasignación y auditoría amplia.
  - Mantener permisos existentes.
- Panel:
  - En `settings/rh`, soportar asignar estos roles v2 (ya debería ser automático al existir en `roles`).
- Documentación:
  - Validar y cerrar `docs/Roles de acceso/Matriz-permisos-v2.md`.

## Fase 2: Reasignación de vendedor (feature)

Backend:
- Endpoint: “reasignar oportunidad” (y opcionalmente contacto/conversación).
- Validación:
  - permiso `pipeline.reassign.team` o `pipeline.reassign.any`
  - regla jerárquica usando `equipo_usuario_ids` / `is_in_current_user_scope`
  - misma `organizacion_id`
- Auditoría:
  - registrar evento (actor, from/to, motivo, timestamp, entidad) en `eventos_auditoria` y/o `asignaciones_vendedores`.
- Efecto:
  - actualizar `oportunidades.asignado_a_usuario_id`
  - actualizar `contactos.propietario_usuario_id`
  - actualizar `conversaciones.asignado_a_usuario_id`
  - NO cambiar `oportunidades.propietario_usuario_id` (conservar creador)

Frontend:
- UI en Embudo/Oportunidades para cambiar vendedor:
  - selector de vendedores permitido (filtrado por scope)
  - historial/auditoría de cambios (solo lectura)

## Fase 3: Inbox consistente con reasignaciones

- Definir si reasignar oportunidad implica reasignar:
  - `conversaciones.asignado_a_usuario_id` (para que inbox “siga” al vendedor), y/o
  - `contactos.propietario_usuario_id`
- Alinear con RLS: `puede_ver_conversacion` y `puede_ver_contacto` ya dependen de scope.

## Fase 4: Deprecar legacy

- Migrar usuarios a roles v2.
- Congelar creación/asignación de legacy desde UI.
- (Opcional) eliminar roles legacy o dejarlos solo para compatibilidad histórica.
