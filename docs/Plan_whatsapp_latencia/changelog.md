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

## 2026-07-13 23:55 UTC

- Acción ejecutada:
  - primer paquete de reducción de latencia en el camino crítico del canal.

- Cambios aplicados:
  - `Meta webhook` pasó de procesamiento síncrono a `BackgroundTasks`,
  - `read` y `typing` dejaron de bloquear el flujo principal y ahora se disparan en background,
  - se eliminó un `force_refresh=True` remanente en `read_indicator`,
  - el debounce de burst dejó de esperar para mensajes demasiado cortos de una sola palabra.

- Intención de este paquete:
  - bajar latencia total percibida sin cambiar la respuesta funcional del asistente,
  - evitar que el webhook Meta se quede abierto mientras corre todo el pipeline,
  - quitar tiempo muerto no esencial antes de invocar OpenAI o enviar la respuesta.

- Archivos tocados:
  - `backend/app/channels/whatsapp/router.py`
  - `backend/app/channels/whatsapp/service.py`

- Validación local:
  - `poetry run pytest tests/channels/test_whatsapp_service.py tests/channels/test_whatsapp_webhook.py -q`
  - resultado: `23 passed`

- Resultado esperado en producción:
  - menor latencia visible en mensajes Meta,
  - eliminación del costo de `read_indicator_ms` y `typing_indicator_ms` dentro del camino crítico,
  - menor castigo por debounce cuando el usuario manda un mensaje corto aislado.

- Pendiente inmediato:
  - medir nuevamente `whatsapp.turn_timing` tras deploy,
  - confirmar si el siguiente cuello dominante queda en `register_inbound_ms`, `ensure_opportunity_ms` o `assistant_generation_ms`.

## 2026-07-13 23:56 UTC

- Incidente observado:
  - mensaje enviado por el usuario a las `17:50` del `2026-07-13` sin respuesta visible.

- Evidencia confirmada:
  - el inbound sí entró a las `2026-07-13 23:50:52 UTC`,
  - el backend sí generó y despachó respuesta a las `2026-07-13 23:51:12 UTC`,
  - Meta registró el outbound como `fallido` a las `2026-07-13 23:51:13 UTC` con código `131047`.

- Causa raíz:
  - el `hola` entró por `phone_number_id = 1139218909270276` / `display_phone_number = 5214443891655`,
  - la respuesta salió intentando usar el `phone_number_id` default del tenant `1230608700141056` / `display_phone_number = 5214442222728`,
  - para tenants con más de una línea Meta, el canal estaba respondiendo con la línea equivocada,
  - esto también explica el `read_indicator_not_sent` con `Message ID does not exist`.

- Corrección aplicada:
  - el webhook Meta ya no fuerza el `organizacion_id` del path dentro del procesamiento en background,
  - el flujo guarda en `inbox_context` el `meta_phone_number_id` y el número destino real del inbound,
  - `read_indicator` y el reply Meta ahora usan el `phone_number_id` del mensaje entrante cuando existe.

- Validación local:
  - `poetry run pytest tests/channels/test_whatsapp_service.py tests/channels/test_whatsapp_webhook.py -q`
  - resultado esperado tras ajuste: suite verde.

- Pendiente inmediato:
  - desplegar,
  - reenviar un `hola` al número `5214443891655`,
  - validar en `logs/whatsapp.log` que el reply salga con el mismo `phone_number_id` del inbound y que desaparezca el error `131047`.

## 2026-07-14 00:10 UTC

- Prueba validada:
  - mensaje `hola` enviado a las `2026-07-14 00:09:54 UTC` (`18:09` local del `2026-07-13`),
  - respuesta visible entregada por Meta a las `2026-07-14 00:10:17 UTC`.

- Resultado:
  - la corrección de línea Meta sí funcionó,
  - ya no apareció `131047`,
  - el reply salió y fue marcado como `enviado`, `entregado` y `leido`.

- Latencia real observada:
  - `total_ms`: `25364.83`
  - `reply_dispatched`: `2026-07-14 00:10:15 UTC`
  - tiempo desde inbound recibido hasta dispatch: ~`21.3s`

- Cuellos dominantes del turno:
  - `register_inbound_ms`: `5888.27`
  - `ensure_opportunity_ms`: `3171.74`
  - `assistant_generation_ms`: `8430.11`
  - dentro de assistant:
    - `fetch_persona_context_ms`: `692.97`
    - `tool_loop_retry_ms`: `4896.33`

- Lectura operativa:
  - el problema principal ya no está en `read/typing` ni en la línea Meta equivocada,
  - el mayor costo actual está repartido entre persistencia inicial, oportunidad CRM y generación OpenAI,
  - el prompt activo cambió a `prompt_version = 32` y además hubo `prompt_variables_retry_without_variables`, lo que indica un reintento adicional dentro del tramo de generación.

- Siguiente foco técnico:
  - perfilar y recortar `register_whatsapp_message`,
  - revisar por qué `ensure_persona_conversation_opportunity` sigue creando un costo de ~`3.1s`,
  - eliminar el retry evitable de prompt variables en el flujo de `assistant_generation`.

## 2026-07-14 00:22 UTC

- Paquete aplicado:
  - se eliminó el retry evitable por `location_href` duplicado en `prompt_variables`,
  - se agregaron tareas en background para notificaciones y followups post-registro,
  - se creó un `fast-path` para saludos simples de primera interacción en WhatsApp.

- Comportamiento nuevo del `fast-path`:
  - para mensajes como `hola`, `buen día`, `buenas tardes` y variantes cortas sin adjuntos,
  - si todavía no existe hilo OpenAI previo,
  - el backend responde directo con saludo de `Tal-IA` y el nombre comercial del tenant,
  - y deja `ensure_opportunity`, followup y documento de bienvenida en background después del dispatch.

- Objetivo de este paquete:
  - bajar el primer reply visible al rango de `~7s` cuando el usuario solo manda un saludo simple,
  - evitar gastar CRM, booking y OpenAI para un turno que no lo necesita.

- Validación:
  - `poetry run pytest tests/channels/test_whatsapp_service.py tests/channels/test_whatsapp_webhook.py tests/services/test_storage_channels.py -q`
  - resultado: `31 passed`

- Operación:
  - `talia-api.service` se reinició,
  - healthcheck local validado en `http://127.0.0.1:8004/api/health`.

## 2026-07-14 00:41 UTC

- Hallazgo operativo:
  - el backend quedó en `deactivating` después de reiniciar,
  - `systemd` sí envió `SIGTERM`, pero Uvicorn siguió esperando a que cerraran runners internos,
  - el cierre del lifespan estaba ejecutando los `shutdown()` de cada runner en serie.

- Impacto:
  - aunque cada runner tenga timeout propio de `12s`, el apagado total podía acumular más de `1 min`,
  - durante ese tramo el puerto `8004` quedaba abajo y WhatsApp no respondía.

- Corrección aplicada:
  - el `shutdown` del lifespan ahora corre en paralelo con `asyncio.gather(...)`,
  - se mantiene el timeout individual por runner, pero deja de sumarse uno detrás de otro.

- Archivo tocado:
  - `backend/app/main.py`

- Resultado esperado:
  - reinicios sensiblemente más cortos,
  - menor ventana de caída al desplegar o reiniciar el servicio.
