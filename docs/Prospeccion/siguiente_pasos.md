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
- Completar operación de WhatsApp en frío:
  - Alta y mapeo de plantillas comerciales en Twilio para prospección.
  - Prueba E2E de envío real desde lote de prospectos.
  - Confirmar trazabilidad completa en `/inbox` para respuestas reales.

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
