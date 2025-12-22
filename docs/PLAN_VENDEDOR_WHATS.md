# Plan de asignación y seguimiento de vendedores para WhatsApp

Checklist para implementar el flujo de asignación automática de vendedores, notificaciones y reenganche. Cada paso incluye [ ] para marcar avance.

## 1. Información base
- [x] Mapear los campos existentes en `empleados`, `usuarios`, `oportunidades` y `conversaciones` que usaremos (es_vendedor, telefono, asignado_a_usuario_id, metadata).
- [ ] Confirmar los estados/etapas del CRM que representan “demo agendada” y “info enviada”.
- [x] Definir el SLA de inactividad (ej. 30 min sin respuesta) para disparar reenganche/notificación tardía.

## 2. Asignación round-robin desde el primer mensaje
- [x] Crear en `CRMRepository` un método `get_next_sales_rep(organizacion_id)` que:
  - [x] Filtre `empleados` con `es_vendedor = true` para la organización.
  - [x] Ordene por `coalesce(ultimo_lead_asignado_en, '1970…')` y `usuario_id`.
  - [x] Use `FOR UPDATE SKIP LOCKED` para evitar conflictos.
- [x] Actualizar `storage.ensure_conversation_opportunity` / `CRMRepository.ensure_conversation_opportunity` para:
  - [x] Detectar si la oportunidad nueva carece de `asignado_a_usuario_id`.
  - [x] Invocar `get_next_sales_rep` y asignar el `usuario_id` resultante.
  - [x] Actualizar `empleados.ultimo_lead_asignado_en = now()` tras la asignación.
- [x] Guardar el `usuario_id` asignado en la conversación/contacto (metadata o campo dedicado) para consultas rápidas.
- [ ] Cuando una conversación se reinicie tras inactividad, crear una nueva oportunidad “heredando” el estado de la anterior y manteniendo el vendedor si ya existía asignación.

## 3. Persistencia y auditoría de asignaciones
- [x] (Opcional) Crear tabla `asignaciones_ventas` con `conversation_id`, `oportunidad_id`, `usuario_id`, `asignado_en`.
- [x] Registrar cada asignación (aunque se repita el mismo vendedor) para auditoría y métricas.
- [x] Crear la vista `v_asignaciones_vendedores_whatsapp` para combinar conversación, contacto y vendedor.

## 4. Notificación cuando el bot completa calificación
- [x] Identificar el hook exacto:
  - [x] Tool `close_lead` cuando se obtienen nombre/correo/teléfono/empresa.
  - [x] Tool adicional “schedule_demo” o estado “demo_agendada”.
- [x] Construir helper `notify_sales_rep(conversation_id, payload)` que:
  - [x] Resuelva el vendedor asignado y su contacto (`usuarios.telefono_e164` o identidad WhatsApp).
  - [x] Arme el mensaje con datos del prospecto (nombre, empresa, necesidad, fecha demo/info enviada).
  - [x] Envíe el WhatsApp usando `whatsapp.service.send_manual_message`.
  - [x] Registre el envío en `storage.register_whatsapp_message`.
- [x] Integrar la llamada al helper en el hook elegido (tool o cambio de etapa).

## 5. Reenganche automático del bot
- [x] Definir regla: si no hay respuesta del cliente X minutos después del último mensaje del bot.
- [x] Crear job (cron/worker) que:
  - [x] Busque conversaciones WhatsApp con último mensaje saliente del bot y sin respuesta en el SLA.
  - [x] Envíe un mensaje “¿Seguimos en contacto?” vía `whatsapp_service`.
  - [x] Marque en metadatos cuántos intentos de reenganche se hicieron para evitar spam.
- [x] Si tras N intentos sigue sin respuesta, disparar notificación al vendedor (ver siguiente sección).

## 6. Notificación al vendedor por inactividad
- [x] Reusar el job anterior para detectar conversaciones “sin respuesta” más largas (ej. 2 horas).
- [x] Enviar mensaje al vendedor asignado con resumen del lead y advertencia de inactividad.
- [x] Registrar estas alertas (tabla o metadata) para no repetirlas innecesariamente.

## 7. Mensajería y plantillas
- [x] Diseñar copy para:
  - [x] Notificación de lead calificado (“Hola [Nombre], Tal-IA obtuvo estos datos…”).
  - [x] Alerta por inactividad (“El prospecto [Nombre] no respondió en X min…”).
  - [x] Mensaje de reenganche del bot (“¿Seguimos? Tengo ejemplos listos.”).
- [x] Validar que Twilio permita enviar esos mensajes (evitar plantillas restringidas).
- [x] Configurar plantilla WhatsApp para notificaciones internas (`WHATSAPP_SALES_TEMPLATE_SID`) y enviar los mensajes 100% vía plantilla aprobada.

## 8. Configuración y parámetros
- [x] Exponer en settings/env:
  - [x] SLA de reenganche (`WHATSAPP_REENGAGE_MINUTES`).
  - [x] SLA de alerta al vendedor (`WHATSAPP_ESCALATE_MINUTES`).
  - [x] Número de reenganches antes de alertar.
- [ ] Permitir listas blancas/negro de vendedores por organización si se requiere.

## 9. Testing y validación
- [ ] Tests unitarios para `get_next_sales_rep` y la actualización de oportunidades.
- [ ] Tests e2e simulando:
  - [ ] Lead nuevo → asignación → tool `close_lead` → notificación.
  - [ ] Lead sin respuesta → reenganche → alerta al vendedor.
- [ ] Validar que el round-robin respeta el orden incluso con concurrencia (tests con locks simulados).
- [ ] Revisar métricas/logs (`whatsapp.sales_notification_sent`, `whatsapp.reengage_triggered`).

## 10. Despliegue y monitoreo
- [ ] Crear migraciones necesarias (nueva tabla, índices, columnas).
- [ ] Desplegar backend + workers.
- [ ] Configurar alertas (ej. si falla `get_next_sales_rep` o no hay vendedores disponibles).
- [ ] Monitorear dashboards para asegurar distribución equitativa y tiempos de respuesta.

## 11. Panel y reportes
- [x] Crear endpoint `/crm/whatsapp/asignaciones` que consuma la vista y respete `X-Organizacion-Id`.
- [x] Mostrar el historial de asignaciones en el panel (`/crm/whatsapp/asignaciones`) con tabla y manejo de errores.
- [ ] Agregar filtros/búsqueda en la vista (por vendedor, fecha, trigger) o exportación CSV.

## 12. Plan para reinicios con nueva oportunidad
**Idea general:** cuando un contacto existente vuelve después de un periodo largo o abre un tema distinto, queremos iniciar un “ciclo” nuevo: se registra otra conversación, se genera una oportunidad fresca conservando el estado de la anterior y se notifica al mismo vendedor (o se reasigna desde el panel). Esto evita mezclar contextos muy antiguos con conversaciones recientes sin perder el historial previo.

- {x} Definir criterios de reinicio
  - {x} `WHATSAPP_INACTIVITY_MINUTES=30` minutos define el reinicio automático; al llegar un mensaje tras ese umbral se crea una oportunidad hija con `force_new_opportunity_on_restart`.
  - {x} El asistente expone la tool `restart_conversation_cycle` para disparar manualmente un reinicio cuando detecta un cambio de tema antes del SLA.

- {x} Backend: oportunidad y conversación
  - {x} Extender `storage.ensure_conversation_opportunity` y `CRMRepository.ensure_conversation_opportunity` con un flag `force_new_opportunity`.
  - {x} Si se activa el flag (nuevo hilo), crear una oportunidad hija copiando etapa, monto y metadata de la anterior.
  - {x} Mantener `asignado_a_usuario_id` cuando exista; sólo correr round-robin si no hay vendedor previo.
  - {x} Guardar en metadata referencias cruzadas (`parent_opportunity_id`, lista de `conversation_ids`) para trazabilidad.
  - {x} Exponer en el registro de la conversación un indicador (`restart_sequence`) para que el Inbox muestre “Reinicio #N”.

- {x} Notificaciones y auditoría
  - {x} Crear un trigger `restart_conversation` para `_notify_sales_rep`, reutilizando el vendedor previo.
  - {x} Registrar ese trigger en `asignaciones_vendedores_whatsapp` para tener evidencia del nuevo ciclo.

- {x} Prompt y tools
  - {x} Añadir una tool (o argumento) que permita al asistente solicitar la creación de una nueva oportunidad cuando detecte un reinicio real.
  - {x} Actualizar el prompt para indicar que, si ya existe una oportunidad activa y no hay cambio de tema, debe seguir usando la misma.

- {x} Inbox y panel
  - {x} Mostrar visualmente las “continuaciones” en Inbox (badge con link a la oportunidad previa) y numerar los reinicios.
  - {x} Permitir filtrar oportunidades por contacto para ver cada ciclo consecutivo.
  - {x} Alimentar dashboards/informes con conteos de “oportunidades por contacto” y el valor generado por cada reinicio.

- { } QA / validación
  - { } Simular reinicios con y sin datos completos para asegurar que no se duplican contactos.
  - { } Verificar que las notificaciones al vendedor sólo se disparan una vez por reinicio y que el estado de la oportunidad anterior se conserva intacto.
