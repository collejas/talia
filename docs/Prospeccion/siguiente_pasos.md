# Prospección · Siguiente proceso de trabajo

Este archivo sirve para capturar próximos requerimientos sin mezclar historial viejo.

## Backlog sugerido (priorizado)

1. UX de tabla de prospectos
- (Sin pendientes inmediatos en este bloque).

2. Calidad de datos
- Resolver nombre amigable de consulta por `busqueda_id` en toda la app.

3. Campañas y contacto
- Dashboard de conversión por fuente (`google_places`, `denue`, `usuario`).
- Asistente IA especializado en prospección:
  - Mantener assistant operativo actual para conversaciones no comerciales de prospección.
- Correo de prospección (Brevo):
  - Fase 2 (evolutiva): integrar catálogo/sync de plantillas vía API de Brevo (lectura/gestión desde app; Fase 1 ya operativa).
  - Medición y estadísticas: persistir y mostrar en app eventos de Brevo (enviado, entregado, primera apertura, aperturas, clics, rebotes, bloqueado, spam, unsubscribe, error).
- Atribución por campaña:
  - Completar reporte persistente por campaña/plantilla (evitar métricas in-memory).
  - Correo: consolidar medición de sesiones/clics por UTM + ids técnicos.
  - WhatsApp: consolidar medición de respuestas y CTA por campaña/plantilla.
  - Embudo: consolidar conversión a oportunidad cerrada por campaña.

4. Operación
- Alertas automáticas de fallos por canal.
- Runbook técnico consolidado para soporte.

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
