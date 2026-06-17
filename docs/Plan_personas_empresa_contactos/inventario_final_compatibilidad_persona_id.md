# Inventario final de compatibilidad `persona_id`

Fecha: 2026-06-17 (UTC)

Este documento junta el corte actual de lo que sigue usando `contacto_id` o `contactoId`.
La regla para leerlo es simple:

- si el nombre sigue siendo legacy pero el runtime ya escribe `persona_id`, se considera compatibilidad temporal
- si el contrato sigue leyendo `contacto_id` porque la DB o el proveedor externo aun lo exige, es compatibilidad real
- si solo queda en el nombre de ruta o de prop, es legado cosmético

## 1. Compatibilidad real que sigue viva

### 1.1 Rutas API del panel que aceptan o propagan `contacto_id`

- `frontend/panel/src/app/api/agenda/bookings/route.ts`
  - acepta `persona_id` y `contacto_id`
  - normaliza hacia `persona_id` antes de llamar al CRM
- `frontend/panel/src/app/api/agenda/opportunities/route.ts`
  - acepta `persona_id` y `contacto_id`
  - crea y consulta oportunidades con ambos nombres por compatibilidad
- `frontend/panel/src/app/api/contactos/[contactoId]/route.ts`
  - conserva el nombre de ruta legacy
  - sigue resolviendo borrado y detalle por compatibilidad, pero ya proxy a `/crm/personas/{persona_id}`
- `frontend/panel/src/app/api/contactos/[contactoId]/reassign/route.ts`
  - conserva el nombre de ruta legacy
  - sigue reenviando al backend, pero ya proxy a `/crm/personas/{persona_id}/reasignar`
- `frontend/panel/src/app/api/personas/create/route.ts`
  - contrato visible de alta del panel; proxy a `/crm/personas/alta`
- `frontend/panel/src/app/api/contactos/list/route.ts`, `summary/route.ts`, `export/route.ts` y `catalogos/*`
  - conservan la ruta legacy, pero ya proxy a `/crm/personas/*`
- `frontend/panel/src/app/api/contactos/bulk-delete/route.ts`
  - conserva la ruta legacy, pero el panel ya consume `api/personas/bulk-delete`

### 1.2 Contratos de oportunidades del panel

- `frontend/panel/src/lib/crm/opportunities.ts`
  - sigue aceptando `contactId` y `contactoId`
  - construye query params duales: `persona_id` y `contacto_id`
- `frontend/panel/src/app/oportunidades/page.tsx`
  - sigue leyendo `persona_id` y `contacto_id` desde la URL
  - mantiene `contactoId` como estado local de filtro
- `frontend/panel/src/app/oportunidades/oportunidades-filters.client.tsx`
  - usa `contactoId` como estado de UI
  - escribe `persona_id` al aplicar filtros
- `frontend/panel/src/app/oportunidades/oportunidades-table.client.tsx`
  - sigue leyendo `contactoId` en la UI
  - manda `contacto_id` al flujo de reasignacion por compatibilidad

### 1.3 Backend CRM con nombres legacy aun necesarios

- `backend/app/api/routes/crm.py`
  - conserva rutas publicas como `/crm/personas/{contacto_id}` por compatibilidad
  - conserva `/crm/contacts/{id}` y `/crm/contactos/{contacto_id}` donde el contrato historico sigue vivo
  - sigue exponiendo `contacto_id`, `contacto_principal_id`, `convertido_contacto_id` y `crm_contacto_id` en varios payloads
- `backend/app/repositories/crm.py`
  - sigue mezclando campos nuevos y legacy porque el backend todavia sirve a consumidores viejos
  - hay lectura dual en sesiones, agenda, prospeccion y relaciones internas

## 2. Legado cosmetico que ya no bloquea la migracion

Estos nombres siguen viendose en la UI o en la firma de ruta, pero ya no implican que el runtime dependa del modelo viejo:

- `frontend/panel/src/app/api/contactos/[contactoId]/route.ts`
- `frontend/panel/src/app/api/contactos/[contactoId]/reassign/route.ts`
- `frontend/panel/src/app/api/contactos/list/route.ts`
- `frontend/panel/src/app/api/contactos/summary/route.ts`
- `frontend/panel/src/app/api/contactos/export/route.ts`
- `frontend/panel/src/app/api/contactos/catalogos/*`
- `frontend/panel/src/app/api/contactos/bulk-delete/route.ts`
- `frontend/panel/src/app/api/personas/create/route.ts`
- `frontend/panel/src/app/oportunidades/page.tsx`
- `frontend/panel/src/app/oportunidades/oportunidades-filters.client.tsx`
- `frontend/panel/src/app/oportunidades/oportunidades-table.client.tsx`

El motivo para dejarlos por ahora es evitar romper enlaces, tabs abiertas, bookmarks, fetches del panel y call sites que todavia mandan `contactoId`.

## 3. Pendientes reales para migrar despues del corte actual

Estos son los puntos que siguen valiendo como backlog tecnico y no solo como alias cosmetico:

- revisar si las rutas del panel bajo `api/contactos/*` ya pueden pasar a `personaId` como contrato visible sin romper historial
- seguir reduciendo el uso de `contacto_id` en `backend/app/repositories/crm.py` solo donde no sea una FK o un contrato historico
- cerrar el inventario de tablas y eventos que todavia dependen de `contacto_id` por trazabilidad o integracion externa

## 4. Lectura operativa

Resumen ejecutivo del corte actual:

- codigo nuevo: `persona_id`
- contratos viejos que siguen vivos: `contacto_id`
- contratos viejos que ya solo son nombre de ruta o prop: `contactoId`
- contratos que no conviene tocar todavia: los que siguen actuando como puente de compatibilidad entre panel, CRM y eventos historicos
- el helper de oportunidades ya usa `personaId` de forma directa
- la UI de oportunidades y el inbox ya quedaron alineados a `personaId` como estado interno
- el panel ya consume `api/personas/create` para alta
- el panel ya consume `api/personas/list`, `summary`, `export` y `catalogos`
- el panel ya consume `api/personas/bulk-delete`

## 5. Conclusion

El inventario actual no muestra un solo punto nuevo de rotura estructural.
Lo que queda es una capa de compatibilidad repartida entre panel, backend CRM y rutas historicas.
La migracion puede seguir por fases sin hacer big-bang.
