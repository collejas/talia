# Prospección · Documentación vigente

Última actualización: 2026-04-25.

Esta carpeta quedó organizada así:

- `CHANGELOG.md`: registro cronológico de cambios en prospección.
- `prospeccion.md`: visión general funcional y flujo end-to-end.
- `frontend_vistas.md`: vistas de UI y responsabilidades.
- `backend_endpoints.md`: endpoints y capas backend.
- `base_datos.md`: modelo de datos, funciones y RLS (referencia: `backups/postgres_20260223_215144`).
- `plan_deduplicacion_retencion_resultados.md`: plan de referencia ya ejecutado para evitar duplicados entre búsquedas y limitar el crecimiento de `resultados`.
- `plan_deduplicacion_retencion_resultados_migracion_tecnica.md`: migración técnica ya aplicada por fases; deja sólo optimización futura si el volumen vuelve a crecer.
- `plan_columnarizacion_resultados_direccion.md`: refactor pendiente para mover más lectura a columnas y desglosar dirección DENUE/Google.
- `runbook_metricas_brevo.md`: guia operativa de diagnostico para metricas de correo (Brevo + app).
- `inbox_prospeccion_plan.md`: plan y avance de operación de conversaciones de prospección reutilizando `/inbox`.
- `_archivo/`: documentos históricos que ya no reflejan el estado actual.

Si vas a definir cambios nuevos, parte de `prospeccion.md` y cruza con `backend_endpoints.md` + `base_datos.md`.
