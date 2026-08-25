# Plan de horarios de atención para asistentes de WhatsApp

## 1. Propósito

Este documento registra el análisis del flujo actual de WhatsApp y propone la funcionalidad para que cada tenant configure cuándo debe responder la inteligencia artificial y cuándo debe atender un vendedor humano.

El objetivo operativo es permitir este esquema:

- Durante el horario laboral: atiende el equipo humano.
- Fuera del horario laboral: atiende el asistente de IA.
- En ambos casos, cada mensaje entrante debe quedar registrado, asignado al vendedor correspondiente y visible como notificación en el frontend.

La funcionalidad debe aplicar tanto al asistente normal de WhatsApp como al asistente de prospección.

Este documento es una propuesta técnica y funcional. No representa una implementación aplicada.

## 2. Alcance analizado

Se revisaron las siguientes áreas:

- Webhooks de Twilio y Meta.
- Resolución del tenant a partir del número de WhatsApp.
- Registro de mensajes y conversaciones.
- Creación o recuperación de oportunidades.
- Asignación automática de vendedores.
- Notificaciones del Inbox y notificaciones globales del panel.
- Modo manual de conversación.
- Selección del asistente normal y del asistente de prospección.
- Prompts, versiones, funciones y configuración en `settings/variables`.
- Seguimientos, reenganches, cierres y notificaciones posteriores.
- Riesgos de tenant isolation, zona horaria, duplicidad y ejecución fuera de horario.

La conexión MCP de Supabase no pudo devolver el esquema remoto porque falló la renovación OAuth. Por ello, la estructura de base de datos descrita aquí se basa en las migraciones y código local; antes de implementar se debe confirmar el esquema remoto y las migraciones aplicadas.

## 3. Flujo actual de WhatsApp

### 3.1 Entrada por Twilio

El endpoint principal es:

```text
POST /whatsapp/webhook
```

El webhook:

1. Valida la firma de Twilio cuando está habilitada.
2. Convierte el formulario en `WhatsAppIncomingMessage`.
3. Envía el procesamiento a `handle_incoming_message` como tarea de fondo.

También existe un webhook de contingencia:

```text
POST /whatsapp/fallback
```

La validación y resolución de tenant se encuentran en:

- `backend/app/channels/whatsapp/router.py`
- `backend/app/channels/whatsapp/deps.py`
- `backend/app/channels/whatsapp/routing.py`

### 3.2 Entrada por Meta Cloud API

Meta utiliza rutas específicas por tenant:

```text
GET  /whatsapp/meta/{organizacion_id}/webhook
POST /whatsapp/meta/{organizacion_id}/webhook
```

El flujo:

1. Valida el token de verificación.
2. Valida la firma `X-Hub-Signature-256`.
3. Resuelve el tenant mediante `phone_number_id` o número visible.
4. Procesa mensajes entrantes y callbacks de estado.

La ruta finalmente delega también en `handle_incoming_message`, por lo que Twilio y Meta comparten la lógica principal.

### 3.3 Registro inicial

`handle_incoming_message` realiza, entre otras, estas operaciones:

1. Evita duplicados mediante `message_sid`.
2. Normaliza el teléfono de origen y destino.
3. Carga la configuración de WhatsApp del tenant.
4. Procesa adjuntos, audio y documentos cuando aplica.
5. Registra el mensaje entrante mediante `storage.register_whatsapp_message`.
6. Recupera `conversation_id`, `persona_id` y el identificador de OpenAI.
7. Marca la conversación como abierta.
8. Cancela seguimientos pendientes cuando el cliente vuelve a escribir.
9. Garantiza la asignación de la conversación antes de notificar al Inbox.

El punto de registro se encuentra en:

```text
backend/app/channels/whatsapp/service.py
backend/app/services/storage.py
```

## 4. Clasificación del flujo

Después de registrar el mensaje, el backend identifica el origen de la conversación:

### 4.1 WhatsApp normal

Se clasifica como:

```text
origin_type = general_whatsapp
```

Usa la configuración general de WhatsApp y el prompt normal.

### 4.2 Prospección

Se clasifica como:

```text
origin_type = prospeccion
```

Ocurre cuando el mensaje está relacionado con un prospecto o campaña de prospección.

### 4.3 Publicidad de WhatsApp

Se clasifica como:

```text
origin_type = publicidad_whatsapp
```

Se utiliza cuando existe una atribución de publicidad entrante. Este flujo también puede trabajar con reglas específicas del asistente de prospección.

La clasificación se realiza en:

```text
backend/app/channels/whatsapp/service.py
```

## 5. Selección de prompts y asistentes

### 5.1 Asistente normal

El runtime resuelve, en orden, la configuración del tenant y los valores globales de fallback.

Los campos principales son:

```text
whatsapp.prompt_id
whatsapp.prompt_version
whatsapp.assistant_id
```

Si existe `prompt_id`, se utiliza un prompt de Responses. Si no existe, se utiliza el Assistant ID configurado.

### 5.2 Asistente de prospección

El flujo de prospección utiliza:

```text
whatsapp.prospeccion.prompt_id
whatsapp.prospeccion.prompt_version
```

La función `_build_assistant_from_runtime` selecciona el prompt de prospección cuando `prospeccion_mode` está activo. Si no lo está, usa la configuración general de WhatsApp.

### 5.3 Contexto que recibe la IA

Antes de ejecutar OpenAI, el backend puede construir:

- Historial reciente de la conversación.
- Resumen de conversación.
- Datos de la persona.
- Datos de la oportunidad.
- Contexto del catálogo.
- Inventario disponible.
- Contexto de agenda.
- Datos de ubicación.
- Tipo de origen de la conversación.
- Adjuntos procesados.
- Identificador de conversación.

El backend es la fuente de verdad para tenant, permisos, catálogo, agenda, contexto y ejecución de funciones.

## 6. Funciones que ejecuta el asistente

El registro y ejecución de funciones se encuentra principalmente en:

```text
backend/app/channels/whatsapp/tools.py
backend/app/assistants/tool_runtime.py
```

Las funciones actuales cubren, entre otros, estos casos:

### Contacto y CRM

- Captura y actualización del nombre.
- Captura de correo.
- Captura de empresa.
- Actualización de datos de la persona.
- Persistencia de necesidad e intención.
- Creación o recuperación de oportunidades.
- Nombrado automático de oportunidades.

### Catálogo

- Listado de fraccionamientos.
- Listado de modelos.
- Consulta de detalles de productos.
- Consulta de inventario.
- Entrega de información comercial.

Las funciones de catálogo se filtran según los flags del tenant.

### Agenda

- `list_demo_slots`
- `schedule_demo`
- `reschedule_demo`
- `cancel_demo`

También existe un flag tenant-aware para habilitar o deshabilitar agenda.

### Comunicación

- Envío de correo con información.
- Envío de PDF o paquete documental.
- Envío de datos del vendedor al cliente, cuando está habilitado.
- Notificación al vendedor.

### Estados de venta

- `close_lead`.
- `mark_lost_negacion`.
- Reinicio del ciclo de conversación.
- Reenganches posteriores.
- Escalamiento al vendedor.

Una negación explícita en prospección puede marcar la oportunidad como perdida sin ejecutar todo el ciclo normal de OpenAI.

## 7. Asignación actual del vendedor

El sistema ya cuenta con una ruta para garantizar la asignación antes de enviar notificaciones del Inbox.

La función central es:

```text
_ensure_inbound_assignment_before_notification
```

Su comportamiento actual es:

1. Consulta la conversación.
2. Si ya tiene `asignado_a_usuario_id`, conserva ese vendedor.
3. Busca una oportunidad relacionada.
4. Si la oportunidad tiene vendedor, asigna ese vendedor a la conversación.
5. Si no existe vendedor, crea o garantiza la oportunidad.
6. La asignación de oportunidad puede utilizar propietario del contacto o round-robin.
7. Confirma que la conversación quedó asignada.
8. Después se publica la notificación.

La asignación round-robin utiliza la función de base de datos existente:

```text
asignar_vendedor_round_robin
```

La asignación queda auditada en la tabla de asignaciones de vendedores.

## 8. Notificaciones actuales

### 8.1 Notificación del Inbox

Cuando llega un mensaje entrante:

1. Se resuelve el vendedor asignado.
2. Se consideran supervisores autorizados cuando corresponde.
3. Se valida permiso `ver_inbox`.
4. Se crea una notificación persistente para el usuario.
5. Se publica el evento realtime.

El tipo utilizado para el mensaje entrante es:

```text
inbox.message
```

La notificación contiene, entre otros:

- Canal.
- Conversation ID.
- Persona ID.
- Message ID.
- Snippet del mensaje.
- Acción para abrir Inbox.

### 8.2 Realtime del Inbox

También se publica un evento de actualización de Inbox:

```text
inbox_message_created
```

El frontend de Inbox mantiene un `EventSource` para refrescar conversaciones y mensajes.

### 8.3 Stream global de notificaciones

El backend mantiene un stream SSE por usuario:

```text
/crm/me/notifications/stream
```

El frontend lo consume a través de:

```text
/api/notifications/stream
```

El componente `GlobalNotificationsProvider` actualiza contador, centro de notificaciones y toast.

### 8.4 Notificación adicional por WhatsApp

Existe otro mecanismo separado: el envío de una notificación WhatsApp al vendedor. Esta notificación no sustituye la notificación realtime del frontend.

La lógica de `notify_sales_rep` puede enviar una plantilla al vendedor, registrar el mensaje y auditar el evento. La nueva funcionalidad de horario debe conservar ambos mecanismos cuando estén configurados.

## 9. Configuración actual en `settings/variables`

La vista `settings/variables` contiene pestañas para:

- WhatsApp.
- Whats-Prosp.
- Cierre.
- Variables generales.
- Secretos.
- Prompts y configuraciones relacionadas.

### 9.1 WhatsApp normal

Actualmente se pueden configurar, entre otros:

```text
whatsapp.provider
whatsapp.prompt_id
whatsapp.prompt_version
whatsapp.assistant_id
whatsapp.location_href
whatsapp.inactivity_minutes
whatsapp.reengage_minutes
whatsapp.reengage_max_attempts
whatsapp.escalate_minutes
whatsapp.close_after_lead_minutes
whatsapp.send_seller_data_to_customer
whatsapp.templates.*
whatsapp.templates_meta.*
whatsapp.twilio.*
whatsapp.meta.*
```

### 9.2 Whats-Prosp

La configuración de prospección incluye:

```text
whatsapp.prospeccion.prompt_id
whatsapp.prospeccion.prompt_version
whatsapp.prospeccion.followup_enabled
whatsapp.prospeccion.inactivity_minutes
whatsapp.prospeccion.reengage_minutes
whatsapp.prospeccion.reengage_max_attempts
whatsapp.prospeccion.escalate_minutes
whatsapp.prospeccion.send_seller_data_to_customer
```

### 9.3 Secretos

Los secretos de Meta y Twilio se manejan aparte de la configuración no sensible. No deben incorporarse al modelo de horarios ni devolverse al frontend.

## 10. Funcionalidad propuesta

### 10.1 Nombre funcional

Se recomienda presentar la función como:

```text
Horario de atención del asistente WhatsApp
```

Descripción para el tenant:

```text
Define cuándo atiende el equipo humano y cuándo responde el asistente automático.
```

### 10.2 Toggle principal

El tenant debe poder activar o desactivar la automatización:

```text
Activar horario del asistente
```

Comportamiento:

- Desactivado: el sistema conserva el comportamiento actual; el asistente responde según las reglas existentes.
- Activado: el asistente responde únicamente fuera de los horarios humanos configurados.

También puede utilizarse una nomenclatura más directa:

```text
Usar IA fuera del horario laboral
```

### 10.3 Horarios semanales

La interfaz debe permitir configurar por día:

| Día | Activo | Inicio | Fin |
|---|---:|---:|---:|
| Lunes | Sí/No | HH:mm | HH:mm |
| Martes | Sí/No | HH:mm | HH:mm |
| Miércoles | Sí/No | HH:mm | HH:mm |
| Jueves | Sí/No | HH:mm | HH:mm |
| Viernes | Sí/No | HH:mm | HH:mm |
| Sábado | Sí/No | HH:mm | HH:mm |
| Domingo | Sí/No | HH:mm | HH:mm |

La configuración debe permitir jornadas que crucen medianoche, por ejemplo:

```text
Inicio: 20:00
Fin: 08:00
```

### 10.4 Zona horaria

Debe utilizarse la zona horaria del tenant, no la zona UTC del servidor.

La organización ya tiene un campo de zona horaria y el frontend cuenta con utilidades de resolución de zona horaria. El runtime del backend debe resolver la zona horaria de forma centralizada y usarla para evaluar el horario.

Si la zona horaria es inválida:

- No se debe ejecutar IA de forma impredecible.
- Se debe registrar un error de configuración.
- La opción segura recomendada es operar como modo humano y notificar al vendedor.

## 11. Modelo de datos recomendado

### 11.1 Recomendación principal

El horario representa una regla de negocio central: se consulta por cada mensaje, se valida, se audita y puede afectar métricas. Por ello, no se recomienda esconderlo en `metadata` ni en un JSON complejo de `organizaciones.config`.

Se recomienda una tabla explícita, por ejemplo:

```text
public.whatsapp_asistente_horarios
```

### 11.2 Columnas propuestas

```text
id uuid primary key
organizacion_id uuid not null
activo boolean not null default false
zona_horaria text not null
aplica_a_normal boolean not null default true
aplica_a_prospeccion boolean not null default true
lunes_activo boolean not null default false
lunes_inicio time null
lunes_fin time null
martes_activo boolean not null default false
martes_inicio time null
martes_fin time null
miercoles_activo boolean not null default false
miercoles_inicio time null
miercoles_fin time null
jueves_activo boolean not null default false
jueves_inicio time null
jueves_fin time null
viernes_activo boolean not null default false
viernes_inicio time null
viernes_fin time null
sabado_activo boolean not null default false
sabado_inicio time null
sabado_fin time null
domingo_activo boolean not null default false
domingo_inicio time null
domingo_fin time null
creado_en timestamptz not null default now()
actualizado_en timestamptz not null default now()
actualizado_por_usuario_id uuid null
```

### 11.3 Constraints recomendados

- Foreign key de `organizacion_id` hacia organizaciones.
- Foreign key de `actualizado_por_usuario_id` hacia usuarios.
- Un solo registro de horario por tenant.
- `zona_horaria` obligatoria cuando `activo = true`.
- Cada día activo debe tener inicio y fin.
- Las horas deben tener formato válido.
- No aceptar horarios incompletos.
- Validar jornadas de medianoche explícitamente.

### 11.4 Índices

Como mínimo:

```text
unique (organizacion_id)
index (organizacion_id, activo)
```

No es necesario indexar cada columna horaria individual porque la evaluación se realiza después de recuperar el único registro del tenant.

### 11.5 Alternativa si se decide conservar configuración JSON

Como alternativa de menor impacto se podría guardar una estructura bajo:

```text
whatsapp.assistant_schedule
```

Sin embargo, esta opción solo debería aceptarse como solución temporal. Si se elige, debe existir un schema Pydantic estricto, validación backend, versionado, auditoría y pruebas de tenant isolation. La recomendación arquitectónica sigue siendo la tabla explícita.

## 12. Contrato de runtime

El runtime debería exponer una estructura tipada similar a:

```python
@dataclass(slots=True, frozen=True)
class WhatsAppAssistantSchedule:
    activo: bool
    zona_horaria: str
    aplica_a_normal: bool
    aplica_a_prospeccion: bool
    windows: dict[int, tuple[time, time] | None]
```

Y una función central:

```python
async def get_whatsapp_assistant_schedule(
    *,
    organizacion_id: UUID,
    force_refresh: bool = False,
) -> WhatsAppAssistantSchedule:
    ...
```

La decisión operativa debería estar encapsulada en una función testeable:

```python
def should_run_whatsapp_assistant(
    *,
    schedule: WhatsAppAssistantSchedule,
    now: datetime,
    flow: Literal["normal", "prospeccion"],
    manual_override: bool,
) -> bool:
    ...
```

El `now` debe ser inyectable para probar cambios de día, horarios nocturnos y zonas horarias.

## 13. Prioridad de decisión

La decisión final debe seguir este orden:

```text
1. ¿La conversación está en manual_override?
   Sí: no ejecutar IA.

2. ¿El asistente está globalmente disponible para el tenant?
   No: no ejecutar IA.

3. ¿El horario está activo y aplica a este flujo?
   No: conservar comportamiento actual o no bloquear IA.

4. ¿La hora actual está dentro del horario humano?
   Sí: no ejecutar IA.

5. Si está fuera del horario humano:
   ejecutar IA.
```

Cuando la respuesta sea “no ejecutar IA”, la función debe retornar después de:

- Registrar el mensaje.
- Crear o recuperar la conversación.
- Asignar vendedor.
- Confirmar la asignación.
- Publicar evento del Inbox.
- Crear la notificación frontend.

No debe:

- Enviar typing indicator.
- Llamar OpenAI.
- Ejecutar funciones del asistente.
- Enviar respuesta automática.

## 14. Ubicación del gate en el backend

El punto recomendado está dentro de `handle_incoming_message`, después del registro inicial y la asignación, pero antes de:

- Indicador de lectura/escritura.
- Construcción del catálogo.
- Preparación completa de contexto de IA.
- `_generate_assistant_reply`.

La razón es preservar siempre la operación humana y evitar consumo innecesario de OpenAI.

El flujo conceptual sería:

```text
webhook
  -> validar firma
  -> resolver tenant
  -> registrar mensaje
  -> asignar vendedor
  -> crear notificación frontend
  -> evaluar manual_override
  -> evaluar horario
      -> horario humano: terminar
      -> fuera de horario: continuar
  -> seleccionar prompt normal/prospección
  -> ejecutar herramientas
  -> enviar respuesta IA
  -> persistir respuesta
```

## 15. Comportamiento por flujo

### 15.1 WhatsApp normal dentro del horario humano

- Se registra el mensaje.
- Se asigna vendedor.
- Se crea notificación `inbox.message`.
- Se actualiza Inbox realtime.
- No se ejecuta IA.
- No se envía respuesta automática.
- El vendedor responde desde Inbox.

### 15.2 WhatsApp normal fuera del horario humano

- Se registra el mensaje.
- Se asigna vendedor.
- Se crea notificación.
- Se ejecuta el prompt normal.
- Se ejecutan las funciones permitidas.
- Se envía y persiste la respuesta.

### 15.3 Prospección dentro del horario humano

- Se registra la respuesta del prospecto.
- Se sincroniza el evento de prospección.
- Se asigna vendedor.
- Se crea notificación frontend.
- No se ejecuta el prompt de prospección.
- No se envía respuesta automática.

### 15.4 Prospección fuera del horario humano

- Se registra la respuesta.
- Se identifica el flujo de prospección.
- Se asigna vendedor.
- Se notifica al frontend.
- Se ejecuta `whatsapp.prospeccion.prompt_id`.
- Se conservan sus reglas de negación, seguimiento y cierre.

## 16. Conversaciones tomadas manualmente

`manual_override` debe tener prioridad sobre el horario.

Si un vendedor toma una conversación durante el día y el cliente escribe después de horario:

- La conversación debe continuar en modo humano.
- La IA no debe contestar automáticamente.
- El vendedor debe poder devolver explícitamente la conversación al asistente.

Se recomienda una acción explícita como:

```text
Activar asistente para esta conversación
```

Y otra para:

```text
Tomar conversación manualmente
```

Estas acciones deben estar protegidas por los permisos del Inbox y validarse en backend.

## 17. API propuesta

Si se utiliza tabla explícita, se recomienda un recurso tenant-scoped:

```text
GET   /crm/tenant/me/whatsapp-assistant-schedule
PUT   /crm/tenant/me/whatsapp-assistant-schedule
POST  /crm/tenant/me/whatsapp-assistant-schedule/validate
```

El BFF del panel podría exponer:

```text
GET /api/settings/variables/whatsapp-assistant-schedule
PUT /api/settings/variables/whatsapp-assistant-schedule
```

El contrato de actualización no debe aceptar `organizacion_id` enviado por el navegador. El backend debe resolver el tenant desde el usuario autenticado.

### 17.1 Schema de actualización

El schema debería separar lectura y actualización:

```text
WhatsAppAssistantScheduleUpdate
WhatsAppAssistantScheduleRead
WhatsAppAssistantScheduleValidation
```

La actualización debe validar:

- Zona horaria IANA.
- Días activos.
- Inicio y fin.
- Aplicación a normal/prospección.
- Activación o desactivación.

## 18. UI propuesta en `settings/variables`

Se recomienda agregar un bloque dentro de las configuraciones de WhatsApp, sin crear una pantalla separada.

### Controles

- Switch: `Usar IA fuera del horario laboral`.
- Select de zona horaria.
- Tabla semanal.
- Botón `Copiar horario a todos los días`.
- Botón `Guardar horario`.
- Indicador del estado actual.
- Mensaje de resumen:

```text
Actualmente: humano dentro del horario configurado, IA fuera de horario.
```

### Estado desactivado

Debe indicar claramente:

```text
El horario está desactivado. El asistente conserva su comportamiento actual.
```

### Aplicación del horario

Se puede permitir elegir:

- WhatsApp normal y prospección.
- Solo WhatsApp normal.
- Solo prospección.

La opción recomendada por defecto es ambos flujos, porque comparten el mismo canal y la misma necesidad operativa.

## 19. Caché de configuración

`tenant_runtime` utiliza caché local para configuración de tenant.

Al guardar el horario se debe:

1. Persistir la configuración.
2. Invalidar el caché del tenant.
3. Devolver la configuración efectiva.
4. Mostrar el estado actualizado en frontend.

No se debe esperar al TTL para que el cambio tenga efecto, porque el tenant espera que activar o desactivar sea inmediato.

## 20. Seguimientos y tareas automáticas

La nueva funcionalidad debe distinguir entre:

### Respuesta automática inmediata

Debe respetar el horario y no enviarse durante horario humano.

### Jobs de seguimiento

Los jobs de reenganche, escalamiento o cierre deben revisarse por separado. No es suficiente bloquear únicamente `handle_incoming_message` porque un job podría enviar un mensaje automático fuera de la misma regla.

Cada job que genere una salida automática de WhatsApp debe consultar:

- Estado del tenant.
- Horario efectivo.
- `manual_override`.
- Estado de la conversación.
- Si el contacto ya respondió.

La regla debe aplicarse al menos a:

- Reenganches.
- Seguimientos de prospección.
- Escalamientos automáticos.
- Mensajes automáticos posteriores al cierre.

Las notificaciones internas al vendedor pueden seguir ejecutándose aunque el envío de respuesta al cliente se bloquee.

## 21. Seguridad y tenant isolation

### Requisitos

- Toda lectura debe filtrarse por el tenant autenticado.
- Toda escritura debe resolver el tenant en backend.
- No confiar en un `organizacion_id` del frontend.
- Validar permisos de configuración, por ejemplo `settings.manage`.
- Validar permisos de acciones manuales sobre conversaciones.
- No exponer secretos de Twilio, Meta u OpenAI.
- No registrar tokens ni payloads completos sensibles.
- No permitir que un tenant consulte horarios de otro tenant.
- No permitir que un vendedor cambie la configuración global si no tiene permiso.

### Notificaciones

La notificación debe dirigirse al vendedor asignado y a supervisores autorizados, no a todos los usuarios con acceso genérico al Inbox.

### Webhooks

La validación de firma de Twilio y Meta debe permanecer intacta. El gate horario no debe colocarse antes de la validación de autenticidad del webhook.

## 22. Idempotencia y concurrencia

El mismo mensaje puede llegar más de una vez por reintento del proveedor. El sistema ya tiene validación por `message_sid`; la nueva lógica debe preservar ese comportamiento.

También debe contemplar dos mensajes simultáneos:

- La asignación debe ser idempotente.
- No deben crearse dos oportunidades para la misma conversación.
- No deben generarse dos notificaciones duplicadas.
- No deben ejecutarse dos respuestas IA para el mismo mensaje.

Se recomienda registrar en logs la decisión de horario con un identificador de mensaje y conversación:

```text
whatsapp.assistant_schedule_decision
```

Campos útiles:

```text
organizacion_id
conversation_id
message_id
flow
local_time
timezone
schedule_active
manual_override
assistant_allowed
decision_reason
```

No se deben guardar tokens ni payloads completos del proveedor.

## 23. Casos límite

### Sin horario configurado

Conservar el comportamiento actual para no cambiar el comportamiento de tenants existentes.

### Horario desactivado

Conservar el comportamiento actual.

### Tenant sin vendedores disponibles

Registrar el mensaje y publicar el error operativo correspondiente. No enviar IA si la regla exige que todo mensaje sea primero asignado y no existe un vendedor válido.

### Horario incompleto

Rechazar el guardado y mostrar el día que falta configurar.

### Horario que cruza medianoche

Interpretar el intervalo como una ventana que continúa en el día siguiente.

### Cambio de horario durante una conversación

El nuevo horario debe aplicar al siguiente mensaje entrante y a los jobs futuros. No se debe reescribir el historial.

### Cambio de zona horaria

Debe afectar inmediatamente al cálculo de nuevos mensajes después de invalidar caché.

### DST y cambios de horario legal

Usar zonas IANA como `America/Mexico_City`, no offsets fijos como `UTC-6`.

### Conversación en `manual_override`

Nunca ejecutar IA automáticamente hasta que exista una acción explícita para liberarla.

## 24. Plan de implementación recomendado

### Fase 1: Confirmación de estado actual

- Confirmar esquema remoto de Supabase.
- Confirmar migraciones aplicadas.
- Confirmar permisos de `settings.manage`.
- Confirmar existencia y políticas de la tabla de notificaciones.
- Confirmar estado del worker de notificaciones.
- Confirmar jobs de seguimiento que envían WhatsApp.

### Fase 2: Base de datos

- Crear tabla explícita tenant-scoped.
- Agregar constraints.
- Agregar índices.
- Agregar RLS o control equivalente.
- Crear registro por defecto solo si se decide que todos los tenants deben tener configuración explícita.
- Evitar activar la regla por defecto para tenants existentes.

### Fase 3: Runtime backend

- Crear dataclass de horario.
- Crear lectura tenant-aware con caché.
- Crear invalidación de caché.
- Crear evaluador de zona horaria y ventanas.
- Crear logs de decisión.

### Fase 4: Integración en WhatsApp

- Mantener registro y asignación antes del gate.
- Evaluar `manual_override`.
- Evaluar horario.
- Omitir typing indicator e IA durante horario humano.
- Mantener notificación frontend.
- Mantener clasificación normal/prospección.

### Fase 5: Jobs automáticos

- Revisar reenganches.
- Revisar seguimientos de prospección.
- Revisar escalamiento.
- Revisar mensajes post-cierre.
- Aplicar la misma regla en cada salida automática.

### Fase 6: API y panel

- Crear endpoints tenant-scoped.
- Agregar schemas Pydantic.
- Agregar sección en `settings/variables`.
- Validar permisos en backend.
- Mostrar estado efectivo y errores de configuración.

### Fase 7: Pruebas

- Pruebas unitarias de ventanas horarias.
- Pruebas de medianoche.
- Pruebas de zona horaria.
- Pruebas de normal y prospección.
- Pruebas con horario desactivado.
- Pruebas con `manual_override`.
- Pruebas de asignación antes de salida temprana.
- Pruebas de notificación frontend.
- Pruebas de duplicidad y concurrencia.
- Pruebas de tenant isolation.

### Fase 8: Despliegue y verificación

- Aplicar migración remota.
- Desplegar backend.
- Desplegar panel.
- Verificar logs.
- Probar un tenant real con horario humano.
- Probar un tenant real con horario IA.
- Probar ambos flujos: normal y prospección.
- Confirmar que el vendedor recibe notificación en frontend.
- Confirmar que no se envía respuesta IA durante horario humano.
- Confirmar que sí se envía respuesta IA fuera de horario.

## 25. Matriz de aceptación

| Caso | Registro | Asignación | Notificación frontend | IA | Respuesta cliente |
|---|---:|---:|---:|---:|---:|
| Horario desactivado | Sí | Sí | Sí | Comportamiento actual | Según configuración actual |
| Horario activo, horario humano | Sí | Sí | Sí | No | No automática |
| Horario activo, fuera de horario | Sí | Sí | Sí | Sí | Sí |
| `manual_override` activo | Sí | Sí | Sí | No | No automática |
| Prospección en horario humano | Sí | Sí | Sí | No | No automática |
| Prospección fuera de horario | Sí | Sí | Sí | Prompt prospección | Sí |
| Horario inválido | Sí | Sí | Sí | No, comportamiento seguro | No automática |
| Sin vendedor disponible | Sí | No confirmado | Error operativo | No recomendada | No automática |

## 26. Decisiones recomendadas

1. Aplicar la regla a WhatsApp normal y prospección.
2. Usar horario humano como ventana y activar IA fuera de esa ventana.
3. Mantener el feature desactivado por defecto para tenants existentes.
4. Evaluar el horario después de asignar y notificar.
5. Dar prioridad absoluta a `manual_override`.
6. Usar la zona horaria del tenant.
7. Modelar el horario en tabla explícita.
8. Revisar también jobs de seguimiento y no solo el webhook.
9. Mantener las notificaciones actuales del Inbox y SSE.
10. No crear un canal paralelo de notificaciones.

## 27. Conclusión

La plataforma ya tiene los elementos centrales para soportar esta funcionalidad: configuración por tenant, resolución de prompts separados, asignación automática, auditoría, notificaciones persistentes y realtime en el frontend.

La implementación debe introducir una decisión de horario en el backend sin interrumpir el flujo inicial de registro, asignación y notificación.

El comportamiento final recomendado es:

```text
Mensaje entrante
  -> registrar
  -> asignar vendedor
  -> notificar frontend
  -> respetar manual_override
  -> evaluar horario tenant-aware
      -> horario humano: vendedor continúa
      -> fuera de horario: IA continúa
```

Así cada tenant podrá aprovechar la atención personal durante su jornada y la automatización fuera de horario, sin perder conversaciones ni notificaciones operativas.

## 28. Referencias del análisis local

- `backend/app/channels/whatsapp/router.py`
- `backend/app/channels/whatsapp/deps.py`
- `backend/app/channels/whatsapp/routing.py`
- `backend/app/channels/whatsapp/service.py`
- `backend/app/channels/whatsapp/tools.py`
- `backend/app/assistants/manager.py`
- `backend/app/assistants/runtime.py`
- `backend/app/services/tenant_runtime.py`
- `backend/app/services/storage.py`
- `backend/app/services/user_notifications.py`
- `backend/app/services/sales_notification_jobs.py`
- `backend/app/api/routes/crm.py`
- `frontend/panel/src/app/settings/variables/page.tsx`
- `frontend/panel/src/app/settings/variables/actions.ts`
- `frontend/panel/src/app/settings/variables/components/tenant-variables-sections-panel.tsx`
- `frontend/panel/src/components/notifications/global-notifications-provider.tsx`
- `frontend/panel/src/components/inbox/split-view.tsx`
- `supabase/migrations/20251221_200000_whatsapp_sales_round_robin.sql`
- `supabase/migrations/20251221_210000_sales_assignment_audit.sql`
- `supabase/migrations/20280426_150000_sales_notification_jobs.sql`
