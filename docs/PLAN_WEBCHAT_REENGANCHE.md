# Plan de asignación y reenganche para Webchat

Checklist para replicar el flujo de vendedores y reenganches en el canal webchat respetando las reglas solicitadas: asignar sólo cuando exista contacto verificable, reenganchar mientras faltan datos críticos y omitir cualquier intento si la sesión fue cerrada.

## 1. Información base y dependencias
- [ ] Confirmar campos necesarios en `webchat_sessions`, `conversaciones`, `oportunidades` y `webchat_session_closures` para detectar señales de cierre explícito.
- [x] Documentar qué metadata produce el asistente webchat cuando captura `telefono`, `correo`, `nombre_empresa`, `necesidad` (insight) y cuando envía correo/agrega booking.
- [x] Verificar que `storage.ensure_conversation_opportunity` y `CRMRepository.ensure_conversation_opportunity` soporten canal `webchat` con los nuevos flags.
- [x] Definir los settings requeridos (`WEBCHAT_ASSIGN_ON_CONTACT`, `WEBCHAT_REENGAGE_MINUTES`, `WEBCHAT_REENGAGE_MAX_ATTEMPTS`, etc.).

## 2. Asignación condicionada a datos de contacto
- [ ] Agregar un gate en el webhook/service webchat para evaluar si ya tenemos al menos uno de `telefono` o `correo`.
- [ ] Hasta que no exista un dato de contacto, no llamar a `ensure_conversation_opportunity` con `force_sales_assignment`.
- [ ] Cuando se cumpla el requisito, crear/actualizar la conversación y disparar la selección del vendedor (reusar round-robin existente).
- [ ] Guardar en metadata el momento en que la conversación cumplió “contact-ready” para auditoría.
- [ ] Manejar reintentos: si se pierde el vendedor asignado por reinicio manual, volver a evaluarlo con la misma regla.

## 3. Detección de estados “datos completos”
- [x] Definir un helper que valide que existen los cuatro datos obligatorios (`telefono`, `correo`, `nombre_empresa`, `necesidad`).
- [x] Marcar en metadata (`webchat_followup.datos_completos_at`) la primera vez que el helper retorna verdadero.
- [x] Marcar también `webchat_followup.entrega_realizada_at` cuando se envíe correo con información o se genere una cita (hook en tools `send_information_email` / `schedule_demo`).
- [x] Publicar eventos estructurados (`webchat.followup.data_complete`, `webchat.followup.delivery_sent`) para monitoreo.

## 4. Motor de reenganche webchat
- [x] Crear un job similar a `whatsapp_followups` pero filtrando conversaciones de canal webchat con último mensaje saliente sin respuesta dentro del SLA.
- [x] El job debe ignorar conversaciones con `webchat_followup.datos_completos_at` o `webchat_followup.entrega_realizada_at`.
- [x] Verificar en `webchat_session_closures` si la sesión correspondiente fue cerrada; si existe un registro posterior al último mensaje, no reenganchar.
- [x] Limitar los intentos (`attempts < WEBCHAT_REENGAGE_MAX_ATTEMPTS`) y guardar `sent_at`/`attempts` en metadata.
- [x] Cada mensaje debe enviarse usando el mismo pipeline del canal webchat (no WhatsApp) respetando `session_id` y contexto.

## 5. Notificación/escalación a vendedor
- [ ] Cuando un reenganche alcanza el máximo sin respuesta, enviar notificación al vendedor asignado con resumen de la conversación.
- [ ] Reusar plantillas del CRM (correo, Slack o WhatsApp interno) pero etiquetadas como `webchat`.
- [ ] Registrar la alerta en `asignaciones_ventas` o una tabla análoga para webchat (`asignaciones_vendedores_webchat` si hace falta).
- [ ] Evitar alertas si la sesión se cerró o si el prospecto ya tiene datos completos + entrega.

## 6. Integraciones con el asistente de webchat
- [ ] Actualizar prompts/tools para priorizar la captura de contacto y marcar explícitamente cuando se obtiene cada dato.
- [ ] Añadir tool `mark_contact_ready` que permita al asistente disparar manualmente la asignación si detecta un escenario especial.
- [x] Ajustar tool `close_lead` para que, en webchat, setee la bandera `datos_completos`.
- [ ] Documentar en `docs/canales/webchat.md` los nuevos eventos y metadata.

## 7. Métricas y monitoreo
- [ ] Crear vistas/consultas (`panel_webchat_followups`) que muestren intentos, conversiones y tiempos de respuesta.
- [ ] Añadir logs estructurados (`webchat.reengage_triggered`, `webchat.reengage_skipped_closed_session`, etc.).
- [ ] Configurar alertas si el job falla o si el porcentaje de leads sin datos completos supera un umbral.

## 8. QA y despliegue
- [x] Tests unitarios para el helper de datos completos, el gate de asignación y el motor de reenganche.
- [ ] Scenarios E2E:
  - [ ] Prospecto sin contacto → no hay vendedor asignado → captura correo → se asigna → reenganche se desactiva al completar datos.
  - [ ] Prospecto cierra el webchat → job respeta el cierre y no envía mensajes.
  - [ ] Prospecto recibe correo/cita → no más reenganches ni alertas.
- [ ] Revisar migraciones necesarias (nueva tabla/vista, columnas metadata).
- [ ] Desplegar job y monitorear durante la primera semana.
