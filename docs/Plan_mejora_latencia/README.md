# Plan de mejora de latencia

- [Workspace de oportunidad en Inbox](06_workspace_oportunidad_inbox.md)
- [Plan transversal de consolidación de métricas](../Plan_metricas/PLAN_CONSOLIDACION_METRICAS.md)
- [Auditoría de separación de envíos de prospección](../Prospeccion/envios_y_separacion.md)
- [Incidente Supabase/Prospección y actualización del plan](07_incidente_supabase_prospeccion_20261001.md)
- [Incidente de envío masivo y saturación de Supabase](08_incidente_envio_masivo_20261002.md)
- [Incidente de listado de prospectos y conteo exacto](09_incidente_listado_prospectos_20261008.md)
- [Plan integral de Prospección: datos exactos sin bloqueos](10_plan_integral_prospeccion_exacta_sin_bloqueos_20261009.md)
- [Changelog de mejoras de latencia](changelog.md)

Documentación generada para diagnóstico y plan de mejora de rendimiento en backend CRM.

La consolidación de métricas debe reutilizar agregados canónicos y eliminar
consultas repetidas entre vistas antes de introducir nuevas cachés o tablas.

La latencia del panel y la cadencia del sender son problemas distintos. La
optimización de consultas no garantiza la separación entre despachos; esa
separación debe auditarse con los timestamps del worker y del proveedor.

## Archivos

- `01_diagnostico_actual.md`
  - Hallazgos técnicos confirmados.
  - Evidencia de logs y causas raíz por módulo.

- `02_plan_mejora.md`
  - Plan por fases (rápida, estructural, hardening).
  - Metas de latencia, riesgos y criterio de cierre.
  - Incluye sección de avance implementado (Fase 1 inbox).

- `03_plan_integral_realtime_mv_sin_redis.md`
  - Plan maestro actualizado sin Redis.
  - Integra `Realtime + materialized views/cache + queries optimizadas`.
  - Incluye 10 líneas de trabajo adicionales, priorización y criterios de éxito.

- `04_ejecucion_fase0_baseline.md`
  - Línea base inicial con evidencia de logs.
  - Métricas de latencia por endpoint crítico.
  - Decisión de arranque para Fase 1.

- `05_inbox_persistente_definitivo.md`
  - Modelo persistente, compatibilidad persona/cuenta, triggers, seguridad y rendimiento.

- `07_incidente_supabase_prospeccion_20261001.md`
  - Evidencia reciente de `PGRST002`, `57014`, latencia de Prospección y relación
    con los workers de Brevo/WhatsApp.
  - Correcciones propuestas para manejo de errores, indicadores y refreshes.

- `10_plan_integral_prospeccion_exacta_sin_bloqueos_20261009.md`
  - Especificación vigente para contadores exactos, índices, paginación,
    snapshots, workers y operación multi-tenant sin bloquear la interfaz.

- `changelog.md`
  - Registro cronológico de los tres puntos prioritarios de mejora.

## Orden recomendado

1. Leer `01_diagnostico_actual.md`.
2. Revisar avance histórico en `02_plan_mejora.md`.
3. Ejecutar `03_plan_integral_realtime_mv_sin_redis.md` como plan principal, con medición continua.
4. Usar `04_ejecucion_fase0_baseline.md` como punto de comparación antes/después.
5. Usar `05_inbox_persistente_definitivo.md` como arquitectura vigente de Inbox.
6. Usar `07_incidente_supabase_prospeccion_20261001.md` como actualización operativa
   vigente para Supabase y Prospección.

## Estado actual

- Avance registrado al 2026-03-17:
  - Fase 1 parcialmente implementada en backend inbox.
  - Plan integral actualizado (sin Redis) documentado en archivo 03.
  - Baseline inicial de ejecución documentado en archivo 04.

- Actualización 2026-10-01:
  - Confirmada degradación transversal temporal de Supabase/PostgREST.
  - Confirmados timeouts en refreshes y resúmenes de Prospección.
  - Confirmado defecto de logging que oculta errores de dependencia en
    `/prospeccion/prospectos`.
  - Pendiente separar indicadores del listado y sacar refreshes del camino crítico.

- Actualización 2026-10-02:
  - Un envío de 1001 prospectos terminó en `502` después de persistencia parcial.
  - Se identificaron dos lotes, targets incompletos y preparación fallida.
  - La clave de idempotencia recibida por HTTP no quedó persistida en el batch.
  - Queda prohibido repetir el envío hasta reconciliar ambos lotes.
  - El siguiente paso es desacoplar completamente la preparación del endpoint y
    hacer durable la idempotencia de la campaña.
