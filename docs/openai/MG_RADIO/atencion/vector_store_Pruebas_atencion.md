# MG Radio · Vector Store para Atención WhatsApp

## Recomendación
Crear un vector store separado para atención de MG Radio:

- `mg_radio_atencion_vs`

No mezclarlo con bases generales de producto o prospección para evitar respuestas largas o fuera de contexto comercial.

## Colecciones sugeridas

1. `propuesta_valor`

- mensajes cortos por tipo de campaña o medio
- enfoque en radio, digital, redes y contenido

2. `objeciones`

- respuestas aprobadas para objeciones comunes

3. `casos_uso`

- mini-casos por necesidad con problema, solución y resultado

4. `faq_comercial`

- qué ofrece MG Radio
- qué información pedir para cotizar
- cómo orientar una cita comercial

5. `compliance`

- lineamientos de contacto en frío
- tono
- opt-out

6. `normalizacion`

- entradas cortas y respuestas de una sola palabra
- selección rápida de estación, medio o servicio

## Formato de documentos

Usar chunks cortos y accionables con metadatos:

- `tipo`
- `audiencia`
- `etapa` (`atencion|calificacion|cierre`)
- `canal` (`whatsapp`)
- `idioma` (`es_MX`)

## Regla de uso en prompt

- Consultar la vector store solo para:
  - beneficios por audiencia,
  - objeciones,
  - FAQ comercial,
  - cierre a cita.
- No usarla para inventar alcances, precios ni resultados no confirmados.

## Criterio de calidad

- Cada respuesta debe:
  - aportar una idea clara,
  - hacer avanzar la conversación,
  - mantener longitud breve.

## Checklist de despliegue

1. Crear assistant nuevo: `mg_radio_atencion_whatsapp`.
2. Cargar prompt de `whatsapp_prompt.md`.
3. Cargar tools de `whatsapp_funciones.md`.
4. Crear y vincular vector store `mg_radio_atencion_vs`.
5. En routing backend: `source=atencion && channel=whatsapp` -> assistant de atención.
6. Verificar trazabilidad en metadata de mensajes (`source`, `batch_id`, `campana_id`, `assistant_id`).
