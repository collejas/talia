# Changelog · Latencia WhatsApp

## 2026-07-13 23:40 UTC

- Síntoma:
  - respuestas del asistente con latencia percibida mayor a `20s`, con un caso real observado arriba de `27s`.

- Evidencia revisada:
  - logs de `whatsapp.turn_timing`,
  - logs locales del canal en `logs/whatsapp.log`,
  - trazas de Supabase,
  - revisión de `handle_incoming_message`, `register_whatsapp_message`, `ensure_persona_conversation_opportunity` y webhook `Meta`.

- Hallazgos confirmados:
  - el cuello inicial histórico estaba muy concentrado en `ensure_opportunity_ms`,
  - en un caso real reciente la latencia fue multicausal y no solo de CRM,
  - se observó un turno de `32023.59 ms` con desglose aproximado:
    - `register_inbound_ms`: `6394 ms`,
    - `burst_merge_ms`: `1291 ms`,
    - `ensure_opportunity_ms`: `3403 ms`,
    - `read_indicator_ms`: `1410 ms`,
    - `typing_indicator_ms`: `1410 ms`,
    - `assistant_generation_ms`: `11060 ms`,
    - `twilio/meta send`: `705 ms`.
  - el webhook `Meta` procesa en línea y no en background,
  - la conversación lenta ya tenía `opportunity_id` persistido en `inbox_context`, así que el problema actual no quedó resuelto solo con cache de oportunidad.

- Cambios realizados en backend:
  - reutilización de `opportunity_id` desde `conversaciones.inbox_context` cuando ya existe,
  - persistencia de `opportunity_id` y `restart_sequence` en conversación,
  - paralelización de `read` y `typing`,
  - reducción parcial de recargas de runtime settings.

- Resultado observado tras esos cambios:
  - mejoró el costo de mensajes repetidos en algunos escenarios,
  - pero no resolvió el caso frío / real de mayor latencia.

- Riesgos abiertos:
  - `Meta webhook` sigue síncrono,
  - `read/typing` siguen bloqueando la ruta crítica,
  - `_send_whatsapp_read_indicator` todavía conserva `force_refresh=True`,
  - `register_inbound_ms` y `assistant_generation_ms` siguen siendo demasiado altos para la meta.

- Siguientes pasos propuestos:
  - mover procesamiento de `Meta webhook` a background,
  - sacar `read/typing` del camino crítico,
  - revisar si el debounce de `1.2s` debe bajar o volverse condicional,
  - perfilar y reducir `register_whatsapp_message`,
  - perfilar `fetch_persona_context` y el camino real de `assistant_generation_ms`,
  - medir nuevamente con evidencia real después de cada ajuste.
