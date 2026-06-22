# Mapa tecnico de implementacion

Fecha: 2026-06-22

Documento de referencia para pasar de la propuesta funcional a la ejecucion.
No contiene codigo; solo delimita archivos, capas y cambios esperados.

## 1. Objetivo tecnico

Implementar el flujo:

`nota -> actividad -> notificacion`

sin depender de `metadata` para el camino principal y permitiendo que un supervisor cree acciones visibles para el vendedor.

## 2. Principios de implementacion

- usar columnas normales para todo dato consultable
- mantener `notas` como texto narrativo
- usar `actividades` como entidad operativa principal
- usar `ui_notificaciones` como inbox persistente
- evitar tablas duplicadas para el mismo concepto
- conservar autoria real y destinatario explicito cuando una accion venga de un superior

## 3. Mapa de cambios por capa

### 3.1 Base de datos

Archivos a tocar:

- `supabase/migrations/<nueva_migracion>_notes_activities_notifications.sql`
- si aplica, migraciones de hardening RLS ya existentes

Cambios esperados:

- `notas`
  - agregar `actividad_id uuid null`
  - indice opcional por `organizacion_id, actividad_id`

- `actividades`
  - agregar `completado_en timestamptz null`
  - agregar `cancelado_en timestamptz null`
  - agregar `cerrado_por_usuario_id uuid null`
  - definir si `asunto` sera el label principal o si se agrega `titulo`
  - conservar `creado_por_usuario_id` y `asignado_a_usuario_id`
  - indices sugeridos:
    - `organizacion_id, estado, recordatorio_en`
    - `organizacion_id, asignado_a_usuario_id, estado`
    - `organizacion_id, oportunidad_id, estado`

- `ui_notificaciones`
  - agregar `actividad_id uuid null`
  - agregar `oportunidad_id uuid null`
  - agregar `contacto_id uuid null`
  - relacionar de forma clara el usuario destinatario con el evento generado
  - indice sugerido:
    - `usuario_id, created_at desc`
    - `usuario_id, read_at, hidden_at`
    - `organizacion_id, created_at desc`

Notas:

- no se recomienda una tabla nueva de recordatorios
- no se recomienda usar `metadata` para relaciones principales
- si una nota de supervisor debe notificar, el evento debe salir de `ui_notificaciones`, no de la nota misma

### 3.2 Backend API

Archivo principal:

- `backend/app/api/routes/crm.py`

Modelos a revisar o extender:

- `CRMNote`
- `CRMNoteCreate`
- `CRMActivity`
- `CRMActivityCreate`
- posible modelo nuevo para marcar actividad completada o cancelada
- posible modelo nuevo para notificacion derivada de actividad o de nota con instruccion

Endpoints a definir o ajustar:

- `GET /crm/notas`
- `POST /crm/notas`
- `GET /crm/actividades`
- `POST /crm/actividades`
- `GET /crm/actividades/{id}`
- `PATCH /crm/actividades/{id}`
- `POST /crm/actividades/{id}/completar`
- `POST /crm/actividades/{id}/cancelar`
- `GET /crm/actividades/proximas`
- `GET /crm/actividades/vencidas`
- `GET /crm/notificaciones`

Comportamiento esperado:

- crear nota con o sin actividad vinculada
- crear actividad desde el modal o sidepanel de oportunidad
- completar o cancelar actividad
- listar actividades por oportunidad, contacto, usuario o estado
- identificar claramente cuando una actividad fue creada por un supervisor para un vendedor
- alimentar el centro de notificaciones desde actividades pendientes o acciones de supervision

### 3.3 Repositorio CRM

Archivo principal:

- `backend/app/repositories/crm.py`

Funciones a revisar o agregar:

- `list_notes`
- `create_note`
- `list_activities`
- `create_activity`
- `get_activity`
- `update_activity`
- `complete_activity`
- `cancel_activity`
- `list_ui_notifications`
- `create_ui_notification`

Comportamiento esperado:

- persistir y leer `actividad_id` en notas
- persistir `completado_en` y `cancelado_en`
- crear notificaciones usando columnas directas
- evitar escribir relaciones importantes dentro de JSON
- conservar `creado_por_usuario_id` y `asignado_a_usuario_id` para trazabilidad

### 3.4 Servicio de notificaciones

Archivos relevantes:

- `backend/app/services/user_notifications.py`
- `backend/app/services/ui_realtime_hub.py`
- eventual servicio nuevo para recordatorios de actividades

Responsabilidad:

- convertir una actividad vencida o programada en una fila de `ui_notificaciones`
- emitir evento realtime al usuario correcto
- evitar duplicados con una clave estable
- notificar al vendedor cuando un supervisor le asigne una accion relevante

Estrategia sugerida:

- servicio batch o worker periodico
- consulta de actividades con `recordatorio_en <= now()` y `estado = 'pendiente'`
- insercion en `ui_notificaciones`
- emision realtime al canal del usuario
- opcion de generar notificacion al crear una nota marcada como "requiere aviso"

### 3.5 Frontend panel

Archivos probables:

- `frontend/panel/src/components/oportunidades/*`
- `frontend/panel/src/components/notas/*`
- `frontend/panel/src/components/actividades/*`
- `frontend/panel/src/components/notificaciones/*`
- `frontend/panel/src/app/oportunidades/*`

Cambios esperados:

- modal o sidepanel de oportunidad:
  - bloque para nota
  - checkbox `Crear recordatorio`
  - checkbox `Notificar al vendedor`
  - fecha/hora
  - responsable
  - tipo de actividad

- centro de notificaciones:
  - lista de pendientes
  - vencidas
  - proximas
  - acciones para abrir/completar/marcar leida

- detalle de oportunidad:
  - timeline de notas y actividades
  - proximos recordatorios
  - actividades abiertas y completadas
  - etiqueta visible de supervisor/autor/destinatario

### 3.6 Panel de contactos u otras vistas relacionadas

Posibles impactos:

- detalle de contacto si una actividad se vincula a contacto
- embudo/oportunidad si la actividad se crea desde una etapa
- vista de inbox si se usa el mismo patron de notificaciones en toda la app

## 4. Secuencia tecnica de ejecucion

### Fase A. Migracion

1. agregar columnas nuevas
2. agregar indices
3. ajustar RLS si hace falta
4. asegurar compatibilidad hacia atras

### Fase B. Backend

1. extender modelos Pydantic
2. agregar endpoints de actividad
3. enlazar notas con actividades
4. crear notificaciones persistentes desde actividades
5. conservar autor y destinatario cuando la accion venga de un supervisor

### Fase C. Frontend

1. agregar controles en modal o sidepanel de oportunidad
2. mostrar actividad creada en el timeline
3. integrar inbox de notificaciones
4. mostrar el origen supervisor/vendedor sin ambiguedad

### Fase D. Validacion

1. pruebas de creacion de nota
2. pruebas de creacion de actividad con recordatorio
3. pruebas de notificacion generada
4. pruebas de permisos y tenant scope
5. pruebas de visibilidad de acciones creadas por supervisor

## 5. Casos de prueba que deben pasar

- crear nota sola
- crear nota + actividad
- crear actividad con `recordatorio_en`
- completar actividad
- cancelar actividad
- generar notificacion al vencer el recordatorio
- generar notificacion al supervisor crear una instruccion para el vendedor
- ver solo notificaciones del usuario autenticado
- ver solo actividades del tenant actual

## 6. Decisiones cerradas antes de codificar

- `notas` no almacenara recordatorios como estado principal
- `actividades` sera la fuente de verdad de tareas
- `ui_notificaciones` sera la fuente de verdad del inbox
- si hace falta relacionar entidades, se hace con columnas FKs
- no se usara JSON como canal principal de consulta
- la autoria y el destinatario deben quedar visibles en acciones de supervision

## 7. Orden recomendado de implementacion

1. migracion de columnas e indices
2. extensiones de backend para `actividades`
3. integracion de `notas` con `actividad_id`
4. generacion de `ui_notificaciones`
5. UI del modal o sidepanel de oportunidad
6. UI del centro de notificaciones
7. pruebas y ajustes
