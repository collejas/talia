# Prospección · Siguiente proceso de trabajo

Este archivo sirve para capturar próximos requerimientos sin mezclar historial viejo.

## Backlog sugerido (priorizado)

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
