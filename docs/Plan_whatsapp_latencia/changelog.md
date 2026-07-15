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

## 2026-07-15 00:00 UTC

- Revisión de logs vía MCP Supabase:
  - el error dominante en Postgres no es un abanico de fallas distintas;
  - el patrón más repetido es `null value in column "codigo_contacto" of relation "contactos" violates not-null constraint`.

- Diagnóstico confirmado:
  - la RPC `public.registrar_mensaje_webchat(...)` sigue insertando en `public.contactos`,
  - `public.contactos.codigo_contacto` es `NOT NULL` y no tiene `default`,
  - además actualmente no existe trigger activo sobre `public.contactos` que genere ese código en automático,
  - por eso cualquier alta implícita desde webchat/followup rompe y vuelve a ensuciar los logs.

- Hallazgo estructural:
  - el generador activo `public.gen_codigo_contacto(uuid)` hoy opera sobre `public.personas` y produce códigos tipo `Cont-*`,
  - esto indica desalineación entre la RPC heredada de `webchat` y el modelo nuevo de contactos/personas.

- Lectura operativa:
  - parte del ruido reciente viene de `webchat.followup.reengage_send_failed`,
  - no apunta al fast-path de WhatsApp,
  - apunta a un flujo heredado de webchat que sigue intentando persistir con el esquema viejo.

- Riesgo secundario observado:
  - también aparecieron algunos `canceling statement due to statement timeout`,
  - pero en mucho menor volumen que el error de `codigo_contacto`.

## 2026-07-15 15:20 UTC

- Revisión de continuidad:
  - el error `null value in column "codigo_contacto"` dejó visible una segunda validación real del esquema,
  - el nuevo patrón dominante pasó a `contactos_codigo_contacto_formato_chk`.

- Diagnóstico final:
  - `public.contactos` en producción no tenía triggers activos,
  - `codigo_contacto` además exige patrón `Con[0-9]+`,
  - cualquier código ad hoc fuera de ese patrón iba a seguir fallando.

- Corrección definida:
  - blindar `public.contactos` con un trigger que use `public.gen_codigo_contacto(organizacion_id)`,
  - dejar el backend sin inventar `codigo_contacto` y delegar el consecutivo al generador oficial de Supabase.

- Artefactos ajustados:
  - `supabase/migrations/20260715_030000_contactos_legacy_autocode_guard.sql`,
  - `backend/app/repositories/crm.py`,
  - `backend/tests/repositories/test_crm_sales_assignment.py`.

## 2026-07-15 15:26 UTC

- Hallazgo de fondo en `webchat`:
  - los `9` renglones visibles en Inbox no eran conversaciones humanas nuevas,
  - eran reenganches automáticos montados sobre `personas` históricas,
  - el runner estaba aceptando conversaciones `webchat` abiertas/pendientes aunque su actividad humana real fuera vieja o inexistente.

- Causa confirmada:
  - `webchat_followups` tomaba cualquier conversación con `ultimo_saliente_en` vencido,
  - si la `persona` aún conservaba `session_id`, enviaba un nuevo followup,
  - ese envío podía abrir una conversación nueva por inactividad aun cuando el visitante original llevaba meses sin interactuar.

- Corrección aplicada:
  - se bloqueó el reenganche cuando la conversación no tiene `ultimo_entrante_en`,
  - se bloqueó el reenganche cuando la última entrada humana ya está fuera de la ventana útil del flujo,
  - ambos casos ahora marcan `stop_reason` y salen del circuito automático.

- Validación:
  - `poetry run pytest tests/services/test_webchat_followups.py -q`
  - resultado: `7 passed`
  - tras reiniciar `talia-api.service`, el worker empezó a registrar `webchat.followup.skipped_stale_human_inbound` en lugar de seguir enviando followups a sesiones históricas.

- Siguiente foco recomendado:
  - corregir `registrar_mensaje_webchat` para alinearlo al modelo vigente,
  - o, si el flujo correcto ya no debe crear en `contactos`, redirigirlo completamente a `personas` / flujo actual.

## 2026-07-15 14:37 UTC

- Correccion aplicada en runtime:
  - se alineo `registrar_mensaje_webchat` para operar con `personas`,
  - la RPC ahora devuelve `persona_id` y `organizacion_id`,
  - el mapper Python del backend ya consume esos campos nuevos.

- Validacion local:
  - `poetry run pytest tests/services/test_storage_channels.py tests/services/test_webchat_followups.py -q`
  - resultado: `10 passed`

- Operacion:
  - se aplico la migracion en Supabase,
  - se reinicio `talia-api.service`,
  - `GET http://127.0.0.1:8004/api/health` regreso `{\"status\":\"ok\"}`.

- Hallazgo posterior:
  - el error de `codigo_contacto` dejo de ser el dominante,
  - el siguiente bloqueo visible paso a ser `telefono_movil_1_required`,
  - esto confirma que el flujo ya no esta chocando contra `public.contactos`, pero todavia hay un trigger de `personas` que no permite altas incompletas originadas por `webchat`.

- Siguiente ajuste en curso:
  - dejar exenta la alta de `personas` con origen `webchat_runtime` del trigger `tg_personas_require_contact_methods`,
  - mantener la validacion estricta para altas normales fuera del canal webchat.
- 2026-07-15 15:39 UTC
  - se resolvieron los dos errores backend que seguian apareciendo en runtime:
    `column etapas_pipeline.tablero_id does not exist` y
    `new row for relation "contactos" violates check constraint "contactos_codigo_contacto_formato_chk"`.
  - en `backend/app/repositories/crm.py` se quitó el `select` directo de
    `tablero_id, tablero_slug, tablero_nombre` sobre `etapas_pipeline` dentro
    de `_get_first_stage_row(...)`;
    ese flujo ya se soporta leyendo `metadata`, y la columna física `tablero_id`
    ya no existe en la tabla viva.
  - se creó la migración
    `supabase/migrations/20260715_040000_contactos_legacy_generator_split.sql`
    y se aplicó en Supabase como `contactos_legacy_generator_split`.
  - causa raíz confirmada:
    el trigger `tg_contactos_codigo_legacy_guard()` sí corría,
    pero llamaba a `public.gen_codigo_contacto(...)`,
    función que hoy fue redefinida para `personas` y genera códigos `Cont-*`;
    `public.contactos` exige `ConN`, por eso el insert de legado fallaba.
  - corrección aplicada:
    se separó `public.gen_codigo_contacto_legacy(uuid)` para `contactos`,
    generando consecutivos `ConN` por organización,
    y el trigger legacy ahora usa esa función dedicada.
  - validación:
    `poetry run pytest tests/repositories/test_crm_sales_assignment.py tests/services/test_webchat_followups.py -q`
    pasó con `14 passed`.
  - validación runtime:
    después del reinicio de `talia-api.service`,
    `/api/health` respondió `{"status":"ok"}` y el worker `webchat-followups`
    volvió a ejecutar el barrido;
    en `journalctl` ya se observan skips por `stale_human_inbound`
    para conversaciones viejas y no reaparecieron en ese tramo
    ni el error de `contactos_codigo_contacto_formato_chk`
    ni `etapas_pipeline.tablero_id does not exist`.
- 2026-07-15 16:12 UTC
  - Se corrigio un nuevo `300 Multiple Choices` en Supabase para `rpc/prospeccion_latest_envios_by_phones`.
  - Causa: coexistian dos firmas RPC (`text[], text` y `text[], text, uuid`) y algunas vistas del panel llamaban sin `organizacion_id`, dejando la resolucion ambigua.
  - Ajuste aplicado:
    - `backend/app/repositories/crm.py`: la RPC ahora siempre manda `p_organizacion_id`, aunque venga `None`, para forzar la firma de 3 argumentos.
    - `backend/app/api/routes/crm.py`: las vistas que ya conocen `organizacion_id` ahora lo propagan explicitamente en la llamada al repositorio.
  - Objetivo: eliminar el `300` en vistas de prospeccion/inbox y mantener aislamiento tenant-aware en los lookups por telefono.
- 2026-07-15 16:23 UTC
  - Se retomo el plan de latencia en el camino critico de `register_inbound_ms`.
  - Hallazgo confirmado:
    - `storage.register_whatsapp_message(...)` hacia trabajo previo que la RPC `registrar_mensaje_whatsapp(...)` ya resuelve sola:
      lookup de persona por `wa_id` / telefono,
      busqueda de ultima conversacion WhatsApp,
      y un `PATCH` extra para volver a marcar `canal='whatsapp'`.
  - Impacto esperado:
    - menos roundtrips a Supabase antes del primer reply,
    - menos costo fijo en mensajes entrantes cortos,
    - menor variabilidad en `register_inbound_ms`.
  - Ajuste aplicado:
    - `backend/app/services/storage.py`: se elimino la preresolucion duplicada en Python y el `update_conversation(..., {"canal": "whatsapp"})` redundante.
    - la RPC queda como fuente unica para resolver persona, conversacion e insercion del mensaje.
  - Validacion local:
    - `poetry run pytest tests/services/test_storage_channels.py tests/channels/test_whatsapp_service.py tests/channels/test_whatsapp_webhook.py -q`
    - resultado: `31 passed`
- 2026-07-15 16:48 UTC
  - Se ajusto el debounce de burst en WhatsApp para reducir `burst_merge_ms` en mensajes aislados.
  - Hallazgo confirmado:
    - la heuristica anterior esperaba `1.2s` para casi cualquier texto corto sin puntuacion,
    - eso estaba agregando costo fijo incluso en mensajes completos que no eran rafagas reales.
  - Ajuste aplicado:
    - `backend/app/channels/whatsapp/service.py`
    - ahora el debounce es adaptativo:
      - `0s` para saludos simples o mensajes con puntuacion,
      - `0.35s` para mensajes cortos completos,
      - `1.2s` solo para fragmentos mas claramente incompletos, por ejemplo cuando terminan en conectores como `pero`, `y`, `que`, `para`.
  - Validacion local:
    - `poetry run pytest tests/channels/test_whatsapp_service.py tests/channels/test_whatsapp_webhook.py -q`
    - resultado: `30 passed`
  - Objetivo:
    - bajar el costo fijo de `burst_merge_ms` sin perder la capacidad de agrupar fragmentos reales.
