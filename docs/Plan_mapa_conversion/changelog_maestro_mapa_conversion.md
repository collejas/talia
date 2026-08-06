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
- Se agregó a `prospeccion/metricas` el desglose de entrega de campañas WhatsApp por mensaje: entregados, leídos, fallidos y sin traza.
- Se extendió la tabla y exportación de `Campañas WhatsApp` para reflejar el nuevo desglose de entrega.
- Se corrigió la regresión del conteo de WhatsApp para volver a sumar el delta operativo persistido y restaurar `206` mensajes salientes en la campaña validada.
- Se corrigió la RPC `public.prospeccion_campana_whatsapp_metricas_rango` para contar salientes de WhatsApp como histórico en `mensajes` + delta persistido en `prospeccion_contacto_envio`, evitando subconteo de campañas ya ejecutadas.
- Se validó en el tenant `00000000-0000-0000-0000-000000000001` que la campaña WhatsApp principal pasa de `205` a `206` mensajes salientes al considerar el envío nuevo aún no reflejado en `mensajes`.
- Se ajustó la documentación del backlog para reflejar el cierre del criterio de conteo híbrido de WhatsApp y dejar abiertos solo los cruces que todavía requieren implementación adicional.
- Se validó que `prospeccion/prospectos` sigue siendo la vista operativa correcta para lotes, envíos y estados por lote, sin reinterpretar ese flujo como métrica de campañas.
- Se formalizo la frontera operativa entre vistas:
  - `prospeccion/metricas` mide ejecucion de campañas.
  - `mapa-de-conversion` mide adquisicion, atribucion y conversion.
  - `prospeccion/campanas` define plantillas y reglas.
  - `prospeccion/prospectos` ejecuta envios y seguimiento.
- Se documentó que `prospectos_total` es destinatarios incluidos en lotes, no mensajes enviados.
- Se documentó que `batches_total` es numero de lotes ejecutados y no equivale a envios totales.
- Se reforzaron las etiquetas y textos de lectura en `mapa-de-conversion` para dejar explicito que WhatsApp ahi representa atribucion y conversacion, no ejecucion de campañas.
- Se normalizó el contrato frontend del mapa para que `whatsapp_atribucion_total` sea el nombre canónico y `whatsapp_atribucion.top` quede tipado en el adaptador de datos.
- Se cerró el contrato backend del mapa v2 para exponer también `whatsapp_atribucion_top` como forma canónica de la atribución WhatsApp en `mapa-v2`.
- Se extrajo el ensamblado del agregado v2 del mapa a `build_map_v2_dataset` para reutilizar la misma estructura en la respuesta principal y en exportaciones.
- Se agregó temporalmente un selector de dimensión en `mapa-de-conversion` para alternar entre `Todo`, `Tráfico web`, `WhatsApp`, `Campañas` y `Conversiones`, y luego se revirtió para volver al layout fijo del plan original.
- Se ajustó la lectura lateral del mapa para volver a mostrar siempre los bloques fijos de lectura: tráfico, conversaciones, atribución y etapas.
- Se expuso en el backend de `prospeccion/metricas` la referencia dominante de plantilla por campaña WhatsApp usando `twilio_content_sid` y los fallbacks disponibles en la atribución por campaña.
- Se alineó también la exportación XLSX de `CampanasWhatsApp` para incluir `template_id`, `template_slug` y `template_nombre` junto con los metadatos operativos de la campaña.
- Se confirmó que la compatibilidad temporal con lecturas antiguas de `mensajes.datos` se conserva mediante fallbacks de `template_id`, `template_slug`, `template_nombre` y `twilio_content_sid`.
- Se revisó la capa de BD de conversacion, oportunidad y atribucion, confirmando que `persona_id` ya es la llave operativa y que los joins críticos tienen índices adecuados.
- Se decidió no materializar una vista extra para el delta de `prospeccion_contacto_envio`; ese ajuste se mantiene absorbido por la RPC y las exportaciones para no duplicar la verdad operativa.
- Se validó que `campanas` ya separa `correo/prospeccion` y `whatsapp/prospeccion`, y que `prospeccion_contacto_batch.canales` conserva el detalle multicanal sin requerir una columna nueva para este plan.
- Se cerró la subfase `A.4` sin crear una migracion nueva: los archivos objetivo vigentes ya son la RPC v2, el ajuste de desglose de entrega, el backend y los consumidores frontend/documentales del contrato.
- Se cerró `A.5` confirmando que no habrá rollback del refactor de personas/contactos y que no hace falta un backfill nuevo para esta fase porque la compatibilidad temporal y el snapshot existente ya sostienen la historia.
- Se cerró `B.1` dejando la respuesta de `prospeccion/metricas` separada en `campanas`, `campanas_whatsapp` y `frases_whatsapp`; las oportunidades quedan dentro del bloque de atribución de frases y no como ledger independiente.

## 2026-07-13

- Se auditó el backlog maestro contra el estado real de backend, frontend y BD para evitar seguir trabajando sobre checklists desactualizados.
- Se confirmó que `B.2` ya está cubierto por implementación:
  - la agregación por batch vive en la RPC operativa de campañas WhatsApp;
  - respuestas y oportunidades se resuelven por conversación;
  - la capa de frases/atribución sigue usando `prospeccion_whatsapp_atribucion_eventos` con `persona_id` como llave principal.
- Se validó con datos reales del tenant `00000000-0000-0000-0000-000000000001` que siguen existiendo campañas y lotes WhatsApp activos para el plan:
  - `2` campañas `whatsapp/prospeccion`;
  - `227` lotes con canal WhatsApp;
  - `62` conversaciones, `205` mensajes salientes históricos, `20` entrantes y `61` oportunidades en el cruce operativo de la campaña principal.
- Se dejó explícito en el backlog que la serie diaria ya está separada por semántica:
  - campañas toma la ejecución diaria desde envíos/lotes/logs;
  - frases WhatsApp toma la atribución diaria desde eventos.
- Se confirmó que `B.3`, `B.4`, `C.2` y `C.3` ya estaban implementados en código, exportaciones y adaptadores, y se actualizó el backlog para reflejarlo.
- Se corrigió `frontend/panel/src/components/dashboard/marketing-lazy-section.tsx` para que el dashboard lazy vuelva a pedir:
  - resumen WhatsApp real en lugar de dejar `campanas_whatsapp` vacío por `include_whatsapp_channels=false`;
  - series reales de campañas/frases en lugar de pedir un payload `lite` que nunca devolvía `timeseries`.

## 2026-08-03

- Se alineó la sección de correo de `mapa-de-conversion` para que las tarjetas y gráficas de campañas usen el universo filtrado de visitas y no el ranking de atribución de campañas.
- La gráfica `Correo · campañas que generaron visitas al sitio` ahora se alimenta del detalle de visitas filtrado por `utm_medium=email`; agrupa por `web_sessions.cid` y usa `utm_campaign` solo como fallback, mientras las plantillas agrupan por `tid`.

## 2026-08-06

- Se inicio una reorganizacion de lectura derivada en `plan_reorganizacion_lectura_mapa.md`: `Resumen`, `Trafico web`, `Conversaciones` y `Mapa y embudo` dejan de presentarse como un recorrido unico mezclado.
- La vista ahora carga las tablas diferidas segun la lectura activa y no muestra simultaneamente detalle de sesiones web y conversaciones.
- Se redefinio la arquitectura objetivo: `Resumen` sera un consolidado de trafico, conversaciones y conversiones; `Trafico web` tendra su propio mapa y listado; `Conversaciones` tendra mapa, canales, conversiones y listado; `Campañas` sustituira a `Mapa y embudo` como lectura de resultados de campañas.
- Se implemento la lectura `Campañas` y se agrego `mapScope` para que el mapa y sus tooltips distingan trafico web, conversaciones y actividad de campaña.
- Se eliminó el refetch duplicado de hasta 5,000 sesiones que `AcquisitionSummary` hacía después de cargar `resumen-v2` y `mapa-v2`; el detalle fila por fila queda diferido en las tablas inferiores.
- Se aclaró la semántica visual de adquisición: una sesión web atribuida a una promoción es una visita, no un contacto, conversación u oportunidad; la tasa correspondiente se presenta como tasa de contacto.
- Se aisló la identidad de las plantillas WhatsApp por `campaña + plantilla` para evitar mezclar oportunidades cuando una plantilla se reutiliza en campañas distintas.
- Se renombraron las tarjetas WhatsApp del mapa a oportunidades por campaña/plantilla y se dejó explícito que no representan visitas ni envíos.
- Se corrigió `Referencias externas`: ya no interpreta `direct`, `campaign` ni otras clases de origen como dominios remitentes; ahora solo acepta hosts reales y los muestra en columnas por sesiones y contactos.
- Se corrigió el contrato de `GET /crm/visitas/web-sessions` para devolver `referrer_host`; se excluyen referencias internas al propio sitio y se recuperan dominios externos históricos como Google, Facebook, ChatGPT y Bing.
- Se agregó `traffic_contact_metrics.referrer_rows` al resumen v2 para que `Referencias externas` tenga datos aun cuando la tabla de visitas se cargue de forma diferida; la clave de caché del resumen cambió a `v6-referrer-rankings`.
- `Referencias externas` ahora consume exclusivamente ese agregado del resumen y nunca el detalle diferido de sesiones, evitando que las clases `direct/campaign/organic_*` vuelvan a aparecer como dominios.
- La gráfica de `Referencias externas` se alineó a columnas verticales como `Sesiones por origen`, y se agregó separación visual entre `Sitios que enviaron visitas` y `Atribución de campañas`.
- Se conservó el bloque de WhatsApp sobre el agregado de atribución y conversiones, porque ese sí responde a otra semántica de negocio.
- Se corrigió la regresión que dejaba vacías las tarjetas de correo al retirar el refetch de sesiones: `resumen-v2` ahora expone rankings de tráfico por `web_sessions.cid` y `web_sessions.tid`.
- Se dejó de traducir el UTM genérico `cold_outreach` como una campaña concreta; las sesiones sin `cid` o `tid` se muestran como no identificadas.
- Se dejó de mostrar `campaign` como sitio remitente: `fuentes_top` contiene clases de origen, no hosts de referencia.
- Se corrigió `Sesiones y contactos` para que `Personas únicas` cruce las sesiones filtradas con `webchat_visitantes` usando `persona_id`/`contacto_id`, en lugar de leer un campo inexistente en `web_sessions`.
- Se corrigió `Tasa de contacto` para calcular `sesiones con contacto / sesiones totales`; una visita atribuida a una campaña no se cuenta automáticamente como contacto.
- Se implementaron filtros propios por lectura: resumen, tráfico web, conversaciones y campañas ya no muestran el mismo conjunto mezclado de controles.
- En el mapa de `Campañas`, el tooltip dejó de mostrar el embudo geográfico genérico y ahora resume visitas atribuidas, contactos en CRM y conversaciones por canal.
- En `Tráfico web`, se recuperó el KPI comparativo de sesiones: muestra aumento, decremento o ausencia de comparación contra el periodo anterior.
- Se reorganizó la lectura de `Tráfico web` en tres niveles: `Origen del tráfico`, `Sitios que enviaron visitas` y `Atribución de campañas`.
- `Referencias externas` ahora queda bajo `Sitios que enviaron visitas` y se describe únicamente como hosts reales; no se presenta al mismo nivel que el origen general.
- `Fuentes y campañas` se renombró visualmente como `Atribución: fuente, medio y campaña`; las campañas y plantillas de correo quedan como `Detalle de correo` subordinado a esa atribución.
- Cuando no existe asociación a persona/contacto, la vista muestra `0` y no un espacio vacío ni la métrica antigua de chat.
- Se agregó compatibilidad histórica para sesiones de WebChat anteriores al refactor: se recupera `session_id` desde `mensajes.datos` y se cruza con `conversaciones.persona_id/contacto_id`.

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
