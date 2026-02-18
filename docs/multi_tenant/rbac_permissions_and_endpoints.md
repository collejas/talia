# Permisos nuevos (v2): definición, endpoints y efectos

Fecha: 2026-02-15

Objetivo
Definir semántica exacta de permisos nuevos para que backend y panel los apliquen igual, incluyendo reglas de scope jerárquico y columnas afectadas.

## 1) Reglas comunes (todas las operaciones)

- `organizacion_id` siempre debe coincidir (mismo tenant).
- Nunca cambiar `oportunidades.propietario_usuario_id` al reasignar (preserva creador).
- Registrar auditoría de cada acción (actor, entidad, from/to, motivo opcional, timestamp).

## 2) Permisos de reasignación (pipeline/contactos)

### `pipeline.reassign.team`
Permite reasignar dentro del scope jerárquico del actor (árbol completo).

Validación:
- destino en `equipo_usuario_ids(actor)` o `actor` mismo.
- destino debe ser vendedor: `empleados.es_vendedor = true`.

Efecto:
- actualiza `oportunidades.asignado_a_usuario_id`
- actualiza `contactos.propietario_usuario_id` (contacto principal / contacto de conversación)
- actualiza `conversaciones.asignado_a_usuario_id` (si hay conversación relacionada)
- NO cambia `oportunidades.propietario_usuario_id`

### `pipeline.reassign.any`
Permite reasignar a cualquier vendedor del tenant.

Validación:
- destino debe ser vendedor del tenant (`empleados.es_vendedor = true` y misma org).

Efecto: igual que `pipeline.reassign.team`.

### `contacts.reassign.team`
Permite cambiar el propietario de un contacto dentro del scope jerárquico del actor.

Validación:
- destino en `equipo_usuario_ids(actor)` o actor mismo.
- destino vendedor (`empleados.es_vendedor = true`).

Efecto:
- actualiza `contactos.propietario_usuario_id`
- (opcional recomendado) si el contacto tiene oportunidad abierta principal, alinear `oportunidades.asignado_a_usuario_id` y `conversaciones.asignado_a_usuario_id`.

### `contacts.reassign.any`
Permite cambiar propietario de contacto a cualquier vendedor del tenant.

Efecto: igual que `contacts.reassign.team` pero sin restricción de scope.

## 3) Auditoría

### `audit.view_all`
Permite leer auditoría completa del tenant sin restricción por scope jerárquico.

Aplica a:
- endpoints de auditoría (`/crm/audit_logs` y cualquier reporte equivalente)
- vistas del panel (si se implementan)

## 4) Endpoints/pantallas objetivo (plan)

Backend (implementado):
- `POST /crm/oportunidades/{id}/reasignar`:
  - requiere `pipeline.reassign.team` o `pipeline.reassign.any`
  - ejecuta alineación de oportunidad/contacto/conversación
  - actualiza conversación con service role por RLS

Panel:
- [x] Embudo: acción “Cambiar vendedor” (visible si tiene permiso de reasignación).
- [x] Oportunidades: acción “Cambiar vendedor”.
- [x] Contactos: acción “Cambiar vendedor”.
- [x] Auditoría de reasignaciones en Oportunidades (lectura).
- Auditoría: vista completa si `audit.view_all`.
