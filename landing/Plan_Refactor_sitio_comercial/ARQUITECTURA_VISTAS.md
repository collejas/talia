# Arquitectura de vistas para la landing de TalIA

## Propósito

Definir cómo debe construirse la landing comercial para evitar que todas las páginas internas salgan de una sola plantilla larga y repetitiva.

La idea central es separar:

- Mensaje comercial rápido para decidir.
- Páginas SEO para responder búsquedas concretas.
- Vistas con estructura propia según intención, no solo según contenido.

## Problema a corregir

La implementación anterior tendió a resolver todo con una sola lógica de generación.

Eso produjo tres efectos no deseados:

- Páginas demasiado parecidas entre sí.
- Exceso de texto en la parte alta.
- Dependencia de una plantilla única que repite hero, bloques, FAQ y CTA con poca variación real.

Ese enfoque sirve para escalar URLs rápido, pero no para una landing comercial que necesita claridad y ritmo visual.

## Decisión de arquitectura

Las páginas más importantes no deben depender de una sola plantilla genérica para todo.

La nueva regla es esta:

> La estructura se define por la intención comercial de la página, no por el mismo template base.

## Tipos de vista

### 1. Home

Función:

- Vender en pocos segundos.

Características:

- Hero corto.
- Propuesta de valor inmediata.
- Flujo simple.
- Funciones resumidas.
- Industrias.
- Precio.
- CTA fuerte.

### 2. Página pilar

Función:

- Explicar una oferta central.

Ejemplos:

- `Qué es TalIA`
- `CRM con IA para WhatsApp`

Características:

- Hero directo.
- Qué resuelve.
- Cómo funciona.
- Beneficios concretos.
- Cierre con demo.

### 3. Página de solución

Función:

- Responder una necesidad puntual.

Ejemplos:

- `Seguimiento de ventas`
- `Automatización de procesos`
- `Agendas, cotizaciones, notas y tareas`

Características:

- Problema.
- Solución.
- Resultado.
- Beneficios.
- CTA final.

### 4. Página de industria

Función:

- Mostrar el producto aplicado a un sector.

Ejemplos:

- `Inmobiliarias`
- `Servicios`
- `Negocios locales`
- `Ventas B2B`
- `Turismo`

Características:

- Hero por industria.
- Contexto del sector.
- Qué cambia con TalIA.
- Beneficios concretos.
- CTA final.

Nota:

- No existe una vista hub `/industrias`; cada sector se entra directo por su propia URL.

### 5. Página de precio

Función:

- Ayudar a cerrar decisión.

Características:

- Hero muy simple.
- Precio visible.
- Qué incluye.
- Para quién es.
- CTA comercial.

## Reglas de contenido

- Máximo 3 a 5 secciones por página interna.
- Un solo mensaje principal por URL.
- Un solo CTA dominante.
- Texto corto arriba.
- Detalle solo si ayuda a decidir.
- Si una página necesita demasiada explicación, debe dividirse.

## Qué NO debe pasar

- No usar una plantilla única para todas las vistas internas.
- No repetir la misma estructura de `hero + stats + panel + FAQ + CTA` en todas.
- No meter textos internos de proceso de creación en páginas públicas.
- No hacer páginas largas para cubrir SEO con relleno.
- No confundir `Producto` con `Soluciones` cuando ambos dicen lo mismo.

## Qué sí debe pasar

- Cada tipo de página debe sentirse distinta.
- La jerarquía visual debe cambiar según la intención.
- La home debe ser más comercial.
- Las páginas SEO deben ser más específicas y más cortas.
- La navegación debe guiar, no saturar.

## Rol del generador JS

El generador JS no debe ser el dueño de toda la experiencia.

Se puede usar para:

- Repetir metadatos.
- Mantener consistencia básica.
- Generar páginas satélite simples.

No se debe usar como solución principal para:

- Diseñar todas las vistas.
- Imponer la misma estructura en todo el sitio.
- Definir las páginas más importantes con el mismo patrón.

## Reglas prácticas de implementación

- La home debe ser manual y única.
- Las páginas pilares deben poder tener layout propio.
- Las páginas de industria deben tener composición distinta a las de solución.
- Las páginas de precio deben ser más cortas que las páginas educativas.
- Las páginas SEO satélite pueden compartir componentes, pero no deben verse clonadas.

## Criterio de aceptación

El refactor estará bien hecho si:

- La home se entiende rápido.
- Las páginas internas no se sienten copias.
- Cada URL responde una intención concreta.
- El sitio deja de depender de una sola plantilla larga.
- El usuario no necesita leer demasiado para entender qué ofrece TalIA.

## Implementación ya aplicada

Durante el refactor ya se fijaron estas decisiones prácticas:

- `que-es-talia` dejó de depender de bloques largos repetidos y ahora usa un hero más directo con secciones breves.
- `crm-con-ia-para-whatsapp` tiene una estructura propia y ya no replica la misma narrativa de `Qué es TalIA`.
- Las páginas internas deben variar en composición visual cuando la intención cambia.
- El contenido interno de apoyo no debe invadir la jerarquía del hero.
- La versión visible de la marca en páginas y metadatos se está normalizando a `Tal-IA`.

## Estado por vista

### Ya adaptadas

- `inicio`
- `que-es-talia`
- `crm-con-ia-para-whatsapp`
- `caracteristicas`
- `precios`

### Siguientes candidatas

- `asistente-ia-empresas`
- `ia-de-whatsapp`
- `ia-para-ventas`
- `automatizacion-de-ventas`
- `seguimiento-ventas`
- `agenda-y-cotizaciones`
- `prospeccion-comercial`
- `buscar-contactos`
- `prospectos-google-denue`
- `campanas-marketing`
- `industrias/*`
