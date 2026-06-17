# Backlog de compatibilidad `persona_id`

Fecha: 2026-06-17 (UTC)

Este backlog lista el trabajo pendiente para terminar el barrido de compatibilidad entre `contacto_id` y `persona_id` sin romper contratos legacy que todavía siguen vivos.

## Hecho hasta ahora

- `prospeccion_whatsapp_atribucion_eventos` ya quedó migrado a `persona_id`
- `web_booking_sessions` ya quedó migrado a `persona_id`
- `contacts-data-table` ya prioriza `persona_id` en edición, borrado, refresh y linkeo
- `restart-details` ya genera enlaces con `persona_id`
- `embudo/card-item` ya envía a inbox con `persona_id`
- `embudo` ya empezó a exponer `personaId` en el modelo local y a priorizarlo en los submits principales
- `visitas` ya expone `persona_id` en el raw y lo usa para conteos e identificación interna
- `inbox` ya conserva `personaId` en el modelo local
- `leads` ya prioriza `persona_id` en resúmenes y reinicios

## Pendiente

### P0

- Revisar `frontend/panel/src/lib/embudo/*` para completar la migración de los consumers que todavía leen `contactoId` como llave primaria operativa.
- Revisar `frontend/panel/src/lib/visitas/*` para terminar de separar contratos que ya deberían leer `persona_id` como identidad principal.
- Revisar `frontend/panel/src/lib/contactos/*` para distinguir lectura legacy real de alias de transición.

### P1

- Normalizar los tipos del inbox para que `personaId` sea la llave de lectura principal y `contactoId` quede como alias temporal.
- Revisar `frontend/panel/src/components/inbox/split-view.tsx` y demás merges locales para que no vuelvan a degradar `personaId`.
- Revisar `frontend/panel/src/lib/crm/opportunities.ts` y consumidores para decidir cuándo retirar `contacto_id` de los query params nuevos.

### P2

- Hacer inventario final de rutas API que todavía usan nombres `contactoId` o `contacto_id` solo por compatibilidad.
- Documentar qué contratos ya pueden migrar a `persona_id` de forma directa y cuáles deben quedarse legacy hasta el cierre de DB.

## Criterio para cerrar un punto

Se considera listo para migrar cuando:

- la lectura operativa ya usa `persona_id`
- la escritura nueva ya persiste `persona_id`
- el contrato legacy queda solo como alias de compatibilidad
- no hay consumidores del panel que dependan exclusivamente de `contacto_id`

## Siguiente acción recomendada

- continuar con el barrido de `frontend/panel/src/lib/embudo/*` y `frontend/panel/src/lib/visitas/*`
