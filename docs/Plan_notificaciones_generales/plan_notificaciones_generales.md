# Plan de implementacion: notificaciones generales de usuario

Fecha: 2026-03-30

## Objetivo

Implementar un sistema de notificaciones generales para el panel que permita mostrar avisos flotantes al usuario desde cualquier vista de la app, reutilizable para distintos tipos de eventos asincronos (scraper, lookup, lotes, importaciones, errores de jobs, etc.).

La meta es separar dos necesidades distintas:

- refresco de datos por modulo/vista
- notificaciones UX dirigidas al usuario que disparo una accion o al usuario destinatario del evento

## Entendimiento del sistema actual

### 1. Base de datos

Hallazgos principales:

- No existe hoy una tabla general de notificaciones de UI para usuario.
- Existen tablas de jobs/eventos de dominio que pueden servir como origen de notificaciones:
  - `public.prospeccion_buscador_jobs`
  - `public.prospeccion_denue_jobs`
  - `public.prospeccion_contacto_batch`
  - `public.prospeccion_contacto_envio`
  - `public.sales_notification_jobs`
  - `public.eventos_entrega`
  - `public.prospeccion_user_preferences`
- El sistema ya persiste `creado_por`, `organizacion_id`, `metadata`, `status`, `finished_at`, etc. en varios jobs, por lo que hay suficiente informacion para generar notificaciones derivadas.
- `public.prospeccion_user_preferences` ya existe y es un buen candidato para almacenar preferencias de notificaciones por usuario/modulo/canal sin crear otra tabla de settings desde cero.

Lectura arquitectonica:

- La BD ya modela bien los procesos de negocio y sus jobs.
- Lo que falta no es tanto un origen de eventos, sino una capa uniforme de "notificacion de UI" dirigida a usuario.
- Para un MVP no es obligatorio persistir notificaciones en BD; puede usarse infraestructura ephemeral en backend. Para una fase posterior, si se quiere historial/acknowledge/no leidas, si conviene crear tabla dedicada.

### 2. Backend

Hallazgos principales:

- Existe un hub in-memory para realtime UI:
  - `backend/app/services/ui_realtime_hub.py`
- Hoy hay topicos por organizacion y por modulo:
  - `inbox:{organizacion_id}`
  - `prospeccion:prospectos:{organizacion_id}`
- Existen helpers de publicacion:
  - `_publish_inbox_ui_event(...)`
  - `_publish_prospectos_ui_event(...)`
- Existen streams SSE por modulo:
  - `/crm/inbox/stream`
  - `/crm/prospeccion/prospectos/stream`
- El panel ya proxea streams SSE desde Next:
  - `frontend/panel/src/app/api/prospeccion/prospectos/proxy-helpers.ts`
- El caso nuevo del scraper ya emite evento al terminar, pero todavia acoplado al topico de prospectos y a la vista de prospectos.
- El backend ya tiene piezas utiles para resolver scope y usuario actual:
  - `require_user_token`
  - `require_permission(...)`
  - `require_organizacion_id(...)`
  - `/crm/me/permissions`

Lectura arquitectonica:

- La infraestructura SSE ya existe y funciona.
- La limitacion actual es el scope: hoy el broadcast se hace por modulo/organizacion, no por usuario.
- Para notificaciones globales no conviene reutilizar directamente los topicos de modulo. Conviene agregar un topico nuevo por usuario.

### 3. Frontend

Hallazgos principales:

- El panel ya tiene un `RootLayout` claro donde se puede montar un provider global:
  - `frontend/panel/src/app/layout.tsx`
- Ya existe un provider global de sesion:
  - `SessionExpirationProvider`
- Hay uso parcial de `toast` de `sonner` en otras vistas/componentes, pero hoy no existe una capa global consistente para notificaciones del sistema.
- En prospeccion/prospectos ya hay:
  - banner local de pagina
  - stream SSE local con `EventSource`
  - notificacion flotante implementada localmente para el scraper terminado
- En inbox y otros modulos tambien existen streams locales independientes.

Lectura arquitectonica:

- El frontend esta listo para un `GlobalNotificationsProvider` en layout.
- Hoy la app mezcla tres patrones:
  - banners locales
  - toasts puntuales
  - streams SSE por vista
- El siguiente paso correcto es centralizar notificaciones UX en un provider global, sin quitar de entrada los streams de refresco por modulo.

## Decision de arquitectura

### Principio clave

Separar:

- `streams de datos por modulo`: usados para invalidar/recargar vistas
- `streams de notificaciones por usuario`: usados para avisar al usuario en cualquier vista

### Topologia propuesta

Backend:

- Mantener topicos por modulo para refresh:
  - inbox por organizacion
  - prospectos por organizacion
  - otros modulos segun se necesite
- Agregar topico global por usuario:
  - `user:{usuario_id}:notifications`

Frontend:

- Mantener streams locales donde el modulo necesita refresh incremental.
- Agregar un solo `EventSource` global para notificaciones del usuario autenticado.
- Renderizar toasts/notificaciones flotantes desde cualquier vista.

## Contrato propuesto de notificacion

Payload recomendado:

```json
{
  "type": "scraper.finished",
  "level": "success",
  "title": "Scraper terminado",
  "message": "Se encontraron 3 correos.",
  "organizacion_id": "...",
  "user_id": "...",
  "entity": {
    "kind": "buscador_job",
    "id": "..."
  },
  "action": {
    "label": "Ver historial",
    "href": "/prospeccion/buscador"
  },
  "meta": {
    "prospecto_id": "...",
    "emails_total": 3,
    "status": "completed"
  },
  "at": "2026-03-30T15:00:00Z"
}
```

Campos minimos para v1:

- `type`
- `level`
- `message`
- `user_id`
- `organizacion_id`
- `at`

Campos recomendados:

- `title`
- `action`
- `entity`
- `meta`
- `dedupe_key`

## Estrategia de implementacion

### Fase 1. Infraestructura backend para notificaciones globales

Objetivo:
crear canal SSE global por usuario reutilizable.

Cambios:

- Agregar en `ui_realtime_hub.py`:
  - `user_notifications_topic_for_user(usuario_id: str) -> str`
- Agregar helper backend:
  - `publish_user_notification(...)`
- Crear endpoint SSE nuevo, ejemplo:
  - `GET /crm/me/notifications/stream`
- El endpoint debe autenticar usuario, resolver `usuario_id` y suscribirse al topico de ese usuario.
- Mantener payload JSON uniforme y ping/connected igual que en streams actuales.

Notas:

- Este endpoint no debe depender de una vista/modulo concreto.
- Debe funcionar aunque el usuario este en `/dashboard`, `/agenda`, `/inbox`, `/prospeccion/...`, etc.

### Fase 2. Proxy Next para el stream global

Objetivo:
exponer el stream desde el panel sin duplicar logica de auth/headers.

Cambios:

- Crear route handler en panel, ejemplo:
  - `frontend/panel/src/app/api/notifications/stream/route.ts`
- Reusar el patron de `proxyProspeccionStreamingRequest(...)` o extraer un helper mas general para streaming autenticado con `Authorization` y `X-Organizacion-Id`.

Notas:

- Conviene dejar helper reutilizable, no otro proxy manual aislado.

### Fase 3. Provider global de frontend

Objetivo:
mostrar notificaciones en cualquier vista.

Cambios:

- Crear algo como:
  - `frontend/panel/src/components/notifications/global-notifications-provider.tsx`
- Montarlo en:
  - `frontend/panel/src/app/layout.tsx`
- Abrir un unico `EventSource("/api/notifications/stream")`
- Mantener dedupe por `dedupe_key` o `entity.id + type + status`
- Renderizar toasts flotantes o integrar `sonner` correctamente a nivel global

Decisiones UI recomendadas:

- posicion: inferior derecha
- autocierre: 5-8 segundos
- accion opcional: boton/link
- severidades:
  - `success`
  - `info`
  - `warning`
  - `error`

### Fase 4. Migracion del caso actual del scraper

Objetivo:
pasar el caso del scraper al sistema general.

Cambios:

- En lugar de depender de la vista de prospectos, publicar tambien una notificacion global al `creado_por` del job.
- El evento debe incluir:
  - job id
  - status
  - total de correos encontrados
  - link sugerido a historial del buscador
- Mantener temporalmente el evento local de prospectos si todavia sirve para refresh de esa vista.

Resultado esperado:

- si el usuario dispara el scraper y luego navega a otra vista, recibira el toast igualmente.

### Fase 5. Reutilizacion para otros dominios

Casos candidatos inmediatos:

- `lookup` telefonico terminado
- lotes de prospeccion/contacto terminados
- importaciones terminadas
- exportaciones listas para descargar
- errores de jobs asincronos
- `sales_notification_jobs` completados o fallidos cuando aplique

Regla:

- no publicar directamente desde cada vista
- publicar desde el backend al canal global por usuario

### Fase 6. Persistencia opcional (fase posterior)

Esta fase solo si se requiere historial, badge de "no leidas", centro de notificaciones o auditoria UX.

Propuesta:

- crear tabla nueva, por ejemplo `public.ui_user_notifications`
- columnas sugeridas:
  - `id`
  - `created_at`
  - `organizacion_id`
  - `usuario_id`
  - `type`
  - `level`
  - `title`
  - `message`
  - `entity_kind`
  - `entity_id`
  - `action_label`
  - `action_href`
  - `dedupe_key`
  - `metadata jsonb`
  - `read_at`
  - `dismissed_at`
- exponer endpoints para listar/marcar leidas/descartar
- RLS por `usuario_id` y `organizacion_id`

Importante:

- No es necesario para el MVP.
- El MVP puede funcionar 100% en memoria mientras el backend este arriba.

## Diseño de permisos y scope

Requisitos:

- Solo el usuario destinatario debe recibir su notificacion global.
- Los streams de modulo pueden seguir siendo por organizacion para refresco de datos.
- Los eventos globales no deben filtrarse a otros usuarios del mismo tenant salvo que el caso de uso lo pida explicitamente.

Casos especiales:

- si el evento va dirigido a varios usuarios, publicar una vez por cada `usuario_id`
- si es evento administrativo/tenant-wide, definirlo explicitamente y no mezclarlo con notificacion personal

## Riesgos

### 1. Hub in-memory

El `ui_realtime_hub` actual es in-memory.

Impacto:

- si hay mas de un worker/proceso backend, un usuario podria no recibir eventos publicados por otro proceso
- si el backend reinicia, se pierden eventos en vuelo

Mitigacion:

- Para MVP y un solo proceso puede ser aceptable.
- Si el despliegue ya usa multiples workers o escalado horizontal, migrar despues a broker comun (Redis pub/sub o similar).

### 2. Duplicados

Si se publica por modulo y por usuario, el frontend podria mostrar doble toast.

Mitigacion:

- dedupe_key
- provider global responsable de deduplicar
- definir si un evento es solo refresh, solo notificacion o ambos

### 3. Fatiga de notificaciones

Muchos jobs en lote podrian disparar demasiados toasts.

Mitigacion:

- agrupar por lote
- throttle/coalesce en frontend o backend
- preferir resumen de lote cuando el usuario dispara 20 jobs juntos

## Recomendacion final de implementacion

### MVP recomendado

Implementar primero:

1. stream global por usuario
2. provider global en layout
3. toast global reutilizable
4. migrar `scraper.finished` al canal global
5. agregar `lookup.finished` como segundo caso de prueba

### Que no hacer en el MVP

- no crear aun centro completo de notificaciones
- no persistir si todavia no se necesita historial
- no mezclar refresh de vistas con notificacion UX en el mismo contrato logico

## Validacion propuesta

### Backend

- usuario autenticado se conecta a `/crm/me/notifications/stream`
- recibe `connected`
- al terminar un scraper del que es autor, recibe `scraper.finished`
- otro usuario del mismo tenant no recibe ese evento

### Frontend

- con el usuario en cualquier vista del panel, aparece el toast
- al hacer click en accion, navega a la vista sugerida
- no se duplica el mismo toast
- al cambiar de ruta, el stream global sigue vivo

### Integracion

- disparar scraper desde prospectos
- navegar a dashboard o agenda
- esperar finalizacion
- validar toast abajo a la derecha

## Archivos probables a tocar

Backend:

- `backend/app/services/ui_realtime_hub.py`
- `backend/app/api/routes/crm.py`
- `backend/app/services/buscador_jobs.py`
- posiblemente otros servicios de jobs asincronos

Frontend:

- `frontend/panel/src/app/layout.tsx`
- `frontend/panel/src/components/notifications/global-notifications-provider.tsx`
- `frontend/panel/src/app/api/notifications/stream/route.ts`
- helpers de proxy streaming reutilizable si se extraen

Base de datos:

- Ningun cambio obligatorio para MVP
- opcional en fase posterior: nueva migracion para `ui_user_notifications`

## Conclusión

El sistema actual ya tiene la mitad de la infraestructura resuelta:

- autenticacion
- organizacion/scope
- SSE por modulo
- hub realtime
- jobs persistidos con metadatos

Lo que falta es generalizarlo con una capa de notificaciones por usuario. La implementacion recomendada es incremental y de bajo riesgo: agregar un stream global por usuario, montar un provider en el layout y migrar primero el caso del scraper. Desde ahi el sistema queda listo para reutilizarse en otros eventos asincronos del producto.
