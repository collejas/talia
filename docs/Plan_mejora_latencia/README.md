# Plan de mejora de latencia

Documentación generada para diagnóstico y plan de mejora de rendimiento en backend CRM.

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

## Orden recomendado

1. Leer `01_diagnostico_actual.md`.
2. Revisar avance histórico en `02_plan_mejora.md`.
3. Ejecutar `03_plan_integral_realtime_mv_sin_redis.md` como plan principal, con medición continua.
4. Usar `04_ejecucion_fase0_baseline.md` como punto de comparación antes/después.

## Estado actual

- Avance registrado al 2026-03-17:
  - Fase 1 parcialmente implementada en backend inbox.
  - Plan integral actualizado (sin Redis) documentado en archivo 03.
  - Baseline inicial de ejecución documentado en archivo 04.
