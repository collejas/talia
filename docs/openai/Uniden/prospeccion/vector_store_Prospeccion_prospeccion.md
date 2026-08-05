# TAL-IA · Vector Store para Prospección

## Recomendación
Crear **vector store separado** para prospección:
- `talia_prospeccion_vs`

No mezclar con base general de producto/inbox para evitar respuestas largas o fuera de contexto comercial.

## Colecciones sugeridas
1. `propuesta_valor`
- mensajes cortos por industria (restaurantes, inmobiliario, salud, educación, etc.)

2. `objeciones`
- respuestas aprobadas para objeciones comunes.

3. `casos_uso`
- mini-casos por giro con problema > solución > resultado.

4. `faq_demo`
- qué incluye demo, duración, requisitos, siguiente paso.

5. `compliance`
- lineamientos de contacto en frío, tono y opt-out.

## Formato de documentos
Usar chunks cortos y accionables (100-250 palabras) con metadatos:
- `tipo`
- `industria`
- `etapa` (`enganche|calificacion|cierre_demo`)
- `canal` (`whatsapp`)
- `idioma` (`es_MX`)

## Regla de uso en prompt
- Consultar vector store solo para:
  - beneficios por industria,
  - objeciones,
  - cierre a demo.
- No usar vector store para inventar precios ni promesas no confirmadas.

## Criterio de calidad
- Cada respuesta debe:
  - aportar un beneficio claro,
  - incluir 1 avance concreto (pregunta o CTA),
  - mantener longitud breve.

## Checklist de despliegue
1. Crear assistant nuevo: `talia_prospeccion_whatsapp`.
2. Cargar prompt de `whatsapp_prompt_prospeccion.md`.
3. Cargar tools de `whatsapp_funciones_prospeccion.md`.
4. Crear y vincular vector store `talia_prospeccion_vs`.
5. En routing backend: `source=prospeccion && channel=whatsapp` -> assistant de prospección.
6. Verificar trazabilidad en metadata de mensajes (`source`, `batch_id`, `campana_id`, `assistant_id`).
