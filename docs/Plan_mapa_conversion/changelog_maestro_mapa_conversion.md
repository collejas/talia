# Changelog maestro · Mapa de conversion

Fecha: 2026-07-01
Ruta: `docs/Plan_mapa_conversion/changelog_maestro_mapa_conversion.md`

## Regla de uso

Este es el unico changelog operativo de la carpeta.

Todos los demas cambios historicos o explicativos deben reflejarse aqui cuando afecten:

- datos,
- backend,
- frontend,
- o contratos de integracion.

## 2026-07-01

- Se detecto que `prospeccion/metricas` no estaba mostrando campañas WhatsApp como bloque independiente.
- Se confirmo que las campañas WhatsApp reales existen en `prospeccion_contacto_batch`, `mensajes`, `conversaciones` y `oportunidades`.
- Se confirmo que `prospeccion_contacto_envio` sigue concentrando principalmente correo.
- Se documentaron los nuevos hallazgos en `plan_metrica_campanas_whatsapp_y_mapa_conversion.md`.
- Se documentó la ruta maestra de integración en `plan_integracion_maestra_mapa_conversion.md`.
- Se definio un backlog unico para ejecutar BD -> backend -> frontend.
- Se establecio este changelog como fuente unica de seguimiento.
- Se aterrizo el backlog maestro con tareas concretas por capa y archivos objetivo.
- Se creó y aplicó la RPC `public.prospeccion_campana_whatsapp_metricas_rango` para resumir campañas WhatsApp por organización.
- La RPC separa mensajes salientes, mensajes entrantes, conversaciones respondidas, oportunidades y lotes.
- La RPC usa `mensajes` + `prospeccion_contacto_batch` + `campanas` como fuente operativa, y deja `prospeccion_contacto_envio` fuera del cálculo de WhatsApp.
- La atribución de respuestas entrantes se corrigió por conversación, para no perder replies sin `batch_id`.
- En el tenant validado la RPC devuelve 24 lotes, 61 prospectos, 194 mensajes salientes, 10 entrantes, 61 conversaciones, 10 respondidas y 60 oportunidades.

## 2026-07-02

- Se documento el hallazgo tecnico completo de WhatsApp de prospeccion en `informe_metricas_whatsapp_prospeccion.md`.
- Se dejo explicito que `source = 'prospeccion'` no basta para separar WhatsApp de correo.
- Se formalizo que la llave de entrega correcta es `eventos_entrega.mensaje_id = mensajes.id`.
- Se alineo la carpeta para que `prospeccion/metricas`, `mapa-de-conversion` y `prospeccion/campanas` se documenten contra la misma verdad operativa.
- Se documento que las migraciones de personas/contactos se conservan y que las migraciones WhatsApp de julio 2026 deben ser sustituidas por una v2.
- Se dejo anotado que la nueva version debe leer desde `conversaciones.inbox_context` y no depender solo de `mensajes.datos`.
- Se creó la migración v2 `20260702_090000_prospeccion_campana_whatsapp_metricas_rango_inbox_context_v2.sql` para reemplazar la lectura basada solo en mensajes.
- Se corrigio el callback de estado de Twilio para WhatsApp: ahora el tenant se resuelve usando el numero emisor en callbacks de estado y no el numero destinatario, evitando el error `twilio_token_missing`.
- Se validó que el registro de estado de WhatsApp ya persiste eventos `enviado`, `fallido`, `entregado` o `leido` sin romper el webhook de `/api/whatsapp/status`.
- Se dejo documentado que la vista `prospeccion/metricas` debe mostrar bloques separados para correo, WhatsApp de prospeccion, frases WhatsApp y conversion/opportunities, en lugar de mezclar o vaciar el bloque de WhatsApp.
- Se ajustó la vista `prospeccion/metricas` para que los 5 KPIs superiores queden en una sola fila en desktop.
- Se restauró el gráfico `Resumen por canal de campañas` para que vuelva a incluir WhatsApp en la vista global `todos`.
- Se alineó el gráfico global para que WhatsApp se derive de `campanas_whatsapp` cuando no exista en el resumen principal de campañas.
- Se corrigió la RPC `public.prospeccion_campana_whatsapp_metricas_rango` para contar salientes de WhatsApp como histórico en `mensajes` + delta persistido en `prospeccion_contacto_envio`, evitando subconteo de campañas ya ejecutadas.
- Se validó en el tenant `00000000-0000-0000-0000-000000000001` que la campaña WhatsApp principal pasa de `205` a `206` mensajes salientes al considerar el envío nuevo aún no reflejado en `mensajes`.
- Se formalizo la frontera operativa entre vistas:
  - `prospeccion/metricas` mide ejecucion de campañas.
  - `mapa-de-conversion` mide adquisicion, atribucion y conversion.
  - `prospeccion/campanas` define plantillas y reglas.
  - `prospeccion/prospectos` ejecuta envios y seguimiento.
- Se documentó que `prospectos_total` es destinatarios incluidos en lotes, no mensajes enviados.
- Se documentó que `batches_total` es numero de lotes ejecutados y no equivale a envios totales.

## 2026-06-27

- Se corrigió la sección `WhatsApp por canal`, que estaba vacía porque no se persistían eventos de atribución.
- Se ajustó el servicio de WhatsApp para permitir la persistencia de coincidencias válidas sin bloquearlas por historial de mensajes.
- Se hizo backfill histórico para el tenant `00000000-0000-0000-0000-000000000001`.
- Se crearon contactos mínimos válidos para resolver la FK requerida por `prospeccion_whatsapp_atribucion_eventos`.
- Se limpió la caché `demografia_v2` para forzar reconstrucción del resumen.
- Se confirmó que el tooltip del mapa ya muestra datos correctos de WhatsApp tras el refactor de contactos/personas.
- Se corrigió la tabla de conversaciones, que ya vuelve a mostrar registros.
- Se documentó el plan de latencia en `plan_latencia_mapa_conversion.md`.
- Se documentó la lectura multicanal del mapa en `plan_mapa_conversion_multicanal.md`.
- Se alinearon los documentos de mapa para separar:
  - arquitectura y datos,
  - performance,
  - experiencia multicanal.

## 2026-03-03

- Se inició el plan maestro para el `Mapa de Conversión` integral.
- Se definió el objetivo de unir tráfico web, webchat, WhatsApp, voz y prospección en una sola vista de análisis.
- Se documentó la base técnica para `web_sessions` y el agregado geográfico v2.
- Se dejó el camino para evolucionar la vista hacia un modelo de atribución más claro y escalable.
