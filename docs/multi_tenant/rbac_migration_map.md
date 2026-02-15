# Mapa de migración: roles legacy -> roles v2 (tenant)

Fecha: 2026-02-15

Objetivo
Definir cómo se migran los roles actuales (`0001/0002/0003/admin`) hacia los roles v2 del tenant sin romper permisos ni visibilidad por jerarquía.

## 1) Contexto actual (tenant legacy `000...001`)

Roles observados en la BD:
- `admin` (admin reconocido por `public.es_admin(uid)`)
- `0002` Supervisor
- `0003` Agente
- (existe `0001` Admin en catálogo, pero no está asignado a usuarios en este tenant)

Usuarios observados (ejemplo):
- `administracion@geoactiv.mx` (Jorge): `admin` + `0002` + `0003` y además `platform_admins` (super_admin plataforma).
- `collejas1@gmail.com` (Raul): `0003`.

## 2) Principio de migración

- No se eliminan roles legacy al inicio.
- Se agregan roles v2 y se asignan en paralelo.
- Las decisiones de permisos deben priorizar:
  1) `super_admin` (plataforma) para cross-tenant
  2) `owner` (tenant) para administración total del tenant (incluye secretos/routing de su tenant)
  3) permisos por rol (`roles_permisos`)
  4) scope jerárquico (`empleados_supervisores`)

## 3) Mapeo recomendado

| Legacy | Significado actual | Rol v2 recomendado | Notas |
| --- | --- | --- | --- |
| `admin` | Admin del tenant (usado por `es_admin`) | `admin_operativo` o `owner` | Depende del uso: si hoy ese usuario rota secretos/routing, mapear a `owner`. |
| `0002` | Supervisor (scope jerárquico) | `coordinador` o `gerente_comercial` | Con decisión actual: `coordinador` opera árbol completo; `gerente_comercial` también. Diferenciar por permisos de settings y reasignación “any”. |
| `0003` | Agente (vendedor) | `agente` | Mantener: sin filtro vendedor, sin reasignación. |
| `0001` | Admin (catálogo) | (deprecado) | Evitar duplicidad con `admin`. Si se usa, mapear a `owner` y/o retirar. |

## 4) Casos de usuario multi-rol

Ejemplo “Jorge” (admin + supervisor + agente + super_admin plataforma):
- Plataforma: mantiene `platform_admins` (super_admin).
- Tenant:
  - asignar `owner` (por ser “usuario maestro” del tenant y por decisión: owner puede editar secretos/routing)
  - opcional: mantener `admin_operativo` si quieres separar poderes (pero no es necesario si ya es owner)
  - opcional: asignar `coordinador` si quieres que use el árbol y funciones de coordinación explícitas
  - no es necesario conservar `agente` si quieres evitar que el UI lo trate como vendedor; si se conserva, el UI debe priorizar `owner/admin_operativo` sobre `agente`.

Regla de prioridad sugerida (UI y backend):
- Si tiene `owner`, se comporta como owner (sin restricciones de vendedor).
- Else si tiene `admin_operativo`, se comporta como admin operativo.
- Else si tiene `gerente_comercial`/`coordinador`, aplicar árbol.
- Else si tiene `agente`, aplicar self-scope.

## 5) Plan de migración (pasos)

1) Crear roles v2 en `public.roles` por `organizacion_id`.
2) Asignar `owner` al/los usuarios maestros del tenant.
3) Asignar `agente` a los vendedores existentes.
4) Asignar `coordinador`/`gerente_comercial` a los mandos medios según organigrama.
5) Verificar que el panel:
   - muestre filtros/acciones correctas
   - respete scope jerárquico
6) Deprecar/asignar en cero los legacy.

