# Plan de implementacion: notas, actividades y notificaciones

Fecha: 2026-05-12

## 1. Objetivo

Unificar el flujo operativo del CRM para que una conversacion, una oportunidad o un contacto puedan generar:

- una nota libre para contexto
- una actividad accionable para seguimiento
- un recordatorio visible en el centro de notificaciones

La premisa de este plan es no usar `metadata` para el flujo principal. Todo lo importante debe vivir en columnas para facilitar filtros, orden, vencimientos, agendas y notificaciones.

## 2. Principio de diseno

Separacion de responsabilidades:

- `notas`: registro libre, historico y narrativo
- `actividades`: tareas y recordatorios operativos
- `ui_notificaciones`: bandeja persistente para mostrar alertas al usuario

Regla de implementacion:

- si algo se consulta, filtra o vence, va en columna
- si algo solo acompana contexto opcional, puede quedarse fuera del flujo principal
- si algo requiere inbox o alertas, debe materializarse como registro propio

## 3. Estado actual

La base ya tiene las piezas principales:

- `public.notas`
- `public.actividades`
- `public.ui_notificaciones`

Lo relevante es que:

- `notas` hoy es una tabla simple de texto por relacion
- `actividades` ya incluye `estado`, `prioridad`, `fecha_vencimiento`, `inicio_en`, `fin_en`, `sla_horas`, `recordatorio_en` y relaciones a cuenta/contacto/oportunidad
- `ui_notificaciones` ya funciona como centro de notificaciones por usuario con `read_at`, `hidden_at`, `expires_at` y `payload`

Conclusiones del estado actual:

- no hace falta crear una tabla nueva de tareas desde cero
- si conviene ampliar `actividades` y enlazarla mejor con `notas` y `ui_notificaciones`
- el centro de notificaciones debe apoyarse en `ui_notificaciones`, no en `notas`

## 4. Alcance funcional

### 4.1 En el modal de oportunidad

El usuario podra:

- crear una nota
- convertir esa nota en una actividad
- definir fecha y hora del recordatorio
- asignar responsable
- elegir tipo de accion: llamada, correo, seguimiento, reunion, interno

### 4.2 En el centro de notificaciones

El usuario vera:

- recordatorios de hoy
- recordatorios proximos
- recordatorios vencidos
- notificaciones generadas por actividades pendientes

### 4.3 En la oportunidad

La oportunidad debera mostrar:

- notas historicas
- actividades abiertas
- actividades completadas
- proximos recordatorios

## 5. Modelo de datos propuesto

### 5.1 Tabla `notas`

Mantenerla como tabla de texto libre.

Campos actuales utiles:

- `id`
- `organizacion_id`
- `relacion_tipo`
- `relacion_id`
- `texto`
- `visible_para_cliente`
- `tipo`
- `creado_por_usuario_id`
- `creado_en`
- `actualizado_en`

Extensiones sugeridas:

- `actividad_id uuid null`

Uso:

- opcionalmente enlazar una nota con la actividad que la origino
- permitir rastrear desde la nota a la tarea creada

No agregar:

- recordatorio directo
- estado de tarea
- campos de vencimiento

### 5.2 Tabla `actividades`

Esta es la tabla central de seguimiento.

Campos actuales utiles:

- `tipo`
- `canal`
- `asunto`
- `descripcion`
- `estado`
- `prioridad`
- `fecha_vencimiento`
- `inicio_en`
- `fin_en`
- `sla_horas`
- `recordatorio_en`
- `cuenta_id`
- `contacto_id`
- `oportunidad_id`
- `creado_por_usuario_id`
- `asignado_a_usuario_id`

Extensiones sugeridas:

- `titulo text not null` o reforzar `asunto` como campo principal de listado
- `completado_en timestamptz`
- `cancelado_en timestamptz`
- `cerrado_por_usuario_id uuid null`

Uso:

- representar tareas reales
- disparar recordatorios
- servir como fuente para alertas y paneles de seguimiento

### 5.3 Tabla `ui_notificaciones`

Mantenerla como inbox persistente.

Campos actuales utiles:

- `tipo`
- `categoria`
- `nivel`
- `titulo`
- `mensaje`
- `entity_kind`
- `entity_id`
- `action_label`
- `action_href`
- `payload`
- `dedupe_key`
- `agrupacion_key`
- `created_at`
- `read_at`
- `hidden_at`
- `expires_at`
- `toast_shown_at`

Extensiones sugeridas:

- `actividad_id uuid null`
- `oportunidad_id uuid null`
- `contacto_id uuid null`

Uso:

- mostrar recordatorios ya vencidos o por vencer
- agrupar alertas por usuario
- enlazar cada notificacion a la actividad que la genero

## 6. Flujo propuesto

### 6.1 Crear nota y recordatorio

1. El usuario registra una nota en la oportunidad.
2. Desde el mismo modal marca `Crear recordatorio`.
3. El backend crea:
   - la nota
   - la actividad asociada
4. Si la actividad tiene `recordatorio_en`, se programara la notificacion.

### 6.2 Programacion de notificaciones

1. Un proceso backend revisa actividades pendientes.
2. Busca actividades con:
   - `estado = 'pendiente'`
   - `recordatorio_en <= now()`
3. Crea un registro en `ui_notificaciones`.
4. La notificacion aparece en el centro de notificaciones del usuario asignado.

### 6.3 Cierre de tarea

1. El usuario marca la actividad como completada.
2. Se rellena `completado_en`.
3. La notificacion asociada se puede marcar como leida o resolver.

## 7. Cambios de backend

### 7.1 API de notas

Objetivo:

- permitir crear notas simples
- permitir crear notas vinculadas a una actividad

Cambios:

- ampliar el create de notas para aceptar `actividad_id` si se decide persistir la relacion
- validar que la actividad pertenezca a la misma organizacion

### 7.2 API de actividades

Objetivo:

- crear, listar, actualizar y completar actividades
- exponer recordatorios proximos y vencidos

Cambios:

- endpoints para crear actividad
- endpoint para marcar como completada
- endpoint para cancelar
- endpoint para listar pendientes por oportunidad, contacto o usuario

### 7.3 Generacion de notificaciones

Objetivo:

- crear `ui_notificaciones` a partir de actividades programadas

Cambios:

- servicio que transforme actividades vencidas en notificaciones
- control de duplicados por `dedupe_key`
- opcion de agrupar notificaciones similares por `agrupacion_key`

## 8. Cambios de frontend

### 8.1 Modal de oportunidad

Agregar seccion:

- nota
- checkbox `Crear recordatorio`
- fecha y hora
- responsable
- tipo de actividad

### 8.2 Centro de notificaciones

Mostrar:

- pendientes
- vencidas
- proximas
- completadas recientemente

Acciones:

- marcar como leida
- abrir actividad
- posponer
- completar tarea

### 8.3 Vista de oportunidad

Mostrar una linea de tiempo simple:

- notas
- actividades
- recordatorios
- cambios de estado

## 9. Reglas de negocio recomendadas

- Una nota puede existir sin actividad.
- Una actividad puede existir sin nota.
- Si el usuario marca `Crear recordatorio`, la actividad es obligatoria.
- Toda actividad debe pertenecer a exactamente una organizacion.
- Todo recordatorio debe tener un responsable o caer en una cola por defecto.
- El inbox no debe leer directamente de `notas`.

## 10. Indices y performance

Como queremos evitar depender de JSON para consultas frecuentes, las columnas deben ser consultables directamente.

Indices recomendados:

- `actividades (organizacion_id, estado, recordatorio_en)`
- `actividades (organizacion_id, asignado_a_usuario_id, estado)`
- `actividades (organizacion_id, oportunidad_id, estado)`
- `ui_notificaciones (usuario_id, created_at desc)`
- `ui_notificaciones (usuario_id, read_at, hidden_at)`
- `ui_notificaciones (organizacion_id, created_at desc)`

## 11. Fases de implementacion

### Fase 1: Modelo y columnas

- confirmar si `notas` requiere `actividad_id`
- agregar columnas faltantes a `actividades`
- agregar relaciones necesarias en `ui_notificaciones`

### Fase 2: Backend

- crear endpoints de actividades completos
- vincular notas con actividades
- generar notificaciones desde el scheduler o worker

### Fase 3: Frontend

- agregar UI en modal de oportunidad
- agregar panel de recordatorios y actividades
- conectar el centro de notificaciones

### Fase 4: Validacion

- pruebas de creacion de nota
- pruebas de creacion de actividad con recordatorio
- pruebas de generacion de notificacion
- pruebas de visibilidad por usuario y tenant

## 12. Decisiones cerradas por este plan

- No usar `metadata` para el flujo principal.
- No crear una tabla nueva de recordatorios por ahora.
- Reutilizar `actividades` como fuente de verdad de tareas y recordatorios.
- Reutilizar `ui_notificaciones` como inbox persistente.
- Mantener `notas` como historial narrativo.

## 13. Proximo paso tecnico

Antes de implementar:

1. revisar si `notas` debe llevar `actividad_id`
2. definir si `asunto` basta en `actividades` o si conviene `titulo`
3. acordar si la generacion de notificaciones saldra de un worker programado o de un job periodico en backend

