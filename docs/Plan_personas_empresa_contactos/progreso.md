# Progreso del plan (personas, cuentas, relación)

Fecha: 2026-04-12 (UTC)

## Resumen

Se completó la transición operativa del flujo de **alta** y **edición** en el panel hacia el modelo nuevo:

- `personas` (humano)
- `cuentas` (empresa/entidad fiscal-comercial)
- `cuenta_personas` (relación)
- `direcciones` + `cuenta_direcciones` (preparado)

Manteniendo compatibilidad temporal con el legado `contactos` (shadow write / fallback read donde aplica).

## Completado

### 1) Esquema y migraciones (DB)

- Tablas nuevas (creación):
  - `personas`
  - `direcciones`
  - `cuenta_personas`
  - `cuenta_direcciones`
- Migraciones aplicadas:
  - `supabase/migrations/20280511_000000_crm_personas_cuentas_relacion.sql`
  - `supabase/migrations/20280511_010000_backfill_personas_desde_contactos.sql`
  - `supabase/migrations/20280511_020000_backfill_cuentas_desde_personas.sql`

Notas:
- `propietario_usuario_id` en tablas nuevas respeta integridad por organización (FK compuesta).
- `rol_en_cuenta` se mantiene flexible (texto), evitando `CHECK` rígido.
- Se dejó trazabilidad a legacy en `metadata` para backfill y auditoría.

### 2) Backend (API y repositorio)

- Alta estructurada:
  - `POST /crm/personas/alta` en `backend/app/api/routes/crm.py`
  - Crea/une `persona + cuenta + relación` y mantiene sombra legacy cuando aplica.
- Edición estructurada:
  - `PATCH /crm/personas/{contacto_id}` en `backend/app/api/routes/crm.py`
- Relación explícita:
  - `upsert_contact_account_relation(...)` en `backend/app/repositories/crm.py`
- CRUD nativo de `cuenta_personas`:
  - `GET /crm/personas/{contacto_id}/relaciones`
  - `POST /crm/personas/{contacto_id}/relaciones`
  - `PATCH /crm/personas/{contacto_id}/relaciones/{relacion_id}`
  - `PATCH /crm/personas/{contacto_id}/relaciones/{relacion_id}/estado`
  - `DELETE /crm/personas/{contacto_id}/relaciones/{relacion_id}`
- Lectura enriquecida para UI:
  - `GET /crm/contacts/{id}` ahora expone `rol_en_cuenta`, flags y `cuenta_tipo` (mapeado desde `cuenta_personas` y `cuentas`).
- Normalización y deduplicación inicial del flujo nuevo:
  - `POST /crm/personas/alta` y `PATCH /crm/personas/{contacto_id}` normalizan entrada (texto, correo en minúsculas y teléfono).
  - `POST /crm/personas/alta` intenta dedupe por teléfono/correo en la misma organización antes de crear:
    - si encuentra contacto existente, reutiliza el registro vía `update_contact`.
    - expone en `resumen` los flags `deduplicado` y `contacto_reutilizado_id`.
  - `POST/PATCH /crm/personas/*` intenta dedupe de cuenta cuando el flujo viene como cuenta nueva:
    - prioridad de match: `RFC` > `razon_social` > `nombre_comercial`.
    - si encuentra coincidencia, reutiliza `cuenta_id` para no duplicar empresa.

### 3) Panel (Frontend)

- Alta (nuevo flujo completo, sin modal legacy):
  - `frontend/panel/src/components/contactos/contact-create-flow.tsx`
  - Endpoint panel (proxy):
    - `frontend/panel/src/app/api/personas/alta/route.ts` -> `POST /crm/personas/alta`
  - Búsqueda de cuentas para “cuenta existente”:
    - `frontend/panel/src/app/api/personas/cuentas/route.ts`
- Edición (nuevo flujo completo, sin modal legacy):
  - `frontend/panel/src/components/contactos/contact-edit-flow.tsx`
  - Endpoint panel (proxy):
    - `frontend/panel/src/app/api/personas/[contactoId]/route.ts` -> `PATCH /crm/personas/{contacto_id}`
- Proxies listos para relaciones:
  - `frontend/panel/src/app/api/personas/[contactoId]/relaciones/route.ts`
  - `frontend/panel/src/app/api/personas/[contactoId]/relaciones/[relacionId]/route.ts`
  - `frontend/panel/src/app/api/personas/[contactoId]/relaciones/[relacionId]/estado/route.ts`
- Integración en la vista de Contactos:
  - `frontend/panel/src/components/contactos/contacts-data-table.tsx`
  - `Nuevo contacto` abre el flujo nuevo.
  - `Editar` abre el flujo nuevo.

## Pendiente (siguiente fase sugerida)

### 1) Vista detalle post-alta (Fase 7 del UX)

- Crear vista de detalle “rica” (persona/cuenta/relación) y navegar ahí después de guardar.
- Acciones rápidas: editar persona, editar cuenta, editar relación, agregar otra relación.

### 2) Endpoints nativos de relación (opcional, pero recomendable)

- Endpoints dedicados para CRUD de `cuenta_personas` y `cuenta_direcciones`, para no depender de “side effects” en `update_contact`.

### 3) Deduplicación controlada

- Reglas y herramientas para fusionar duplicados:
  - personas: match fuerte por teléfono/correo, débil por nombre + org
  - cuentas: match fuerte por RFC, medio por razón social, débil por nombre comercial

### 4) Retiro gradual del legado

- Reducir dependencia de `contactos`:
  - lecturas: dejar solo fallback en casos antiguos
  - escrituras: eventualmente apagar shadow write
- Luego limpiar campos duplicados en `cuentas`/`contactos` cuando ya no haya consumidores.
