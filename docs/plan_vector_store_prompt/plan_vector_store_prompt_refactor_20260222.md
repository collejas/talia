# Plan Refactorizado Vector Store Prompt (2026-02-22)

## Objetivo
Reducir costo operativo del flujo de catálogo inmobiliario sin perder cobertura ni precisión en respuestas del asistente.  
La estrategia será híbrida: SQL-first para consultas estructuradas y vector store solo cuando aporte valor semántico real.

## Diagnóstico resumido
- El costo no está dominado por tamaño de tabla vectorial, sino por frecuencia de uso.
- Se está consultando vector store en demasiados turnos no catálogo.
- Se ejecutan reindexaciones completas con alta frecuencia tras cambios de catálogo.
- El prompt/documentación pide uso selectivo, pero la ejecución backend hoy no siempre lo respeta.

## Principios del nuevo enfoque
1. Usar vector store solo cuando hay intención inmobiliaria real.
2. Resolver primero con SQL cuando existe ruta estructurada.
3. Evitar reindex total salvo tareas administrativas excepcionales.
4. Medir continuamente qué consultas sí ameritan vector.

## Principio de orquestación (Prompt-first)
- La decisión de estrategia de consulta la toma el prompt (LLM), porque tiene el contexto conversacional completo.
- El prompt decide en cada turno si llama tools SQL (`list_catalog_fraccionamientos`, `list_catalog_modelos`, lookup exacto) o tool semántica (`fetch_catalog_item_details`).
- El backend no debe imponer la ruta funcional por defecto; solo aplica guardrails operativos:
  - validación de parámetros y tenant;
  - límites de costo/seguridad;
  - bloqueo de entradas inválidas o triviales;
  - fallback técnico cuando una tool falle.
- Contrato operativo: **orquestación por prompt, control operativo por backend**.

## Fase 1: Gating de intención antes de vector search (Alta prioridad)
- Agregar guardas de intención para no llamar `build_catalog_context` en turnos de:
  - Captura de datos (nombre, correo, teléfono, empresa).
  - Perfilamiento/scoring (sí/no, presupuesto, financiamiento, plazos).
  - Agenda/demo/reagenda/cancelación.
  - Respuestas triviales ("ok", "si", "gracias", etc.).
- Activar vector solo si el mensaje contiene intención de catálogo:
  - Fraccionamiento, prototipo/modelo, ficha, comparación, recámaras, m2, precio, tipo de propiedad.

## Fase 2: SQL-first + Vector fallback (Alta prioridad)
- Ruta primaria:
  - `list_catalog_fraccionamientos` para inventario general de desarrollos.
  - `list_catalog_modelos` para jerarquía línea/familia/modelo y tipo de propiedad.
  - Búsqueda exacta por `slug`/`nombre` en `catalog_items` para ficha concreta.
- Ruta secundaria:
  - `fetch_catalog_item_details` con vector solo en casos ambiguos o búsqueda semántica.
- Resultado esperado:
  - Mayor precisión estructural.
  - Menos embeddings por turno.

## Fase 3: Reindex incremental (Alta prioridad)
- Sustituir `_trigger_catalog_reindex` completo por indexación por entidad afectada:
  - `catalog_item` individual.
  - familia/modelo/línea específica y sus dependencias mínimas.
- Mantener endpoint/manual para reindex completo solo bajo operación explícita.
- Agregar control anti-tormenta:
  - deduplicación por ventana corta (ej. 30-120s) por organización y entidad.

## Fase 4: Cache de embeddings de consulta (Media prioridad)
- Cachear embedding de query por:
  - `organizacion_id + model + query_normalized`.
- Normalización:
  - trim, lowercase, espacios compactados, sin acentos.
- TTL recomendado: 7-30 días.
- No cachear queries con PII (email/teléfono) ni mensajes triviales.
- Implementación:
  - opción A: Redis.
  - opción B: tabla SQL de cache (si no hay Redis).

## Fase 5: Optimización de frontend para cambios masivos (Media prioridad)
- En operaciones bulk de líneas/familias/modelos:
  - evitar N requests con N reindexaciones.
  - usar endpoint batch y una sola indexación incremental agrupada.

## Fase 6: Modelo de embeddings y configuración (Media prioridad)
- Revisar el modelo configurado en `embeddings_model`.
- Migrar a un modelo vigente y más costo-eficiente cuando aplique.
- Documentar decisión por tenant/canal.

## Fase 7: Observabilidad y control de costo (Alta prioridad)
- Extender auditoría con:
  - `reason` de activación vector (`catalog_intent`, `fallback_semantic`, `skipped_non_catalog`).
  - contadores por canal, tipo de turno y resultado.
- Reporte semanal:
  - total de queries vector.
  - porcentaje de queries útiles vs triviales.
  - eventos de reindex (incremental vs full).

## Ajustes de prompt y tools
- Mantener instrucción explícita: usar tools SQL primero.
- Reservar `fetch_catalog_item_details` para:
  - "ficha completa", "detalles completos", comparación ambigua.
- Alinear prompts de webchat/whatsapp con el gating real de backend.

## Criterios de aceptación
1. Disminución clara de eventos `query` vector en turnos no catálogo.
2. Disminución de `reindex` completos por edición cotidiana de catálogo.
3. Exactitud mantenida o mejorada en respuestas sobre productos y propiedades.
4. Trazabilidad en auditoría para explicar cada uso de vector.

## Orden de implementación recomendado
1. Fase 1 (gating) + Fase 2 (SQL-first/fallback).
2. Fase 3 (reindex incremental).
3. Fase 4 (cache embeddings).
4. Fase 5 (batch frontend).
5. Fase 6 y 7 (modelo + observabilidad fina).

## Riesgos y mitigación
- Riesgo: perder recall en consultas ambiguas.
  - Mitigación: fallback vector explícito cuando SQL no encuentre match confiable.
- Riesgo: complejidad operativa de indexación incremental.
  - Mitigación: mantener reindex full manual como red de seguridad.
- Riesgo: desalineación prompt/backend.
  - Mitigación: versionar prompt junto con reglas de activación en backend.

## Estado del documento
- Estado: propuesto para ejecución.
- Autoría: refactor derivado de análisis técnico de costo/uso (2026-02-22).
