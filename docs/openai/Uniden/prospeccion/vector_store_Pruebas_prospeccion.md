# UNIDEL · Vector Store para Prospección

## Recomendación
Crear un vector store separado para prospección de UNIDEL:

- `unidel_prospeccion_vs`

No mezclarlo con bases generales de producto o atención operativa para evitar respuestas largas o fuera de contexto comercial.

## Colecciones sugeridas

1. `propuesta_valor`

- mensajes cortos por sector o necesidad
- enfoque en uniformes, ropa de trabajo y personalización

2. `objeciones`

- respuestas aprobadas para objeciones comunes

3. `casos_uso`

- mini-casos por giro con problema, solución y resultado

4. `faq_comercial`

- qué vende UNIDEL
- qué información pedir para cotizar
- cómo orientar una cita comercial

5. `compliance`

- lineamientos de contacto en frío
- tono
- opt-out

6. `normalizacion`

- entradas cortas y respuestas de una sola palabra
- selección rápida de prenda, técnica o sector

## Formato de documentos

Usar chunks cortos y accionables con metadatos:

- `tipo`
- `industria`
- `etapa` (`enganche|calificacion|cierre_demo`)
- `canal` (`whatsapp`)
- `idioma` (`es_MX`)

## Regla de uso en prompt

- Consultar la vector store solo para:
  - beneficios por industria,
  - objeciones,
  - FAQ comercial,
  - cierre a cita o demo.
- No usarla para inventar precios, tiempos de entrega ni disponibilidad no confirmada.

## Criterio de calidad

- Cada respuesta debe:
  - aportar una idea clara,
  - hacer avanzar la conversación,
  - mantener longitud breve.

## Checklist de despliegue

1. Crear assistant nuevo: `unidel_prospeccion_whatsapp`.
2. Cargar prompt de `whatsapp_prompt_Pruebas_prospeccion.md`.
3. Cargar tools de `whatsapp_Pruebas_funciones_prospeccion.md`.
4. Crear y vincular vector store `unidel_prospeccion_vs`.
5. En routing backend: `source=prospeccion && channel=whatsapp` -> assistant de prospección.
6. Verificar trazabilidad en metadata de mensajes (`source`, `batch_id`, `campana_id`, `assistant_id`).
