# Prospección · Siguiente proceso de trabajo

Este archivo sirve para capturar próximos requerimientos sin mezclar historial viejo.

## Backlog sugerido (priorizado)

0. Refactor de flujo (acordado)
- Simplificar a modelo único:
  - Gestión de campañas/plantillas en `prospeccion/campanas`.
  - Ejecución de envíos sólo en `prospeccion/prospectos`.
- Eliminar ruta operativa duplicada:
  - retirar `settings/prospeccion/plantillas`.
- Ligadura fuerte campaña-plantilla:
  - plantillas con `campana_id` obligatorio.
  - en `prospeccion/prospectos`, al elegir campaña, mostrar sólo plantillas de esa campaña.
- Programación operativa de envío:
  - soportar fecha/hora opcional.
  - soportar separación entre envíos por canal/lote.
- Métricas:
  - tablero por campaña (principal) + desglose por plantilla.

1. UX de tabla de prospectos
- Guardar preferencias de columnas por usuario en backend (no sólo `localStorage`).
- Vistas guardadas (preset de columnas + filtros + orden).

2. Calidad de datos
- Normalizar emails a minúsculas al persistir (no sólo en UI).
- Resolver nombre amigable de consulta por `busqueda_id` en toda la app.

3. Campañas y contacto
- Reglas de suppressions/opt-out por canal.
- Dashboard de conversión por fuente (`google_places`, `denue`, `usuario`).
- Integrar `/inbox` con filtros de prospección (`source`, `batch`, `campana`) según `inbox_prospeccion_plan.md`. (Completado en fase inicial y validado funcional)
- Completar operación de WhatsApp en frío: (Completado en fase base)
  - Alta y mapeo de plantillas comerciales en Twilio para prospección.
  - Prueba E2E de envío real desde lote de prospectos.
  - Confirmar trazabilidad completa en `/inbox` para respuestas reales.
- Asistente IA especializado en prospección:
  - Crear assistant separado de WhatsApp operativo (`talia_prospeccion_whatsapp`).
  - Prompt y tools específicos de prospección en frío (captar interés -> calificar -> agendar demo).
  - Vector store dedicado (`talia_prospeccion_vs`) con propuesta por industria, objeciones, cierre demo y compliance.
  - Routing por metadata: `source=prospeccion` + `channel=whatsapp` para usar assistant de prospección. (Completado)
  - Mantener assistant operativo actual para conversaciones no comerciales de prospección.
- Correo de prospección (Brevo):
  - Fase 1 (inmediata): operar plantillas desde la app (sin depender de creación en Brevo), permitiendo:
    - envío con plantilla guardada en app + variables dinámicas.
    - envío libre sin plantilla (`asunto` + `cuerpo`) con variables.
  - Fase 2 (evolutiva): integrar catálogo/sync de plantillas vía API de Brevo (lectura/gestión desde app).
  - Medición y estadísticas: persistir y mostrar en app eventos de Brevo (enviado, entregado, primera apertura, aperturas, clics, rebotes, bloqueado, spam, unsubscribe, error).
 - Atribución por campaña sin nueva pantalla de embudo:
   - En `prospeccion/prospectos`, `campana_id` obligatorio al enviar (correo/whatsapp/llamada).
   - Regla de no bloqueo para inbox general:
     - La validación de `campana_id` aplica solo a envíos de prospección iniciados desde `prospeccion/prospectos` (`source=prospeccion`).
     - Mensajes entrantes de WhatsApp fuera de prospección (`prospeccion_mode=false` o sin metadata de origen prospección) no deben bloquearse por falta de campaña.
   - Desde el modal de envío, soportar `+ Campaña rápida` (crear campaña mínima sin salir de la vista).
   - Persistir `campana_id` y `batch_id` en lote/envíos/logs para trazabilidad completa.
   - Reusar embudo actual (sin crear embudo nuevo): oportunidad/tarjeta debe conservar metadata de atribución (`campana_id`, `batch_id`, `prospeccion_canal`, `template_id`).
   - Correo: links con UTM + ids de atribución (`campaign_id`, `batch_id`, `prospecto_id`) para medir sesiones/clics.
   - WhatsApp: respuestas entrantes vinculadas a envío/lote/campaña de origen.
   - Reporte en `prospeccion/campanas` con métricas por campaña: enviados, respuestas, clics web, oportunidades creadas y cerradas.

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
