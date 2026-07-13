# Plan de latencia WhatsApp

Documentación operativa para diagnosticar, ejecutar y validar mejoras de latencia en el flujo del asistente de WhatsApp.

## Objetivo

Reducir la latencia percibida por el usuario en cada respuesta del asistente y mantener evidencia clara de:

- problema observado,
- mediciones reales,
- cambios aplicados,
- impacto de cada cambio,
- pendientes y riesgos.

## Meta actual

- Objetivo funcional:
  - llevar la respuesta del asistente a una ventana operativa cercana a `7s` por turno cuando el flujo no requiera procesos extraordinarios.

- Regla de validación:
  - no considerar una mejora como cerrada sin evidencia en logs reales del canal.

## Archivos de esta carpeta

- `README.md`
  - índice general, objetivos, orden de trabajo y criterios de cierre.

- `changelog.md`
  - registro cronológico de hallazgos, cambios, pruebas, regresiones y resultados.

## Qué registrar en `changelog.md`

Cada entrada debe incluir, como mínimo:

- fecha y hora UTC,
- síntoma observado,
- evidencia usada,
- cambio realizado,
- resultado medido,
- siguiente paso.

## Hallazgos base ya observados

- La latencia no viene de una sola capa; el flujo puede degradarse en:
  - persistencia de mensaje entrante,
  - sincronización CRM / oportunidad,
  - debounce de burst,
  - generación OpenAI,
  - indicadores `read` / `typing`,
  - envío final del mensaje.

- Ya se observó un turno real con latencia total superior a `30s`, con costos repartidos entre:
  - `register_inbound_ms`,
  - `ensure_opportunity_ms`,
  - `assistant_generation_ms`,
  - `read_indicator_ms`,
  - `typing_indicator_ms`.

- El webhook `Meta` actualmente procesa el mensaje en línea, no en background.

## Orden de trabajo recomendado

1. Registrar cada medición real antes de cambiar código.
2. Aislar la etapa dominante en `whatsapp.turn_timing`.
3. Aplicar cambios pequeños y medibles.
4. Volver a medir sobre tráfico real.
5. Documentar impacto antes/después.

## Criterio de cierre

Este plan se considera suficientemente avanzado cuando:

- exista baseline documentado,
- cada mejora aplicada tenga su evidencia,
- las etapas dominantes de latencia estén identificadas,
- el flujo reduzca consistentemente la latencia total,
- y quede claro qué sigue pendiente para llegar a la meta.
