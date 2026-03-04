# Checklist de Implementación: Evaluador Compartido de Notificaciones

## Objetivo
Implementar un evaluador único de elegibilidad para notificaciones a vendedores y reutilizarlo en WhatsApp y Webchat sin romper reenganches, ack ni auditoría.

## Pasos Técnicos
1. Crear módulo compartido de reglas.
- Archivo: `backend/app/services/sales_notification_rules.py`
- Tareas:
  - Definir `EligibilityResult` (dataclass).
  - Implementar `evaluate_sales_notification_eligibility(...)`.
  - Centralizar helpers comunes (contacto/contexto/perfil/idempotencia/primary).
- Estimación: 3-4 h.

2. Agregar feature flag de rollout.
- Archivo: `backend/app/core/config.py` y/o `tenant_runtime` (según patrón actual).
- Tareas:
  - Introducir `sales_notification_rules_unified_enabled`.
  - Mantener fallback al comportamiento actual cuando esté apagado.
- Estimación: 1-2 h.

3. Integrar evaluador en WhatsApp.
- Archivo: `backend/app/channels/whatsapp/tools.py` (`_notify_sales_rep`).
- Tareas:
  - Sustituir bloque de elegibilidad por llamada al evaluador.
  - Conservar transporte, templates, metadata y auditoría.
  - Mapear `primary_reason` del evaluador a `sales_primary_notifications`.
- Estimación: 2-3 h.

4. Integrar evaluador en Webchat.
- Archivo: `backend/app/channels/webchat/notifications.py` (`notify_sales_rep`).
- Tareas:
  - Sustituir bloque de elegibilidad por llamada al evaluador.
  - Conservar envío y auditoría existentes.
- Estimación: 2-3 h.

5. Estandarizar códigos de decisión.
- Archivo: `backend/app/services/sales_notification_rules.py`.
- Tareas:
  - Definir códigos: `allowed`, `missing_contact`, `missing_context`, `missing_profile`,
    `duplicate_trigger`, `duplicate_primary`, `reengage_not_exhausted`, etc.
- Estimación: 1 h.

6. Instrumentar observabilidad.
- Archivos:
  - `backend/app/channels/whatsapp/tools.py`
  - `backend/app/channels/webchat/notifications.py`
- Tareas:
  - Emitir evento `sales.notify.eligibility_evaluated`.
  - Campos mínimos: `trigger`, `channel`, `allowed`, `code`, `conversation_id`,
    `contact_id`, `opportunity_id`.
- Estimación: 1 h.

7. Implementar tests unitarios del evaluador.
- Archivo nuevo: `backend/tests/services/test_sales_notification_rules.py`.
- Casos:
  - `booking_confirmed` con/sin contacto.
  - `booking_confirmed` con/sin contexto.
  - `booking_confirmed` con/sin perfil mínimo.
  - `followup_escalate` y `webchat_escalate` agotado/no agotado.
  - `webchat_session_closed`.
  - `force_retry=True`.
  - `is_prospeccion=True`.
- Estimación: 3-4 h.

8. Implementar tests de integración por canal.
- Archivos:
  - `backend/tests/channels/test_whatsapp_tools.py`
  - `backend/tests/channels/test_webchat_service_assignment.py` (o nuevo test de notifications).
- Tareas:
  - Verificar que ambos canales usan el evaluador.
  - Confirmar side effects intactos (send, metadata, auditoría).
- Estimación: 2-3 h.

9. Validar compatibilidad con retry y ack.
- Archivo: `backend/app/channels/whatsapp/service.py`.
- Tareas:
  - Verificar `_retry_failed_sales_notification`.
  - Verificar `_maybe_handle_sales_acknowledgement`.
- Estimación: 1-2 h.

10. Rollout gradual.
- Fases:
  - Shadow mode (solo logging de nueva decisión).
  - Tenant piloto.
  - Activación global.
- Estimación: 0.5-1 día (incluye monitoreo).

## Criterios de Cierre
- El evaluador compartido decide de forma consistente para WhatsApp y Webchat.
- No hay regresiones en:
  - reenganches,
  - ack de vendedor,
  - retry de notificaciones fallidas,
  - auditoría en `asignaciones_vendedores`.
- Tests nuevos y existentes en verde.
