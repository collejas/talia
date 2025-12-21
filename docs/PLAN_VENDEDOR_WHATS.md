# Plan de asignación y seguimiento de vendedores para WhatsApp

Checklist para implementar el flujo de asignación automática de vendedores, notificaciones y reenganche. Cada paso incluye [ ] para marcar avance.

## 1. Información base
- [ ] Mapear los campos existentes en `empleados`, `usuarios`, `oportunidades` y `conversaciones` que usaremos (es_vendedor, telefono, asignado_a_usuario_id, metadata).
- [ ] Confirmar los estados/etapas del CRM que representan “demo agendada” y “info enviada”.
- [ ] Definir el SLA de inactividad (ej. 30 min sin respuesta) para disparar reenganche/notificación tardía.

## 2. Asignación round-robin desde el primer mensaje
- [ ] Crear en `CRMRepository` un método `get_next_sales_rep(organizacion_id)` que:
  - [ ] Filtre `empleados` con `es_vendedor = true` para la organización.
  - [ ] Ordene por `coalesce(ultimo_lead_asignado_en, '1970…')` y `usuario_id`.
  - [ ] Use `FOR UPDATE SKIP LOCKED` para evitar conflictos.
- [ ] Actualizar `storage.ensure_conversation_opportunity` / `CRMRepository.ensure_conversation_opportunity` para:
  - [ ] Detectar si la oportunidad nueva carece de `asignado_a_usuario_id`.
  - [ ] Invocar `get_next_sales_rep` y asignar el `usuario_id` resultante.
  - [ ] Actualizar `empleados.ultimo_lead_asignado_en = now()` tras la asignación.
- [ ] Guardar el `usuario_id` asignado en la conversación/contacto (metadata o campo dedicado) para consultas rápidas.

## 3. Persistencia y auditoría de asignaciones
- [ ] (Opcional) Crear tabla `asignaciones_ventas` con `conversation_id`, `oportunidad_id`, `usuario_id`, `asignado_en`.
- [ ] Registrar cada asignación (aunque se repita el mismo vendedor) para auditoría y métricas.

## 4. Notificación cuando el bot completa calificación
- [ ] Identificar el hook exacto:
  - [ ] Tool `close_lead` cuando se obtienen nombre/correo/teléfono/empresa.
  - [ ] Tool adicional “schedule_demo” o estado “demo_agendada”.
- [ ] Construir helper `notify_sales_rep(conversation_id, payload)` que:
  - [ ] Resuelva el vendedor asignado y su contacto (`usuarios.telefono_e164` o identidad WhatsApp).
  - [ ] Arme el mensaje con datos del prospecto (nombre, empresa, necesidad, fecha demo/info enviada).
  - [ ] Envíe el WhatsApp usando `whatsapp.service.send_manual_message`.
  - [ ] Registre el envío en `storage.register_whatsapp_message`.
- [ ] Integrar la llamada al helper en el hook elegido (tool o cambio de etapa).

## 5. Reenganche automático del bot
- [ ] Definir regla: si no hay respuesta del cliente X minutos después del último mensaje del bot.
- [ ] Crear job (cron/worker) que:
  - [ ] Busque conversaciones WhatsApp con último mensaje saliente del bot y sin respuesta en el SLA.
  - [ ] Envíe un mensaje “¿Seguimos en contacto?” vía `whatsapp_service`.
  - [ ] Marque en metadatos cuántos intentos de reenganche se hicieron para evitar spam.
- [ ] Si tras N intentos sigue sin respuesta, disparar notificación al vendedor (ver siguiente sección).

## 6. Notificación al vendedor por inactividad
- [ ] Reusar el job anterior para detectar conversaciones “sin respuesta” más largas (ej. 2 horas).
- [ ] Enviar mensaje al vendedor asignado con resumen del lead y advertencia de inactividad.
- [ ] Registrar estas alertas (tabla o metadata) para no repetirlas innecesariamente.

## 7. Mensajería y plantillas
- [ ] Diseñar copy para:
  - [ ] Notificación de lead calificado (“Hola [Nombre], Tal-IA obtuvo estos datos…”).
  - [ ] Alerta por inactividad (“El prospecto [Nombre] no respondió en X min…”).
  - [ ] Mensaje de reenganche del bot (“¿Seguimos? Tengo ejemplos listos.”).
- [ ] Validar que Twilio permita enviar esos mensajes (evitar plantillas restringidas).

## 8. Configuración y parámetros
- [ ] Exponer en settings/env:
  - [ ] SLA de reenganche (`WHATSAPP_REENGAGE_MINUTES`).
  - [ ] SLA de alerta al vendedor (`WHATSAPP_ESCALATE_MINUTES`).
  - [ ] Número de reenganches antes de alertar.
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
