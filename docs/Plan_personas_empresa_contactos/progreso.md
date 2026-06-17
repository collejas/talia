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
- el backend de contactos ya no lee ni escribe `legacy_*`; usa `personas.id` y `cuenta_personas.persona_id` de forma directa

### Avance reciente: barrido de compatibilidad `persona_id`

Se empezó a retirar `contacto_id` como identidad operativa en pantallas y helpers del panel.

Ya quedó ajustado o documentado:

- `prospeccion_whatsapp_atribucion_eventos` ya quedó migrado en runtime y base de datos para usar `persona_id`
- `web_booking_sessions` ya quedó migrado para persistir `persona_id`
- los enlaces desde reinicios y oportunidades ya priorizan `persona_id`
- el listado de contactos ya expone `persona_id` junto a `contacto_id` como alias temporal
- `embudo` ya empezó a exponer `personaId` en el modelo local y a priorizarlo en los submits principales
- `embudo/card-item` ya prioriza `personaId` para abrir el historial en Inbox
- `visitas` ya expone `persona_id` en el raw y lo usa para conteos e identificación interna
- `lib/contactos` ya expone `persona_id` en la tabla local como alias de lectura
- `inbox` ya mapea y conserva `personaId` en el modelo local
- `inbox/split-view` ya conserva `personaId` como fuente principal al rehidratar y fusionar threads
- `leads` ya prioriza `persona_id` en resúmenes y etiquetas de reinicios
- la tabla técnica de `visitas` ya muestra `Persona` y `Persona ID` como identidad visible primaria

Backlog vivo:
- `docs/Plan_personas_empresa_contactos/backlog_compatibilidad_persona_id.md`

### Cierre reciente del contrato público

- la ruta pública dedicada del panel ya quedó en `/personas/[personaId]`
- la ficha dedicada de persona ya recibe `personaId` de punta a punta
- `ContactEditFlow` y `ContactCreateFlow` quedaron alineados a `personaId` en sus props/callbacks
- `contacts-data-table` ya abre la ficha rica usando `personaId`
- el bloque operativo del repositorio CRM ya expone nombres canónicos `persona_*` para lectura,
  alta, edición, relaciones y borrado, con wrappers legacy `contact_*` solo como compatibilidad
- los `contacto_id` restantes en backend se agrupan en:
  - wrappers de compatibilidad (`get_contact_*`, `update_contact_*`, `create_contact_*`, `delete_contact_*`)
  - payloads/columnas historicas (`contacto_id`, `contacto_principal_id`, `convertido_contacto_id`, `crm_contacto_id`)
  - contratos que siguen alimentando webchat/whatsapp/messenger/prospeccion y sesiones legacy

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

## Avance reciente del backend semantico

Se siguio limpiando la capa interna del backend para que el runtime hable mas de `persona`
sin romper contratos publicos ni el lenguaje de usuario del panel.

### Lo que ya quedo alineado

- aliases nuevos en `backend/app/services/storage.py`:
  - `fetch_opportunity_persona(...)`
  - `get_webchat_persona_id(...)`
  - `fetch_webchat_session_id_by_persona(...)`
  - `maybe_promote_prequalified_from_persona(...)`
  - `capture_persona_lead_if_ready(...)`
- call sites actualizados en:
  - `backend/app/channels/webchat/service.py`
  - `backend/app/services/webchat_followups.py`
  - `backend/app/channels/whatsapp/tools.py`
  - `backend/app/assistants/tools/lead.py`
- el núcleo de webchat ya uso helpers `persona_*` para seguimiento y cierre:
  - `refresh_persona_followup_state(...)`
  - `ensure_persona_ready_for_assignment(...)`
  - `mark_persona_information_delivered(...)`
  - `WebchatContext.persona_id`
- el núcleo de WhatsApp ya expone `ToolRuntimeContext.persona_id` y helpers de
  seguimiento con semántica `persona_*` en `whatsapp_followups`
- el bloque operativo central de WhatsApp en `backend/app/channels/whatsapp/tools.py`
  ya usa un helper local `persona_id` para alta, información por correo, cierre,
  agenda, reprogramación, cancelación y notificaciones de ventas, manteniendo
  alias de compatibilidad donde siguen existiendo contratos viejos
- el runtime de WhatsApp y Webchat sigue funcionando con `persona` por dentro, aunque
  varios contratos y campos sigan llamandose `contact_id` o `contacto_id` por compatibilidad
- se agrego el puente legacy automatico para escrituras que todavia exigen FK contra
  `contactos`:
  - `asignaciones_vendedores`
  - `prospeccion_whatsapp_atribucion_eventos`
  - `web_sessions`
  - `web_booking_sessions`
  - `openai_request_usage`
- el puente crea una sombra legacy en `public.contactos` solo cuando una escritura aun
  depende de ese FK; no cambia el modelo operativo nuevo

### Validacion reciente

- `python3 -m py_compile` paso en los modulos tocados
- la bateria focalizada de tests paso con `34 passed`
- `talia-api` quedo activo tras el reinicio del servicio
- `GET /health` responde `{"status":"ok"}`

### Lo que se mantuvo intencionalmente

- no se cambio el texto visible al usuario en la vista de contactos
- no se tocaron columnas estructurales como `contacto_id`
- no se forzaron RPCs legacy que todavia sirven como puente

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
- Se dejó trazabilidad técnica para backfill y auditoría en campos de compatibilidad.

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
    - `frontend/panel/src/app/api/personas/[personaId]/route.ts` -> `PATCH /crm/personas/{contacto_id}`
    - `frontend/panel/src/app/api/personas/[personaId]/validar/route.ts` -> `POST /crm/personas/{contacto_id}/validar`
- Proxies listos para relaciones:
  - `frontend/panel/src/app/api/personas/[personaId]/relaciones/route.ts`
  - `frontend/panel/src/app/api/personas/[personaId]/relaciones/[relacionId]/route.ts`
  - `frontend/panel/src/app/api/personas/[personaId]/relaciones/[relacionId]/estado/route.ts`
- Integración en la vista de Contactos:
  - `frontend/panel/src/components/contactos/contacts-data-table.tsx`
  - `Nuevo contacto` abre el flujo nuevo.
  - `Editar` abre el flujo nuevo.
  - Alta y edición ahora piden confirmación explícita cuando el dedupe detecta candidatos `medio/debil`.
  - `Vincular contacto a empresa` abre el flujo independiente de relacion.
  - La experiencia ya usa panel ancho y resumen lateral en desktop.
  - El drawer del listado quedó como vista secundaria; la ruta principal de trabajo ahora es la ficha dedicada en `/personas/[personaId]`.
  - al terminar un alta, el panel abre automáticamente la ficha rica del contacto creado
    o reutilizado, en vez de volver al listado sin contexto

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

- Ya existe una pantalla dedicada separada del listado en `frontend/panel/src/app/personas/[personaId]/page.tsx`.
- Esa vista muestra resumen, notas, relaciones y acciones rápidas para editar, vincular y fusionar.
- La navegación post-alta sigue abriendo la ficha rica embebida del flujo, pero ahora también hay una URL estable para trabajar el contacto fuera del listado.

### 2) Endpoints nativos de relación (opcional, pero recomendable)

- Ya quedó expuesto CRUD nativo para `cuenta_personas` desde `POST /crm/cuentas/{cuenta_id}/relaciones` y sus variantes `GET/PATCH/DELETE`.
- La ficha dedicada de cuenta ya puede listar, vincular y quitar personas sin pasar por `contacto_id`.
- Ya quedó expuesto CRUD nativo para `cuenta_direcciones` desde `POST /crm/cuentas/{cuenta_id}/direcciones` y sus variantes `GET/PATCH/DELETE`.

### 3) Deduplicación controlada

- Ya existe un merge formal de personas en `POST /crm/personas/{contacto_id}/merge`:
  - mueve oportunidades al registro destino,
  - reasigna relaciones de empresa,
  - conserva el origen como archivado con trazabilidad de merge.
- La base de datos ya tiene soporte nativo para este cierre:
  - `personas.archived_at`
  - `personas.merged_into_persona_id`
  - `personas.merge_metadata`
  - `cuentas.archived_at`
  - `cuentas.merged_into_cuenta_id`
  - `cuentas.merge_metadata`
  - `personas.estado` ahora acepta `fusionado`
- El backend ya escribe esa trazabilidad nativa al fusionar personas.
- Ya existe merge formal de cuentas en `POST /crm/cuentas/{cuenta_id}/merge`:
  - mueve oportunidades al registro destino,
  - reasigna relaciones `cuenta_personas`,
  - reasigna relaciones `cuenta_direcciones`,
  - conserva la cuenta origen como archivada con trazabilidad de merge.
- El panel ya expone el proxy de merge para cuentas en `frontend/panel/src/app/api/cuentas/[cuentaId]/merge/route.ts`.
- La UI de cuentas ya tiene ficha dedicada en `frontend/panel/src/app/cuentas/[cuentaId]/page.tsx` y un drawer del listado que enlaza a esa ficha.
- La ficha dedicada ya lista relaciones de `cuenta_personas` y permite vincular/quitar personas sin pasar por `contacto_id`.
- Ya existen contratos explícitos de dedupe para consulta de candidatos:
  - `GET /crm/personas/{contacto_id}/dedupe`
  - `GET /crm/cuentas/{cuenta_id}/dedupe`
- Las fichas dedicadas ya muestran esos candidatos para que la decisión de reutilizar o fusionar quede visible antes de actuar.
- Pendiente de más profundidad, si se quiere ampliar:
  - personas: match fuerte por teléfono/correo, débil por nombre + org
  - cuentas: match fuerte por RFC, medio por razón social, débil por nombre comercial

### 4) Retiro del legado

- El runtime activo ya no depende de `contactos` para el ciclo operativo del panel de contactos.
- Quedan como archivo histórico las migraciones y documentos que describen la transición.
- Quedan como compatibilidad temporal algunas escrituras que todavía necesitan sombra legacy:
  - `openai_request_usage`
  - `web_booking_sessions`
  - `asignaciones_vendedores`
  - `prospeccion_whatsapp_atribucion_eventos`
  - `web_sessions`
- `web_sessions` sigue sirviendo como fuente de analítica/landing, pero su writer first-party
  quedó cubierto por el mismo puente para no romper la FK legacy.
- Pendiente solo si aparece otro consumidor real:
  - limpiar campos duplicados en `cuentas`/`contactos`
  - completar el CRUD nativo de `cuenta_direcciones`
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

## Relacion con inventario y ventas

El avance de `personas` ya impacta el flujo de ventas inmobiliarias porque:

- las oportunidades deben quedar ligadas a `persona_id`
- los cierres de inventario deben exigir una oportunidad válida
- el flujo de propiedades debe dejar de depender de `contacto_id` como referencia principal

Plan de coordinación:

- `docs/Plan_3D/plan_normalizacion_inventario_ventas_personas.md`
- `docs/Plan_3D/plan_3D.md`
- `docs/Plan_3D/plan_migracion_tecnica_inventario_ventas_personas.md`
- `docs/Plan_3D/checklist_prs_inventario_ventas_personas.md`

Inventario de compatibilidad:

- `docs/Plan_personas_empresa_contactos/backlog_compatibilidad_persona_id.md`
- `docs/Plan_personas_empresa_contactos/inventario_final_compatibilidad_persona_id.md`

Avance reciente:

- la UI de `frontend/panel/src/app/oportunidades/*` ya habla de `personaId` como estado interno
- el helper de `frontend/panel/src/lib/crm/opportunities.ts` ya no emite `contacto_id` en el query hacia backend
- el wrapper de reasignación del panel ya usa `/api/personas/[personaId]/reassign`
- `frontend/panel/src/app/api/contactos/[contactoId]/*` quedó como alias de compatibilidad que ya proxy a `/crm/personas/*`
- el contrato visible de alta del panel ya usa `/api/personas/create`
- el panel ya consume `api/personas/list`, `api/personas/summary`, `api/personas/export` y `api/personas/catalogos/*`
- el panel ya consume `api/personas/bulk-delete`
