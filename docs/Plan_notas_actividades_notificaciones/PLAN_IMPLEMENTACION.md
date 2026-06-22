# Plan de implementacion: notas, actividades y notificaciones

Fecha: 2026-06-22

## 1. Objetivo

Unificar el flujo operativo del CRM para que una oportunidad, una conversacion o una revison comercial puedan generar:

- una nota para contexto
- una actividad accionable para seguimiento
- una notificacion visible en el centro de notificaciones

La premisa de este plan es no usar `metadata` para el flujo principal. Todo lo importante debe vivir en columnas para facilitar filtros, orden, vencimientos, asignacion, auditoria y notificaciones.

## 2. Principio de diseno

Separacion de responsabilidades:

- `notas`: registro libre, historico y narrativo
- `actividades`: tareas y recordatorios operativos
- `ui_notificaciones`: bandeja persistente para mostrar alertas al usuario

Regla de implementacion:

- si algo se consulta, filtra, vence o audita, va en columna
- si algo solo acompana contexto opcional, puede quedarse fuera del flujo principal
- si algo requiere inbox o alertas, debe materializarse como registro propio
- si un supervisor crea una accion para un vendedor, deben quedar claras la autoria, el destinatario y el motivo operativo

## 3. Estado actual

La base ya tiene las piezas principales:

- `public.notas`
- `public.actividades`
- `public.ui_notificaciones`

Lo relevante es que:

- `notas` hoy es una tabla de texto por relacion
- `actividades` ya incluye `estado`, `prioridad`, `fecha_vencimiento`, `inicio_en`, `fin_en`, `sla_horas`, `recordatorio_en` y relaciones a cuenta/contacto/oportunidad
- `ui_notificaciones` ya funciona como centro de notificaciones por usuario con `read_at`, `hidden_at`, `expires_at` y `payload`

Conclusiones del estado actual:

- no hace falta crear una tabla nueva de tareas desde cero
- si conviene ampliar `actividades` y enlazarla mejor con `notas` y `ui_notificaciones`
- el centro de notificaciones debe apoyarse en `ui_notificaciones`, no en `notas`

## 4. Alcance funcional

### 4.1 En el modal o sidepanel de oportunidad

El usuario podra:

- crear una nota
- crear una actividad
- convertir una nota en actividad si se requiere
- definir fecha y hora del recordatorio
- asignar responsable
- elegir tipo de accion: llamada, correo, seguimiento, reunion, interno
- notificar al vendedor cuando la accion venga de un supervisor

### 4.2 En el caso de supervisor comercial

El gerente podra:

- dejar una nota que quede registrada como autoria del supervisor
- crear una actividad para un vendedor especifico
- hacer que el vendedor reciba una notificacion clara
- revisar la respuesta del equipo desde la misma oportunidad

### 4.3 En el centro de notificaciones

El usuario vera:

- recordatorios de hoy
- recordatorios proximos
- recordatorios vencidos
- notificaciones generadas por actividades pendientes
- acciones creadas por supervisores o gerentes

### 4.4 En la oportunidad

La oportunidad debera mostrar:

- notas historicas
- actividades abiertas
- actividades completadas
- proximos recordatorios
- quien creo la accion y para quien fue dirigida

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
- conservar la autoria real del supervisor o del vendedor

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
- distinguir entre quien creo la actividad y quien la debe ejecutar

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
- avisar a un vendedor cuando un supervisor crea o asigna una accion

## 6. Flujo propuesto

### 6.1 Supervisor asigna una actividad

1. El gerente abre una oportunidad en `/oportunidades`.
2. Crea una actividad para un vendedor.
3. El backend guarda:
   - quien la creo
   - a quien va dirigida
   - sobre que oportunidad aplica
4. Si la actividad tiene `recordatorio_en`, se programa la notificacion.
5. El vendedor recibe un aviso en su inbox.

### 6.2 Supervisor deja una nota con seguimiento

1. El gerente registra una nota en la oportunidad.
2. Puede marcar que la nota debe notificar al vendedor.
3. El backend crea:
   - la nota
   - la notificacion
4. La nota queda como contexto o instruccion.
5. La notificacion solo anuncia que existe una novedad.

### 6.3 Programacion de notificaciones

1. Un proceso backend revisa actividades pendientes.
2. Busca actividades con:
   - `estado = 'pendiente'`
   - `recordatorio_en <= now()`
3. Crea un registro en `ui_notificaciones`.
4. La notificacion aparece en el centro de notificaciones del usuario asignado.

### 6.4 Cierre de tarea

1. El usuario marca la actividad como completada.
2. Se rellena `completado_en`.
3. La notificacion asociada se puede marcar como leida o resolver.

## 7. Cambios de backend

### 7.1 API de notas

Objetivo:

- permitir crear notas simples
- permitir crear notas vinculadas a una actividad
- permitir que una nota dispare una notificacion si la accion la origina un supervisor

Cambios:

- ampliar el create de notas para aceptar `actividad_id` si se decide persistir la relacion
- validar que la actividad pertenezca a la misma organizacion
- conservar `creado_por_usuario_id` como autoria real

### 7.2 API de actividades

Objetivo:

- crear, listar, actualizar y completar actividades
- exponer recordatorios proximos y vencidos

Cambios:

- endpoints para crear actividad
- endpoint para marcar como completada
- endpoint para cancelar
- endpoint para listar pendientes por oportunidad, contacto o usuario
- respetar el origen de la actividad cuando la crea un supervisor

### 7.3 Generacion de notificaciones

Objetivo:

- crear `ui_notificaciones` a partir de actividades programadas o acciones de supervision

Cambios:

- servicio que transforme actividades vencidas en notificaciones
- servicio que genere notificacion al vendedor cuando la accion venga de un supervisor
- control de duplicados por `dedupe_key`
- opcion de agrupar notificaciones similares por `agrupacion_key`

## 8. Cambios de frontend

### 8.1 Modal o sidepanel de oportunidad

Agregar seccion:

- nota
- checkbox `Crear recordatorio`
- checkbox `Notificar al vendedor`
- fecha y hora
- responsable
- tipo de actividad

### 8.2 Centro de notificaciones

Mostrar:

- pendientes
- vencidas
- proximas
- completadas recientemente
- acciones creadas por supervisores

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
- autoria y destinatario de acciones

## 9. Reglas de negocio recomendadas

- Una nota puede existir sin actividad.
- Una actividad puede existir sin nota.
- Si el usuario marca `Crear recordatorio`, la actividad es obligatoria.
- Toda actividad debe pertenecer a exactamente una organizacion.
- Todo recordatorio debe tener un responsable o caer en una cola por defecto.
- El inbox no debe leer directamente de `notas`.
- Si un supervisor crea una accion, la autoria y el destinatario deben verse de forma explicita.
- La notificacion no sustituye el registro de negocio; solo lo anuncia.

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
- preservar autoria y destinatario cuando la accion venga de supervisor

### Fase 3: Frontend

- agregar UI en modal o sidepanel de oportunidad
- agregar panel de recordatorios y actividades
- conectar el centro de notificaciones
- mostrar claramente quien crea y quien recibe la accion

### Fase 4: Validacion

- pruebas de creacion de nota
- pruebas de creacion de actividad con recordatorio
- pruebas de generacion de notificacion
- pruebas de visibilidad por usuario y tenant
- pruebas de acciones creadas por supervisor

## 12. Decisiones cerradas por este plan

- No usar `metadata` para el flujo principal.
- No crear una tabla nueva de recordatorios por ahora.
- Reutilizar `actividades` como fuente de verdad de tareas y recordatorios.
- Reutilizar `ui_notificaciones` como inbox persistente.
- Mantener `notas` como historial narrativo.
- Permitir que supervisor y gerente creen acciones para vendedores sin perder autoria.

## 13. Proximo paso tecnico

Antes de implementar:

1. revisar si `notas` debe llevar `actividad_id`
2. definir si `asunto` basta en `actividades` o si conviene `titulo`
3. acordar si la generacion de notificaciones saldra de un worker programado o de un job periodico en backend
4. definir si la nota del supervisor tendra checkbox explicito para notificar al vendedor
