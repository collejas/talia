# Backlog de compatibilidad `persona_id`

Fecha: 2026-06-17 (UTC)

Este backlog lista el trabajo pendiente para terminar el barrido de compatibilidad entre `contacto_id` y `persona_id` sin romper contratos legacy que todavia siguen vivos.

## Hecho hasta ahora

- `prospeccion_whatsapp_atribucion_eventos` ya quedo migrado a `persona_id`
- `web_booking_sessions` ya quedo migrado a `persona_id`
- `contacts-data-table` ya prioriza `persona_id` en edicion, borrado, refresh y linkeo
- `restart-details` ya genera enlaces con `persona_id`
- `embudo/card-item` ya envia a inbox con `persona_id`
- `embudo` ya empezo a exponer `personaId` en el modelo local y a priorizarlo en los submits principales
- `embudo/card-item` ya prioriza `personaId` para abrir el historial en Inbox
- `visitas` ya expone `persona_id` en el raw y lo usa para conteos e identificacion interna
- `lib/contactos` ya expone `persona_id` en la tabla local como alias de lectura
- `inbox` ya conserva `personaId` en el modelo local
- `inbox/split-view` ya conserva `personaId` como fuente principal al rehidratar y fusionar threads
- `leads` ya prioriza `persona_id` en resúmenes y reinicios
- la tabla tecnica de `visitas` ya muestra `Persona` y `Persona ID` como identidad visible primaria

## Pendiente

### P0

- Revisar `frontend/panel/src/lib/embudo/*` para completar la migracion de los consumers que todavia leen `contactoId` como llave primaria operativa.
- Revisar `frontend/panel/src/lib/visitas/*` para terminar de separar contratos que ya deberian leer `persona_id` como identidad principal.
- Revisar `frontend/panel/src/lib/contactos/*` para distinguir lectura legacy real de alias de transicion y terminar la migracion del contrato local.

### P1

- Normalizar los tipos del inbox para que `personaId` sea la llave de lectura principal y `contactoId` quede como alias temporal.
- Revisar `frontend/panel/src/components/inbox/split-view.tsx` y demas merges locales para que no vuelvan a degradar `personaId`.
- Revisar `frontend/panel/src/lib/crm/opportunities.ts` y consumidores para decidir cuando retirar `contacto_id` de los query params nuevos.

### P2

- Hacer inventario final de rutas API que todavia usan nombres `contactoId` o `contacto_id` solo por compatibilidad.
- Documentar que contratos ya pueden migrar a `persona_id` de forma directa y cuales deben quedarse legacy hasta el cierre de DB.

## Criterio para cerrar un punto

Se considera listo para migrar cuando:

- la lectura operativa ya usa `persona_id`
- la escritura nueva ya persiste `persona_id`
- el contrato legacy queda solo como alias de compatibilidad
- no hay consumidores del panel que dependan exclusivamente de `contacto_id`

## Siguiente accion recomendada

- continuar con el barrido de `frontend/panel/src/lib/embudo/*` y `frontend/panel/src/lib/visitas/*`
- revisar el corte final en `docs/Plan_personas_empresa_contactos/inventario_final_compatibilidad_persona_id.md`
