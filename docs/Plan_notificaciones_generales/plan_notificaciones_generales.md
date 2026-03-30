# Plan de implementacion: notificaciones generales de usuario

Fecha: 2026-03-30

## Objetivo

Implementar un sistema serio, persistente y reusable de notificaciones para el panel.

El sistema debe cubrir dos necesidades al mismo tiempo:

- avisos realtime al usuario desde cualquier vista de la app
- centro de notificaciones persistente con historial, no leidas, acciones y deduplicacion

La meta ya no es un MVP efimero. La meta es una arquitectura profesional que sirva para:

- `scraper.finished`
- `lookup.finished`
- lotes de contacto
- importaciones y exportaciones
- errores de jobs asincronos
- eventos operativos relevantes del producto

## Cambio de decision

Decision actualizada:

- Ya no conviene tratar la persistencia como fase opcional.
- La persistencia en base de datos pasa a ser parte del nucleo del sistema.
- El SSE global se mantiene, pero como complemento del inbox persistente, no como unica fuente.

Principio rector:

- `BD = fuente de verdad`
- `SSE = entrega inmediata`
- `frontend global = experiencia UX`

## Entendimiento del sistema actual

### 1. Base de datos

Hallazgos principales:

- No existe hoy una tabla general de notificaciones de UI por usuario.
- Existen multiples tablas de jobs/eventos de dominio que pueden originar notificaciones:
  - `public.prospeccion_buscador_jobs`
  - `public.prospeccion_denue_jobs`
  - `public.prospeccion_contacto_batch`
  - `public.prospeccion_contacto_envio`
  - `public.sales_notification_jobs`
  - `public.eventos_entrega`
  - `public.prospeccion_user_preferences`
- Los jobs actuales ya guardan datos utiles para notificar:
  - `creado_por`
  - `organizacion_id`
  - `status`
  - `finished_at`
  - `metadata`
- `public.prospeccion_user_preferences` puede reutilizarse despues para preferencias de notificaciones.

Lectura arquitectonica:

- Los eventos de dominio ya existen.
- Lo que falta es una capa transversal de notificaciones persistentes por usuario.
- La BD debe guardar las notificaciones, no solo los jobs que las originan.

### 2. Backend

Hallazgos principales:

- Existe un hub in-memory para realtime UI:
  - `backend/app/services/ui_realtime_hub.py`
- Existen streams SSE por modulo:
  - `/crm/inbox/stream`
  - `/crm/prospeccion/prospectos/stream`
- Ya existe un stream global nuevo por usuario:
  - `/crm/me/notifications/stream`
- Ya existe publicacion de `scraper.finished` al topico global por usuario.

Lectura arquitectonica:

- La parte realtime ya esta encaminada.
- Lo que falta es volverla confiable y persistente.
- El hub in-memory sirve para entrega inmediata, pero no para historial ni rehidratacion.

### 3. Frontend

Hallazgos principales:

- El panel ya tiene montaje global en `frontend/panel/src/app/layout.tsx`
- Ya existe `GlobalNotificationsProvider`
- Ya existe un `Toaster` global
- Ya se elimino la dependencia de notificacion local flotante solo en prospectos

Lectura arquitectonica:

- La app ya tiene punto de integracion global.
- Falta agregar inbox persistente, badge, consulta inicial y logica de agrupacion.

## Arquitectura objetivo

Separar claramente tres capas:

### 1. Capa de origen

Los modulos y jobs del backend detectan eventos relevantes:

- job terminado
- job fallido
- lote completado
- archivo listo
- error operativo

### 2. Capa de notificacion persistente

Un servicio comun crea una notificacion en BD con contrato uniforme.

Ese servicio debe:

- insertar registro en `ui_notificaciones`
- deduplicar cuando aplique
- decidir nivel, titulo, mensaje y accion
- publicar SSE al usuario destinatario

### 3. Capa de entrega UX

El frontend debe:

- cargar notificaciones pendientes al iniciar
- escuchar SSE para nuevas notificaciones
- mostrar toasts globales importantes
- mantener un centro de notificaciones con historial y no leidas

## Modelo de datos recomendado

### Tabla nueva: `public.ui_notificaciones`

Columnas recomendadas:

- `id uuid primary key default gen_random_uuid()`
- `creada_at timestamptz not null default now()`
- `organizacion_id uuid not null`
- `usuario_id uuid not null`
- `tipo text not null`
- `categoria text null`
- `nivel text not null`
- `titulo text null`
- `mensaje text not null`
- `entity_kind text null`
- `entity_id text null`
- `action_label text null`
- `action_href text null`
- `payload jsonb not null default '{}'::jsonb`
- `dedupe_key text null`
- `agrupacion_key text null`
- `leida_at timestamptz null`
- `oculta_at timestamptz null`
- `expira_at timestamptz null`
- `toast_mostrado_at timestamptz null`

Indices recomendados:

- `idx_ui_notificaciones_usuario_creada_at` sobre `(usuario_id, creada_at desc)`
- `idx_ui_notificaciones_usuario_no_leidas` parcial sobre `(usuario_id, creada_at desc)` donde `leida_at is null and oculta_at is null`
- `idx_ui_notificaciones_dedupe_key` sobre `(usuario_id, dedupe_key)` donde `dedupe_key is not null`
- `idx_ui_notificaciones_entity` sobre `(entity_kind, entity_id)`
- `idx_ui_notificaciones_expira_at` sobre `(expira_at)`

Restricciones recomendadas:

- `nivel` limitado a: `success`, `info`, `warning`, `error`
- `mensaje` obligatorio
- `tipo` obligatorio

### Preferencias opcionales posteriores

Reutilizar `public.prospeccion_user_preferences` o crear despues una tabla especifica si se requiere:

- silenciar tipos concretos
- desactivar toasts pero mantener inbox
- frecuencia de resumen
- canales futuros como email o push

## Contrato canonico de notificacion

Payload backend/frontend recomendado:

```json
{
  "id": "uuid",
  "type": "scraper.finished",
  "level": "success",
  "title": "Scraper terminado",
  "message": "Se encontraron 3 correos.",
  "organizacion_id": "uuid",
  "user_id": "uuid",
  "entity": {
    "kind": "buscador_job",
    "id": "uuid"
  },
  "action": {
    "label": "Ver historial",
    "href": "/prospeccion/buscador"
  },
  "meta": {
    "prospecto_id": "uuid",
    "emails_total": 3,
    "status": "completed"
  },
  "dedupe_key": "scraper.finished:job_uuid:completed",
  "group_key": "scraper.finished:lote_uuid",
  "read_at": null,
  "created_at": "2026-03-30T15:00:00Z"
}
```

Campos obligatorios del sistema:

- `id`
- `type`
- `level`
- `message`
- `organizacion_id`
- `user_id`
- `created_at`

Campos fuertemente recomendados:

- `title`
- `action`
- `entity`
- `meta`
- `dedupe_key`
- `group_key`

## Endpoints backend requeridos

### SSE global

- `GET /crm/me/notifications/stream`

Uso:

- entrega realtime inmediata al usuario autenticado
- publica eventos nuevos creados en BD

### Inbox persistente

- `GET /crm/me/notifications`
  - lista paginada
  - filtros por `read`, `type`, `level`, `limit`, `offset`
- `GET /crm/me/notifications/unread-count`
  - devuelve contador de no leidas
- `POST /crm/me/notifications/{id}/read`
  - marca una como leida
- `POST /crm/me/notifications/read-all`
  - marca todas como leidas
- `POST /crm/me/notifications/{id}/hide`
  - oculta una del inbox si aplica

Opcional despues:

- `POST /crm/me/notifications/mark-toast-shown`
- `GET /crm/me/notifications/preferences`
- `PUT /crm/me/notifications/preferences`

## Servicio backend requerido

Crear un servicio reusable, por ejemplo:

- `backend/app/services/user_notifications.py`

Responsabilidades:

- construir payload uniforme
- insertar notificacion en repositorio
- deduplicar por `dedupe_key` si corresponde
- publicar SSE al usuario
- centralizar reglas de agrupacion si despues se mueven al backend

Helpers propuestos:

- `create_user_notification(...)`
- `publish_user_notification(...)`
- `create_and_publish_user_notification(...)`
- `build_notification_from_scraper_job(...)`
- `build_notification_from_lookup_job(...)`

Principio:

- los modulos de negocio no deben saber de UI en detalle
- solo deben invocar un helper comun de notificaciones

## Cambios requeridos en repositorio/backend

### Repositorio

Agregar metodos en `CRMRepository` para:

- insertar notificaciones
- listar notificaciones por usuario
- contar no leidas
- marcar leida
- marcar todas leidas
- ocultar notificacion
- buscar por `dedupe_key`

### Router CRM

Agregar endpoints de notificaciones bajo `/crm/me/notifications...`

### Jobs y dominios a migrar

Orden recomendado:

1. `scraper.finished`
2. `lookup.finished`
3. `prospeccion_contacto_batch.finished`
4. `import.finished`
5. `export.ready`
6. `job.failed`

## Cambios requeridos en frontend

### Provider global

Mantener `GlobalNotificationsProvider`, pero ampliarlo para:

- consultar notificaciones pendientes al iniciar sesion/cargar layout
- escuchar SSE global
- deduplicar eventos ya cargados
- disparar toast solo cuando corresponda
- refrescar contador de no leidas

### Centro de notificaciones

Crear componentes globales, por ejemplo:

- `NotificationBell`
- `NotificationsPanel`
- `NotificationList`
- `NotificationItem`

Capacidades minimas:

- badge de no leidas
- listado paginado/scrollable
- marcar individual como leida
- marcar todas como leidas
- abrir accion asociada
- resaltar errores y advertencias

### Reglas UX recomendadas

#### Toasts

- mostrar solo eventos importantes o recientes
- `success`: 8-12 segundos
- `warning`: 10-12 segundos
- `error`: persistente hasta cerrar o leer
- no mostrar una cascada de 20 toasts individuales

#### Agrupacion

Implementar agrupacion visual/logica para eventos repetidos:

- agrupar `scraper.finished` por ventana corta de tiempo
- mostrar resumen tipo:
  - `Termino el lote de scraper: 5 completados, 2 con correos, 1 sin resultados, 2 con error.`

#### Inbox

- el inbox debe mostrar cada registro persistente real
- el toast puede ser individual o resumido
- el inbox no debe depender del toast

## Estrategia de implementacion

### Fase 1. Esquema y persistencia en BD

Objetivo:
crear la base de datos del sistema profesional.

Cambios:

- crear migracion para `public.ui_notificaciones`
- agregar indices y restricciones
- definir RLS adecuada o acceso exclusivo via backend service role

Resultado:

- el sistema ya no depende solo de memoria

### Fase 2. Repositorio y servicio backend comun

Objetivo:
centralizar creacion, lectura y actualizacion de notificaciones.

Cambios:

- metodos nuevos en `CRMRepository`
- servicio `user_notifications.py`
- helpers para crear + publicar notificaciones

Resultado:

- cualquier modulo puede integrarse sin duplicar logica

### Fase 3. Endpoints del inbox

Objetivo:
exponer centro de notificaciones persistente.

Cambios:

- listar notificaciones
- contar no leidas
- marcar leida
- marcar todas
- ocultar

Resultado:

- base funcional para campanita + panel

### Fase 4. Integracion realtime con SSE

Objetivo:
mantener entrega inmediata.

Cambios:

- mantener `GET /crm/me/notifications/stream`
- publicar SSE cada vez que se cree notificacion persistente
- asegurar que el frontend no dependa del SSE para enterarse de eventos pasados

Resultado:

- realtime + persistencia

### Fase 5. UI global profesional

Objetivo:
crear experiencia global consistente.

Cambios:

- campanita global con badge
- panel dropdown/sheet con historial reciente
- carga inicial de pendientes
- toasts globales con dedupe
- navegacion por acciones

Resultado:

- centro de notificaciones reutilizable y visible desde toda la app

### Fase 6. Agrupacion y mejora UX

Objetivo:
reducir ruido y mejorar lectura.

Cambios:

- agrupar eventos repetitivos por tipo y ventana de tiempo
- resumir lotes de scraper y lookup
- duraciones diferenciadas
- errores persistentes
- marcar `toast_mostrado_at` cuando aplique

Resultado:

- experiencia visual limpia y logica mas fuerte

### Fase 7. Expansion a otros dominios

Objetivo:
reutilizar infraestructura.

Migraciones recomendadas:

1. `scraper.finished`
2. `lookup.finished`
3. `contact.batch.finished`
4. `import.finished`
5. `export.ready`
6. `integration.error`

## Diseño de permisos y scope

Requisitos:

- cada notificacion pertenece a un `usuario_id`
- debe incluir `organizacion_id`
- el usuario solo ve sus notificaciones
- no se mezclan con eventos tenant-wide salvo caso explicito

Casos especiales:

- si un evento va a varios usuarios, se crea un registro por usuario
- si es un evento organizacional, debe modelarse explicitamente como broadcast tenant-wide y no como notificacion personal improvisada

## Riesgos y mitigaciones

### 1. Hub in-memory actual

Riesgo:

- no sirve como fuente de verdad
- no garantiza entrega entre procesos si algun dia hay multiples workers

Mitigacion:

- dejar el hub solo para realtime
- usar BD como fuente canonica
- si despues hay multiples procesos y se requiere realtime interproceso, agregar Redis pub/sub o equivalente

### 2. Duplicados

Riesgo:

- un mismo evento puede crear varias notificaciones si no hay control

Mitigacion:

- `dedupe_key`
- validacion previa en servicio backend
- dedupe adicional en frontend

### 3. Fatiga de notificaciones

Riesgo:

- lotes grandes disparan demasiado ruido

Mitigacion:

- agrupacion por ventana de tiempo
- resumenes de lote
- diferenciar inbox de toast

### 4. Notificaciones perdidas al no estar conectado

Riesgo:

- el usuario no ve el evento en vivo

Mitigacion:

- consulta inicial al inbox persistente
- badge de no leidas
- rehidratacion desde BD

## Validacion propuesta

### Backend

- crear notificacion persistente desde scraper terminado
- verificar registro en `ui_notificaciones`
- verificar que otro usuario del mismo tenant no la vea
- verificar contador de no leidas
- verificar `mark as read`

### Frontend

- abrir cualquier vista del panel
- lanzar scraper
- esperar finalizacion
- validar toast global
- recargar la app y validar que sigue en el centro de notificaciones si no se marco como leida
- validar badge de no leidas

### Integracion

- disparar varios scrapers a la vez
- validar que el inbox tenga todas las notificaciones persistidas
- validar que el toast se agrupe visualmente
- validar accion `Ver historial`

## Archivos probables a tocar

### Base de datos

- nueva migracion en `supabase/migrations/..._ui_notificaciones.sql`

### Backend

- `backend/app/repositories/crm.py`
- `backend/app/services/user_notifications.py`
- `backend/app/services/ui_realtime_hub.py`
- `backend/app/api/routes/crm.py`
- `backend/app/services/buscador_jobs.py`
- despues otros servicios de jobs

### Frontend

- `frontend/panel/src/app/layout.tsx`
- `frontend/panel/src/components/notifications/global-notifications-provider.tsx`
- `frontend/panel/src/app/api/notifications/stream/route.ts`
- nuevos componentes de campanita/panel/listado
- cliente API de notificaciones

## Recomendacion final

Implementar ya el sistema persistente como base oficial.

Orden recomendado de trabajo:

1. migracion `ui_notificaciones`
2. repositorio y servicio comun de notificaciones
3. endpoints `/crm/me/notifications*`
4. integrar `scraper.finished` con persistencia + SSE
5. campanita global + panel + badge
6. agrupacion visual/logica de toasts
7. migrar mas dominios

## Conclusión

El sistema ya tiene una parte realtime inicial, pero para que sea serio y profesional necesita persistencia.

La arquitectura correcta para TalIA es:

- notificacion persistida en BD por usuario
- entrega realtime por SSE
- centro global de notificaciones en frontend
- contrato reusable para cualquier evento asincrono

Con esa base, el sistema deja de depender de que el usuario este conectado justo en el instante del evento y se convierte en infraestructura real del producto.
