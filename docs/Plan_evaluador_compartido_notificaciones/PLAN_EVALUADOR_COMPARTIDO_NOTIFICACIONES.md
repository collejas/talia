# Plan: Evaluador Compartido de Elegibilidad de Notificaciones a Vendedores

## Objetivo
Unificar en una sola capa de reglas la decisión de si una notificación comercial al vendedor debe enviarse o bloquearse, para que WhatsApp y Webchat apliquen exactamente el mismo contrato de negocio por trigger.

## Problema Actual
- La lógica de elegibilidad está duplicada en:
  - `backend/app/channels/whatsapp/tools.py`
  - `backend/app/channels/webchat/notifications.py`
- Existen diferencias de criterio por canal (ej. `case_a`), lo que produce decisiones distintas para leads equivalentes.
- Esto complica auditoría, mantenimiento y pruebas.

## Alcance
- Incluir en un evaluador compartido la lógica de elegibilidad para triggers comerciales:
  - `booking_confirmed`
  - `followup_escalate`
  - `webchat_escalate`
  - `webchat_session_closed`
  - `booking_canceled` (solo validaciones mínimas, no gating de perfil)
  - `restart_conversation` (idempotencia + presencia de vendedor)
- Mantener fuera del evaluador:
  - Transporte de envío (Twilio, templates, cuerpo de mensaje)
  - Persistencia final de metadata/auditoría (se mantiene en cada canal)
  - Lógica de timers/reenganches (se mantiene en `*_followups.py`)

## Propuesta Técnica
Crear módulo nuevo:

- `backend/app/services/sales_notification_rules.py`

### API propuesta
```python
@dataclass
class EligibilityResult:
    allowed: bool
    code: str
    reason: str | None = None
    missing_fields: list[str] | None = None
    primary_reason: str | None = None
    should_mark_primary: bool = False

async def evaluate_sales_notification_eligibility(
    *,
    trigger: str,
    channel: str,
    contact: Mapping[str, Any] | None,
    opportunity_metadata: Mapping[str, Any],
    notifications: Mapping[str, Any],
    primary_by_channel: Mapping[str, Any],
    repo: CRMRepository,
    organizacion_id: UUID,
    force_retry: bool = False,
    is_prospeccion: bool = False,
    runtime_settings: Any | None = None,
) -> EligibilityResult: ...
```

## Contrato Unificado (propuesto)
### 1) `booking_confirmed` (case A)
- Requiere contacto mínimo:
  - `correo` o `telefono_e164/telefono`
- Requiere contexto:
  - `notes` o `necesidad_proposito`
- Requiere perfil mínimo (si profiling está activo):
  - campos críticos completos (`critical_fields` o preguntas `required_for_case_a`)
- Excepción controlada:
  - `is_prospeccion=True`: permitir ruta de negocio actual (`case_a_booking_prospeccion`) sin romper operación existente.

### 2) `followup_escalate` / `webchat_escalate` (case B)
- Requiere contacto mínimo.
- Requiere condición de agotamiento de reenganche según canal:
  - WhatsApp: metadata `whatsapp_followup`
  - Webchat: `contacto_datos.webchat_followup`

### 3) `webchat_session_closed` (case C)
- Requiere contacto mínimo.
- Bloquear si ya existe notificación `booking_confirmed`.

### 4) Idempotencia
- Si `notifications[trigger]` ya existe y `force_retry=False`, bloquear.
- Si `primary_reason` aplica y ya existe `sales_primary_notifications[channel]` y `force_retry=False`, bloquear.

## Cambios de Integración
### WhatsApp
- Reemplazar bloque condicional actual de elegibilidad en:
  - `backend/app/channels/whatsapp/tools.py` (`_notify_sales_rep`)
- Conservar:
  - armado de template/body
  - `send_manual_message`
  - persistencia de metadata y auditoría `notify_<trigger>`

### Webchat
- Reemplazar bloque condicional actual en:
  - `backend/app/channels/webchat/notifications.py` (`notify_sales_rep`)
- Conservar el resto del flujo (envío, metadata, auditoría).

## Compatibilidad y Riesgos
- Riesgo principal: cambio de comportamiento en casos limítrofes donde antes un canal notificaba y el otro no.
- Mitigación:
  - feature flag por tenant/canal:
    - `sales_notification_rules_unified_enabled` (default `false`)
  - rollout gradual:
    1. shadow mode (solo log de decisión nueva)
    2. compare mode (log old vs new)
    3. enforce mode

## Observabilidad
Agregar evento estructurado:
- `sales.notify.eligibility_evaluated`
  - `trigger`
  - `channel`
  - `allowed`
  - `code`
  - `reason`
  - `primary_reason`
  - `force_retry`
  - `organizacion_id`
  - `conversation_id`
  - `contact_id`
  - `opportunity_id`

## Plan de Implementación
1. Crear `sales_notification_rules.py` con helpers puros y evaluación async.
2. Cubrir el evaluador con tests unitarios parametrizados por canal/trigger.
3. Integrar evaluador en `whatsapp/tools.py`.
4. Integrar evaluador en `webchat/notifications.py`.
5. Agregar logs comparativos (shadow mode).
6. Activar flag por tenant piloto.
7. Monitorear métricas de entrega/ack/reintento por 7 días.
8. Activar globalmente.

## Plan de Pruebas
- Unit tests del evaluador:
  - `case_a` con/sin contacto, con/sin contexto, con/sin perfil
  - `case_b` con/sin agotamiento
  - idempotencia por `sales_notifications` y primary
  - `force_retry=True`
  - `is_prospeccion=True`
- Integración:
  - WhatsApp `_notify_sales_rep` usa evaluador y mantiene envío/auditoría.
  - Webchat `notify_sales_rep` usa evaluador y mantiene envío/auditoría.
- Regresión:
  - tests existentes de followups y ack deben seguir pasando.

## Criterios de Aceptación
- Mismo payload funcional en WhatsApp y Webchat produce misma decisión de elegibilidad para un trigger equivalente.
- No hay duplicados de primarias por canal.
- No se rompe:
  - reenganches
  - ack de vendedor
  - retry de notificaciones fallidas
  - auditoría en `asignaciones_vendedores`.

## Resultado Esperado
- Regla única y auditable.
- Menor drift entre canales.
- Menor costo de mantenimiento y menor riesgo de regresiones en notificaciones comerciales.
