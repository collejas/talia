# Progreso del plan (personas, cuentas, relación)

Fecha: 2026-04-12 (UTC)

## Resumen

Se completó la transición operativa del flujo de **alta** y **edición** en el panel hacia el modelo nuevo:

- `personas` (humano)
- `cuentas` (empresa/entidad fiscal-comercial)
- `cuenta_personas` (relación)
- `direcciones` + `cuenta_direcciones` (preparado)

Nota histórica:
- las migraciones y documentos del plan todavía conservan referencias a `contactos` como archivo de transición
- el runtime activo del panel ya opera sobre `personas`, `cuentas` y `cuenta_personas`

Documento de cierre:
- `docs/Plan_personas_empresa_contactos/cierre_refactor_runtime_y_documentacion.md`

## Avance reciente del flujo de contactos

Se implemento el nuevo flujo de contactos en el panel con estas piezas ya operativas:

- acciones de primer nivel:
  - `Nuevo contacto`
  - `Nueva empresa`
  - `Persona física con actividad empresarial`
  - `Vincular contacto a empresa`
- alta guiada con copy de usuario final
- edicion alineada al mismo lenguaje de front
- flujo independiente para vincular contacto y empresa
- experiencia de resumen lateral en desktop

Archivos principales del avance:

- `frontend/panel/src/components/contactos/contact-create-flow.tsx`
- `frontend/panel/src/components/contactos/contact-edit-flow.tsx`
- `frontend/panel/src/components/contactos/contact-link-flow.tsx`
- `frontend/panel/src/components/contactos/contacts-data-table.tsx`
- `frontend/panel/src/app/layout.tsx`

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
  - `POST /crm/personas/alta/validar` en `backend/app/api/routes/crm.py`
  - Crea/une `persona + cuenta + relación` y mantiene sombra legacy cuando aplica.
- Edición estructurada:
  - `PATCH /crm/personas/{contacto_id}` en `backend/app/api/routes/crm.py`
  - `POST /crm/personas/{contacto_id}/validar` en `backend/app/api/routes/crm.py`
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
- El acceso al detalle de contacto ya no cae al legacy `public.contactos`; si la persona no existe en el modelo nuevo, la lectura falla de forma explícita.
- Los lookups internos por email, teléfono y WhatsApp quedaron apuntando a `personas`; ya no usan `public.contactos` como fallback de resolución.
- La escritura legacy de `contactos` quedó retirada del flujo de alta, edición y borrado del panel; el modelo nuevo ya es la fuente operativa.
- Normalización y deduplicación inicial del flujo nuevo:
  - `POST /crm/personas/alta` y `PATCH /crm/personas/{contacto_id}` normalizan entrada (texto, correo en minúsculas y teléfono).
  - `POST /crm/personas/alta` intenta dedupe por teléfono/correo en la misma organización antes de crear:
    - si encuentra contacto existente, reutiliza el registro vía `update_contact`.
    - expone en `resumen` los flags `deduplicado` y `contacto_reutilizado_id`.
  - `POST/PATCH /crm/personas/*` intenta dedupe de cuenta cuando el flujo viene como cuenta nueva:
    - prioridad de match: `RFC` > `razon_social` > `nombre_comercial`.
    - si encuentra coincidencia, reutiliza `cuenta_id` para no duplicar empresa.
  - Dedupe por niveles (fuerte/medio/debil) en alta:
    - persona: fuerte por teléfono/correo; medio/debil por nombre y empresa (se reportan candidatos).
    - cuenta: fuerte por RFC, medio por razón social, débil por nombre comercial/alias.
    - auto-reuso solo con confianza alta:
      - persona: solo `fuerte`.
      - cuenta: solo `fuerte`.
    - candidatos `medio/debil` requieren confirmación explícita en UI (`reutilizar` o `crear nuevo`).
    - `resumen` ahora incluye `candidatos_persona` y `candidatos_cuenta` para soporte de confirmación UI.

### 3) Panel (Frontend)

- Alta (nuevo flujo completo, sin modal legacy):
  - `frontend/panel/src/components/contactos/contact-create-flow.tsx`
  - Endpoint panel (proxy):
    - `frontend/panel/src/app/api/personas/alta/route.ts` -> `POST /crm/personas/alta`
    - `frontend/panel/src/app/api/personas/alta/validar/route.ts` -> `POST /crm/personas/alta/validar`
  - Búsqueda de cuentas para “cuenta existente”:
    - `frontend/panel/src/app/api/personas/cuentas/route.ts`
- Edición (nuevo flujo completo, sin modal legacy):
  - `frontend/panel/src/components/contactos/contact-edit-flow.tsx`
  - Endpoint panel (proxy):
    - `frontend/panel/src/app/api/personas/[contactoId]/route.ts` -> `PATCH /crm/personas/{contacto_id}`
    - `frontend/panel/src/app/api/personas/[contactoId]/validar/route.ts` -> `POST /crm/personas/{contacto_id}/validar`
- Proxies listos para relaciones:
  - `frontend/panel/src/app/api/personas/[contactoId]/relaciones/route.ts`
  - `frontend/panel/src/app/api/personas/[contactoId]/relaciones/[relacionId]/route.ts`
  - `frontend/panel/src/app/api/personas/[contactoId]/relaciones/[relacionId]/estado/route.ts`
- Integración en la vista de Contactos:
  - `frontend/panel/src/components/contactos/contacts-data-table.tsx`
  - `Nuevo contacto` abre el flujo nuevo.
  - `Editar` abre el flujo nuevo.
  - Alta y edición ahora piden confirmación explícita cuando el dedupe detecta candidatos `medio/debil`.
  - `Vincular contacto a empresa` abre el flujo independiente de relacion.
  - La experiencia ya usa panel ancho y resumen lateral en desktop.

### 4) Exportación de contactos

- Se reemplazó el exportador local del listado por un export CSV servido desde backend:
  - `GET /crm/contacts/export`
  - proxy del panel:
    - `frontend/panel/src/app/api/contactos/export/route.ts`
- El export ya sale de `panel_contactos_list` completo por paginación y no depende solo de los datos visibles en pantalla.
- El archivo exportado incluye los campos canónicos del modelo nuevo y conserva el filtro de búsqueda del listado.
- La exportación quedó alineada con el modelo `personas + cuentas + cuenta_personas + conversaciones` que alimenta la vista de contactos.

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

### 4) Retiro del legado

- El runtime activo ya no depende de `contactos` para el ciclo operativo del panel de contactos.
- Quedan como archivo histórico las migraciones y documentos que describen la transición.
- Pendiente solo si aparece otro consumidor real:
  - limpiar campos duplicados en `cuentas`/`contactos`
  - revisar relaciones SQL antiguas fuera del panel de contactos

### 5) Limpieza semantica y cierre documental

- Se limpio el backend activo para que los flujos principales hablen de `persona` en lugar de `contacto` cuando eso no rompe contratos.
- Se retiro el ultimo embed directo de `public.contactos` del runtime activo.
- Se documento el cierre completo en:
  - `docs/Plan_personas_empresa_contactos/cierre_refactor_runtime_y_documentacion.md`

### 6) Iteracion UX del flujo de contactos

- Afinar detalle post-alta.
- Mejorar estados vacios y microcopy de dedupe.
- Revisar mobile para el flujo de vinculacion y alta guiada.
