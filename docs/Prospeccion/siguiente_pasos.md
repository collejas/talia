# Prospección · Siguiente proceso de trabajo

Este archivo sirve para capturar próximos requerimientos sin mezclar historial viejo.

## Backlog sugerido (priorizado)

1. UX de tabla de prospectos
- (Sin pendientes inmediatos en este bloque).

2. Calidad de datos
- (Sin pendientes inmediatos en este bloque).

3. Campañas y contacto
- Asistente IA especializado en prospección:
  - Mantener assistant operativo actual para conversaciones no comerciales de prospección.
- Correo de prospección (Brevo):
  - Fase 2 (evolutiva): completar sync avanzado de plantillas vía API de Brevo (edición/publicación remota y reconciliación masiva; catálogo/import ya operativo).
- Atribución por campaña:
  - WhatsApp: consolidar medición de respuestas y CTA por campaña/plantilla.
  - Embudo: consolidar conversión a oportunidad cerrada por campaña.
- Vista jerárquica de métricas en `prospeccion/campanas` (general -> detalle):
  - Objetivo:
    - concentrar en una sola vista la lectura de métricas desde nivel campaña hasta nivel contacto/prospecto.
  - Nivel 1 (campaña):
    - mostrar por campaña métricas agregadas:
      - `totales`, `entregados`, `respondidos`, `aperturas`, `clics`, `sesiones_utm`,
      - `enviados`, `fallidos`, `omitidos`,
      - `tasa_entrega_pct`, `tasa_respuesta_pct`, `click_to_session_pct`.
  - Nivel 2 (plantillas de la campaña):
    - al expandir una campaña, listar plantillas asociadas con sus totales consolidados.
  - Nivel 3 (envíos/lotes por plantilla):
    - al expandir una plantilla, listar sus envíos/lotes con métricas de ese envío.
  - Nivel 4 (contactos/prospectos por envío):
    - al expandir un envío, mostrar destinatarios con estado/métrica particular del envío.
  - Criterio funcional:
    - navegación tipo drill-down en una sola pantalla, sin perder contexto de campaña.
    - consistencia de métricas entre niveles (suma de hijos = total del padre, salvo reglas explícitas de deduplicación).
  - Estado (2026-02-27):
    - implementado y operativo en los 4 niveles (`campaña`, `plantilla`, `lote`, `prospecto`).
    - plantillas y lotes muestran porcentajes visibles en UI.
    - lotes numerados de forma legible (`Lote N`) en lugar de UUID.
- Pendientes de métricas (correo + WhatsApp):
  - `Respondidos` por correo (inbound real):
    - implementado base (IMAP directo a buzón + parse de headers + mapeo a envío + update a `respondido` + log `reply_inbound` + registro en Inbox canal `correo`).
    - criterio actual de marcado `respondido`:
      - entra correo por IMAP con remitente válido,
      - se intenta match por `In-Reply-To`/`References` contra `prospeccion_contacto_envio.mensaje_id`,
      - fallback por email remitente al último envío de correo,
      - si hay match, se marca envío `respondido` y se registra `reply_inbound`.
    - pendiente de endurecimiento:
      - regla final para colisiones de hilo (múltiples envíos al mismo email en ventana corta),
      - monitoreo/alerta operativa de fallos de parseo inbound,
      - pruebas E2E con variaciones de clientes de correo (Gmail/Outlook),
      - distinguir respuesta humana vs autorespuesta/notificación automática (ejemplo actual detectado: correos de calendario tipo `Accepted: ...` que hoy también cuentan como `respondido`).
  - `Sesiones UTM`:
    - validar que la landing de destino del clic ejecute alta de visita (`/api/webchat/visit`),
    - garantizar persistencia de `utm_source=prospeccion`, `utm_medium=email` y señales `cid/tid/kw`,
    - cerrar trazabilidad end-to-end de clic -> sesión atribuida por campaña/plantilla.
  - `Sesiones UTM` por prospecto/envío:
    - implementado:
      - links de correo con `eid/pid`.
      - atribución por `envio_id` en backend/SQL.
      - visualización de `sesión atribuida` en nivel prospecto y `Sesiones UTM` en nivel lote.
    - pendiente de evolución:
      - decidir y fijar regla comercial final para el tercer KPI por nivel (nombre + fórmula exacta) para evitar ambigüedad entre `Clic/Sesión` y `Clic/Total`.
  - WhatsApp por campaña/plantilla:
    - consolidar atribución de respuestas entrantes por plantilla/campaña,
    - medir y persistir CTA/clics por plantilla,
    - exponer KPIs en endpoint/UI de atribución (equivalente al bloque de correo).

4. Operación
- Alertas automáticas de fallos por canal.
- Runbook técnico consolidado para soporte. (Completado: ver `runbook_metricas_brevo.md`)

5. Atribución de publicidad WhatsApp por frase (nuevo)
- Objetivo:
  - identificar conversaciones entrantes de WhatsApp que provienen de campañas digitales usando frases semilla (prefill message),
  - persistir canal/fuente de publicidad para medición comercial.
- Alcance funcional:
  - nueva vista en `prospeccion` para administrar reglas de atribución por frase.
  - cada regla define:
    - `nombre_regla`,
    - `canal_publicitario` (Meta Ads, Google Ads, TikTok, etc.),
    - `frase_objetivo`,
    - `tipo_match` (`exacta`, `contiene`, `regex`),
    - `campana_publicitaria` (opcional),
    - `adset` (opcional),
    - `anuncio` (opcional),
    - `prioridad`,
    - `activo`.
- Persistencia propuesta:
  - `public.prospeccion_whatsapp_atribucion_reglas`:
    - catálogo editable por tenant.
  - `public.prospeccion_whatsapp_atribucion_eventos`:
    - evento inmutable por conversación atribuida (evita duplicados y permite auditoría).
  - resumen en conversación/contacto:
    - `conversaciones.metadata` y/o `contactos.contacto_datos` con campos de atribución para lectura rápida.
- Backend (captura):
  - punto de entrada: webhook inbound de WhatsApp.
  - evaluación:
    - normalizar texto entrante (trim, minúsculas, sin acentos),
    - aplicar reglas activas por prioridad,
    - resolver la primera coincidencia.
  - guardado:
    - registrar evento de atribución + marcar conversación con `source=publicidad_whatsapp`.
  - guardas operativas:
    - atribuir sólo en el primer mensaje de conversación nueva,
    - ventana anti-duplicado por contacto (configurable),
    - log de no-match (opcional) para optimizar reglas.
- Frontend (nueva vista):
  - listado CRUD de reglas con filtros por canal/estado.
  - simulador rápido:
    - pegar frase de prueba,
    - mostrar regla que matchea antes de guardar.
- Métricas a exponer:
  - por `canal_publicitario` y por `regla/frase`:
    - conversaciones atribuidas,
    - contactos únicos,
    - oportunidades creadas,
    - tasa conversación→oportunidad,
    - monto estimado total de oportunidades atribuidas.
- Plan de implementación (fases):
  - Fase 1 (MVP):
    - tablas + RLS + CRUD de reglas + matcher inbound + guardado de evento + badge en Inbox/prospección.
  - Fase 2:
    - dashboard de métricas por canal/regla con filtros de fecha.
  - Fase 3:
    - simulador avanzado + sugerencias de nuevas frases desde no-match frecuentes.
- Criterio de aceptación:
  - al enviar un WhatsApp con frase registrada, la conversación queda atribuida al canal correcto.
  - la atribución persiste en BD y se ve en UI.
  - el conteo por canal/regla incrementa en métricas sin duplicar por la misma conversación.
- Estado actual (2026-02-28):
  - Fase 1 (MVP) implementada y validada en operación.
  - Fase 2 implementada en versión base (dashboard unificado en `prospeccion/metricas`).
  - Implementado:
    - tablas `prospeccion_whatsapp_atribucion_reglas` y `prospeccion_whatsapp_atribucion_eventos` con RLS.
    - vista `prospeccion/whatsapp-atribucion` con CRUD + filtros + simulador de frase.
    - matcher inbound en webhook WhatsApp (`exacta`, `contiene`, `regex`) por prioridad.
    - guardas:
      - sólo primer mensaje de conversación,
      - anti-duplicado por conversación,
      - anti-duplicado por contacto (ventana 24h).
    - persistencia de resumen en `contactos.contacto_datos.publicidad_whatsapp_atribucion`.
    - Inbox enriquecido con `source=publicidad_whatsapp` y filtro por source.
    - endpoint agregador `GET /crm/prospeccion/metricas` con filtros globales.
    - vista `prospeccion/metricas` con:
      - KPIs de campañas y frases WhatsApp,
      - detalle por campañas, canal y regla,
      - gráficas de tendencia diaria en ambos bloques.
  - Pendiente (siguientes iteraciones):
    - drill-down a nivel conversación/oportunidad desde la tabla de métricas.
    - exportación XLSX (el CSV de métricas filtradas ya está implementado en UI).
    - alertas por variaciones bruscas (caída de entrega o conversión).
    - simulador avanzado con ranking de reglas candidatas y explicación de por qué matcheó.
    - logging analítico de no-match para sugerir nuevas frases frecuentes.

## Cómo registrar nuevos cambios

Por cada cambio nuevo:
- Contexto funcional.
- Archivos impactados (frontend/backend/sql).
- Riesgos (datos, RLS, performance).
- Criterio de aceptación.

## Completado recientemente (2026-02-24)

- Fix de proxy frontend para contacto de prospectos: ahora envía `X-Organizacion-Id`.
- Endpoint de readiness para WhatsApp de prospección en backend.
- Inbox con filtros de origen/canal/lote/campaña + deep links.
- `prospeccion/denue-busqueda`: guardar como prospectos ahora pide `Segmento` en modal y lo persiste en `prospeccion_prospectos.segmento`.
- `settings/tenants` y `settings/variables`: nueva pestaña `Whats-Prosp` para guardar múltiples SIDs en `whatsapp.templates.prospeccion`.
- `settings/tenants` y `settings/variables`: soporte para `whatsapp.prospeccion.prompt_id` y `whatsapp.prospeccion.prompt_version` en pestaña `Whats-Prosp`.
- Modal `prospeccion/prospectos`:
  - consume plantillas Whats-Prosp desde config tenant.
  - muestra nombre/SID y preview real de plantilla Twilio Content.
  - permite variables de plantilla para envío en frío.
- Ajuste de envío en frío: ya no se omite por `whatsapp_no_permitido` cuando el lote de prospección fuerza intento de WhatsApp.
- Routing runtime en canal WhatsApp:
  - Cuando un entrante se identifica como prospección, usa `whatsapp.prospeccion.prompt_id`.
  - Si no es prospección, conserva assistant/prompt operativo general.

## Completado recientemente (2026-02-25)

- Flujo WhatsApp prospección estabilizado:
  - Se evitó creación duplicada de oportunidades para la misma conversación/prospecto.
  - Se reutiliza la oportunidad/contacto de prospección cuando aplica.
- Agenda en prospección:
  - Captura de datos básicos (nombre/correo/empresa) antes de confirmar la demo.
  - Ajuste de runtime para forzar uso de tools de agenda (`list_demo_slots` / `schedule_demo`) cuando el prospecto confirma horario.
- Post-agenda:
  - Mejoras para persistir contexto mínimo en contacto (`necesidad_proposito`, `notes`) y habilitar insights/título automático de oportunidad.
  - Notificación al asesor ajustada para caso de prospección sin exigir perfilamiento completo.
- Correo prospección:
  - Validado envío transaccional por Brevo desde worker de prospección.
  - Soporte funcional de `{{logo_url}}` en plantillas/modales de correo.
  - Normalización de placeholder legado `{{DATA:IMAGE:...}}` a `{{logo_url}}`.
  - Inserción de logo con tamaño por defecto `5/6` del cuerpo (`width:83.333%`).
  - Enlace de tracking en imágenes de correo hacia `https://talia.mx/` con UTM + `kw` para atribución.
  - Fix de carga de logos en `settings/formato-cotizacion` (RLS/tenant en `logos`).
  - Definido roadmap de plantillas (app-first -> API Brevo) y de métricas/eventos para visualización en la app.

## Completado recientemente (2026-02-26)

- Se consolidó el flujo único de ejecución en `prospeccion/prospectos`:
  - campaña obligatoria,
  - plantilla obligatoria filtrada por campaña,
  - programación + separación entre envíos,
  - ejecución de lote.
- Se consolidó el flujo único de gestión en `prospeccion/campanas`:
  - creación/edición/eliminación de campañas,
  - plantillas ligadas a campaña y canal.
- Campañas de canal único (sin multicanal) y validación cruzada campaña-plantilla.
- Se retiró el flujo rápido/duplicado sin campaña para evitar ejecuciones fuera del modelo acordado.
- Modal de plantillas rediseñado (compacto, más ancho útil, scroll interno).
- Plantillas WhatsApp:
  - campos operativos reorganizados,
  - carga de imagen desde el propio modal,
  - URL para media de Twilio con tracking,
  - URL CTA con tracking para botón de plantilla Meta/Twilio.
- Plantillas Correo:
  - carga de imagen desde el propio modal,
  - persistencia de `logo_url` en metadata.
- Subida de imágenes con trazabilidad:
  - `campana_id`, `canal`, `template_id`, `template_slug` en metadata del asset.
- Base de tracking CTA ya no usa fallback global:
  - toma `sitio_web` del tenant,
  - fallback a `dominio_principal` del tenant,
  - sin fallback a dominio maestro.
- Se eliminó de `prospeccion/campanas` la tarjeta “Salud por canal” por no ser tenant-safe (métrica in-memory global).

## Completado recientemente (2026-02-27)

- `prospeccion/prospectos`:
  - preferencias de tabla (orden/visibilidad de columnas) ahora persisten por usuario en backend, con fallback local.
- Calidad de datos:
  - normalización de emails de prospectos al persistir (insert/update), no sólo en la UI.
  - backfill de correos existentes para estandarizar a minúsculas.
  - resolución de nombre amigable de consulta por `busqueda_id` en `prospeccion/prospectos`, `prospeccion/contactos` y `prospeccion/campanas` (sin fallback visual a UUID técnico).
- `prospeccion/contactos`:
  - dashboard de conversión por fuente (`google_places`, `denue`, `usuario`) con cálculo persistente (RPC SQL).
- Correo prospección (Brevo):
  - catálogo de plantillas SMTP en backend (`/prospeccion/contacto/templates/brevo-catalog`).
  - importación/sync de plantilla Brevo a plantilla local de campaña (`/prospeccion/contacto/templates/import-brevo`).
  - UI en `prospeccion/campanas` para importar plantillas de correo desde Brevo.
  - métricas persistentes de eventos en `prospeccion/contactos` (resumen por evento desde `prospeccion_contactos_log`).
- Atribución por campaña/plantilla:
  - endpoint persistente `GET /prospeccion/campanas/atribucion`.
  - bloque visual en `prospeccion/campanas` con entrega/respuesta + aperturas/clics + sesiones UTM por plantilla.
  - tracking de correo ahora incluye ids técnicos en URL (`cid` campaña, `tid` plantilla) para atribución web más precisa.
- Webhook Brevo y métricas:
  - habilitado endpoint público de recepción:
    - `POST /api/prospeccion/contacto/brevo/webhook` (proxy a backend CRM).
  - confirmado flujo de actualización de `entregado` vía webhook.
  - fix aplicado en backend para persistir eventos en logs con tenant correcto (`organizacion_id`) y habilitar conteo de `aperturas/clics`.
  - nota operativa:
    - `respondidos` en correo depende de implementar/activar inbound reply.
    - `sesiones UTM` depende de que la landing cree sesión en `webchat_visitantes` con UTM de prospección.
- Runbook operativo:
  - se documentó guía de diagnóstico de métricas de correo en:
    - `docs/Prospeccion/runbook_metricas_brevo.md`

## Completado recientemente (2026-02-28)

- Atribución de publicidad WhatsApp por frase (MVP):
  - migración aplicada para reglas/eventos:
    - `prospeccion_whatsapp_atribucion_reglas`,
    - `prospeccion_whatsapp_atribucion_eventos`.
  - backend CRUD + simulador:
    - `GET/POST/PATCH/DELETE /crm/prospeccion/whatsapp/atribucion/reglas`,
    - `POST /crm/prospeccion/whatsapp/atribucion/reglas/simular`.
  - integración inbound en webhook WhatsApp:
    - matching por frase (`exacta`, `contiene`, `regex`) y prioridad,
    - guardas de primer mensaje y anti-duplicado,
    - persistencia de evento de match.
  - persistencia rápida en contacto:
    - `contactos.contacto_datos.publicidad_whatsapp_atribucion`.
  - nueva vista frontend:
    - `prospeccion/whatsapp-atribucion` (CRUD + filtros + simulador).
  - Inbox:
    - conversaciones atribuidas visibles con `source=publicidad_whatsapp`.
