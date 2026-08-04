# Plan de refactor del sitio comercial

Base de trabajo para la landing y las páginas SEO del sitio comercial de TalIA.

## Objetivo

Separar con claridad dos cosas distintas:

- La `home`, que debe vender en pocos segundos.
- Las páginas SEO, que deben responder búsquedas concretas sin ensuciar el mensaje principal.

La narrativa central del sitio debe ser esta:

> TalIA te ayuda a conseguir prospectos, atenderlos por WhatsApp con IA y darles seguimiento en un CRM hasta convertirlos en ventas.

## Regla de cierre

Las vistas públicas y sus `slugs` canónicos ya quedaron definidos.

A partir de este punto no se renombrarán URLs ni se reescribirá el SEO de las páginas ya publicadas.

Lo que sigue debe alinearse a esas vistas ya cerradas:

- documentación
- navegación
- sitemap
- enlaces internos
- CTAs
- textos auxiliares
- páginas de apoyo
- video pages

## Estado actual del refactor

Ya se aplicaron estas decisiones en la landing:

- La `home` sigue siendo la pieza comercial principal y ya no debe llenarse con texto repetido de soporte interno.
- La vista `que-es-talia` quedó como página pilar con hero directo, secciones cortas y un bloque de tipos de negocio en formato compacto.
- La vista `crm-con-ia-para-whatsapp` quedó como página pilar técnica/comercial con textos propios, hero más claro y sin duplicar el contenido de `Qué es TalIA`.
- Las páginas internas ya no deben depender de una sola estructura larga para todas las vistas.
- El branding visible ya migró a `Tal-IA` en las vistas y metadatos ajustados manualmente.
- El `site.webmanifest` y el generador SEO ya quedaron alineados con `Tal-IA` como nombre visible.
- Los CTA flotantes se mantienen como accesos rápidos a webchat y WhatsApp, con WhatsApp al lado derecho inferior.
- La vista hub `/industrias` fue eliminada; cada sector se abre directo desde su propia URL.

### Avance por vista

#### Ya refactorizadas

- `inicio`
- `que-es-talia`
- `crm-con-ia-para-whatsapp`
- `caracteristicas`
- `precios`

#### Ya alineadas a nivel base

- `site.webmanifest`
- `generate-seo-pages.mjs`
- CTA flotantes de webchat y WhatsApp

#### Referencias canónicas publicadas

- `asistente-ia-empresas`
- `ia-de-whatsapp`
- `ia-para-ventas`
- `automatizacion-de-ventas`
- `seguimiento-ventas`
- `agenda-y-cotizaciones`
- `prospeccion-comercial`
- `buscar-contactos`
- `campanas-marketing`
- `industrias/*`

Lo que sí sigue pendiente fuera de las vistas es:

- Documentación de navegación y arquitectura.
- Sitemap y enlaces internos que todavía mencionan nombres viejos o aliases.
- Textos auxiliares, CTAs y páginas de apoyo que deben referirse a los slugs ya cerrados.

## Problema actual

Hoy el sitio intenta hacer demasiadas tareas al mismo tiempo:

- Explicar qué es TalIA.
- Vender la plataforma.
- Posicionar palabras SEO.
- Explicar funciones.
- Mostrar soluciones.
- Hablarle a industrias.
- Justificar IA, CRM, WhatsApp, prospección, seguimiento y cotizaciones.

Eso genera repetición. `Producto` y `Soluciones` se pisan porque ambos hablan de qué hace TalIA, pero con distinto nombre.

## Regla de diseño comercial

La home no debe intentar resolver toda la arquitectura SEO.

La home debe responder en una sola pasada:

1. Qué es TalIA.
2. Qué hace por el negocio.
3. Para quién sirve.
4. Qué resultado promete.
5. Qué acción debe tomar el usuario.

## Menú visible recomendado

La navegación visible debe ser corta y práctica:

- Inicio
- Qué es TalIA
- Funciones
- Características
- Precios
- Agenda una demo

Los grupos internos pueden seguir existiendo para SEO, pero no deben dominar la navegación principal.

### Arquitectura visible propuesta

```txt
Inicio
Qué es TalIA
Funciones
  - CRM con IA para WhatsApp
  - Asistente IA para empresas
  - Automatización de procesos
  - Seguimiento de ventas
  - Ventas e inventarios
  - Agendas, cotizaciones, notas y tareas
  - Buscar contactos Web / Google / Gob-MX
  - Campañas de Email / WhatsApp
  - Gestión inmobiliaria
  - Métricas
Industrias
  - Inmobiliario
  - Servicios
  - Negocios locales
  - Ventas B2B
  - Turismo
Características
Precios
```

### Criterio de uso de esa arquitectura

- `Qué es TalIA` explica la propuesta de valor.
- `Funciones` agrupa capacidades concretas y cortas.
- `Industrias` aterriza el producto por sector con páginas directas.
- `Características` resume sin volver a contar toda la historia.
- `Precios` cierra la decisión.

### Mapa de funciones

La nomenclatura comercial del botón `Funciones` manda sobre el copy visible.

Los `slugs` de las vistas ya están cerrados y no deben cambiarse.

| Menú / función | Vista actual o estado |
|---|---|
| CRM con IA para WhatsApp | `/crm-con-ia-para-whatsapp` |
| Asistente IA para empresas | `/asistente-ia-empresas` |
| Automatización de procesos | `/automatizacion-de-ventas` |
| Seguimiento de ventas | `/seguimiento-ventas` |
| Ventas e inventarios | `/ia-para-ventas` |
| Agendas, cotizaciones, notas y tareas | `/agenda-y-cotizaciones` |
| Buscar contactos Web / Google / Gob-MX | `/buscar-contactos` |
| Campañas de Email / WhatsApp | `/campanas-marketing` |
| Gestión inmobiliaria | `/industrias/inmobiliarias` |
| Métricas | `/caracteristicas` |

## Estructura ideal de la home

### 1. Hero directo

- Título: `TalIA convierte chats en ventas`
- Subtítulo: `TalIA encuentra prospectos, responde por WhatsApp con IA, organiza el CRM y da seguimiento hasta cerrar.`
- CTAs:
  - `Hablar por WhatsApp`
  - `Ver cómo funciona`

### 2. Problema

- Los prospectos llegan por WhatsApp, formularios, redes o llamadas.
- Si no hay respuesta rápida, el lead se enfría.
- TalIA centraliza y automatiza el seguimiento.

### 3. Cómo funciona

El flujo debe leerse en pasos, no como lista técnica:

1. Encuentra prospectos.
2. Inicia conversaciones.
3. Responde con IA.
4. Organiza en CRM.
5. Da seguimiento.

### 4. Funciones

Aquí se explica qué trae TalIA, pero siempre como beneficio:

- CRM con IA para WhatsApp.
- Asistente IA para empresas.
- Automatización de procesos.
- Seguimiento de ventas.
- Ventas e inventarios.
- Agendas, cotizaciones, notas y tareas.
- Buscar contactos Web / Google / Gob-MX.
- Campañas de Email / WhatsApp.
- Gestión inmobiliaria.
- Métricas.

### 5. Casos de uso

Aquí se explica qué problema resuelve:

- Responder más rápido.
- Conseguir prospectos.
- Automatizar seguimiento.
- Organizar ventas.
- Agendar citas.
- Cotizar más rápido.
- Recuperar leads fríos.

### 6. Industrias

Aquí se aterriza por tipo de negocio:

- Inmobiliarias.
- Servicios.
- Negocios locales.
- Ventas B2B.
- Turismo.

### 7. Precio

El precio debe verse con claridad.

Mensaje base:

- `Desde $700 MXN + IVA al mes pagando anual por 5 licencias.`

### 8. Cierre

La home debe cerrar con una idea simple:

> TalIA toma un prospecto desde que entra hasta que está listo para cerrar.

## Arquitectura SEO

Las páginas SEO no deben competir con la home.

La home vende.
Las páginas SEO posicionan.

Las URLs ya existentes son la base canónica del sitio.
No se propone renombrar las vistas publicadas, solo alinear el resto del sistema a ellas.

### Página pilar

- `/crm-con-ia-para-whatsapp`

Esta es la URL más fuerte para intención comercial porque junta:

- CRM
- IA
- WhatsApp
- ventas
- seguimiento

### Páginas satélite

- `/que-es-talia`
- `/caracteristicas`
- `/asistente-ia-empresas`
- `/ia-de-whatsapp`
- `/ia-para-ventas`
- `/automatizacion-de-ventas`
- `/seguimiento-ventas`
- `/agenda-y-cotizaciones`
- `/prospeccion-comercial`
- `/buscar-contactos`
- `/campanas-marketing`
- `/industrias/inmobiliarias`
- `/industrias/servicios`
- `/industrias/negocios-locales`
- `/industrias/ventas-b2b`
- `/industrias/turismo`

### Criterio de contenido

- Cada página debe resolver una intención concreta.
- No repetir la misma explicación de `TalIA` en todas.
- No usar `Producto` y `Soluciones` como si fueran categorías distintas cuando hablan de lo mismo.
- Evitar párrafos largos en la parte alta.
- Cerrar cada página con 3 o 4 enlaces relacionados.

## Orden recomendado del menú SEO

### Producto

- Qué es TalIA
- CRM con IA para WhatsApp
- Asistente IA para empresas
- Características

### Funciones

- CRM con IA para WhatsApp
- Asistente IA para empresas
- Automatización de procesos
- Seguimiento de ventas
- Ventas e inventarios
- Agendas, cotizaciones, notas y tareas
- Buscar contactos Web / Google / Gob-MX
- Campañas de Email / WhatsApp
- Gestión inmobiliaria
- Métricas

### Casos de uso

- Conseguir prospectos
- Responder más rápido
- Automatizar seguimiento
- Organizar ventas
- Agendar citas
- Cotizar más rápido
- Recuperar leads fríos

### Industrias

- Inmobiliarias
- Servicios
- Negocios locales
- Ventas B2B
- Turismo

## Mapa SEO base

Cada página debe tener una sola intención principal. La siguiente tabla sirve como referencia de implementación para títulos, H1, descripción y CTA.

| Página | `title` | `H1` | `meta description` | CTA principal |
|---|---|---|---|---|
| Inicio | `TalIA | CRM con IA para vender por WhatsApp` | `TalIA convierte chats en ventas` | `TalIA encuentra prospectos, responde por WhatsApp con IA, organiza tu CRM y da seguimiento hasta convertir conversaciones en ventas.` | `Hablar por WhatsApp` |
| Qué es TalIA | `Qué es TalIA | CRM con IA para WhatsApp` | `Qué es TalIA y cómo ayuda a vender por WhatsApp` | `TalIA es un CRM con IA para WhatsApp que ayuda a responder prospectos, organizarlos y darles seguimiento.` | `Quiero una demo` |
| CRM con IA para WhatsApp | `CRM con IA para WhatsApp | TalIA` | `Cómo vender por WhatsApp con CRM e IA` | `TalIA centraliza chats, organiza leads y automatiza el seguimiento comercial por WhatsApp.` | `Ver demo` |
| Asistente IA para empresas | `Asistente IA para empresas | TalIA` | `Asistente IA para atender prospectos y calificar oportunidades` | `TalIA ayuda a responder, preguntar, registrar datos y pasar prospectos al equipo comercial.` | `Pedir demo` |
| Automatización de procesos | `Automatización de procesos | TalIA` | `Automatiza procesos comerciales sin perder control` | `TalIA automatiza tareas repetitivas para acelerar respuesta, orden y seguimiento comercial.` | `Ver cómo funciona` |
| Seguimiento de ventas | `Seguimiento de ventas | TalIA` | `Cómo no perder prospectos en el seguimiento comercial` | `TalIA ordena el seguimiento de ventas con recordatorios, tareas y control de oportunidades.` | `Ver seguimiento` |
| Ventas e inventarios | `Ventas e inventarios | TalIA` | `Conecta ventas e inventario en un solo flujo` | `TalIA ayuda a coordinar ventas, disponibilidad y control operativo desde un mismo lugar.` | `Ver gestión` |
| Agendas, cotizaciones, notas y tareas | `Agendas, cotizaciones y tareas | TalIA` | `Cómo organizar citas, cotizaciones y pendientes` | `TalIA centraliza citas, cotizaciones, notas y tareas para dar mejor seguimiento comercial.` | `Ver agenda` |
| Buscar contactos Web / Google / Gob-MX | `Buscar contactos para ventas | TalIA` | `Cómo conseguir prospectos desde web, Google y Gob-MX` | `TalIA ayuda a encontrar contactos útiles para ventas y convertir búsquedas en prospectos trabajables.` | `Buscar contactos` |
| Campañas de Email / WhatsApp | `Campañas de Email y WhatsApp | TalIA` | `Cómo activar y reactivar prospectos con campañas` | `TalIA permite enviar campañas comerciales por email y WhatsApp para mover leads fríos o generar respuesta.` | `Ver campañas` |
| Gestión inmobiliaria | `Gestión inmobiliaria con IA | TalIA` | `Cómo vender mejor en inmobiliarias con IA` | `TalIA ayuda a inmobiliarias a responder leads, agendar citas y dar seguimiento comercial.` | `Ver inmobiliario` |
| Métricas | `Métricas comerciales | TalIA` | `Cómo medir ventas, seguimiento y conversión` | `TalIA muestra métricas útiles para entender respuesta, seguimiento y avance comercial.` | `Ver métricas` |
| Industrias | `Industrias | TalIA` | `TalIA por industria` | `TalIA se adapta a inmobiliarias, servicios, negocios locales, ventas B2B y turismo.` | `Elegir sector` |
| Inmobiliario | `IA para inmobiliario | TalIA` | `Cómo ayuda TalIA a inmobiliarias` | `TalIA responde leads inmobiliarios, agenda citas y mejora el seguimiento comercial.` | `Ver demo inmobiliaria` |
| Servicios | `IA para servicios | TalIA` | `Cómo ayuda TalIA a negocios de servicios` | `TalIA ayuda a servicios a responder, cotizar y dar seguimiento sin perder oportunidades.` | `Ver servicios` |
| Negocios locales | `IA para negocios locales | TalIA` | `Cómo ayuda TalIA a negocios locales` | `TalIA ayuda a negocios locales a contestar rápido, organizar prospectos y vender más.` | `Ver negocio local` |
| Ventas B2B | `IA para ventas B2B | TalIA` | `Cómo ayuda TalIA a ventas B2B` | `TalIA ordena prospección, seguimiento y priorización de oportunidades en ventas B2B.` | `Ver B2B` |
| Turismo | `IA para turismo | TalIA` | `Cómo ayuda TalIA a turismo y reservas` | `TalIA ayuda a turismo a responder consultas, cotizar reservas y dar seguimiento comercial.` | `Ver turismo` |
| Características | `Características CRM con IA | TalIA` | `Qué incluye TalIA y cómo se usa` | `TalIA reúne funciones clave para atender leads, organizar ventas y automatizar seguimiento.` | `Ver características` |
| Precios | `Precios | CRM con IA para WhatsApp | TalIA` | `Planes de TalIA y qué incluye cada uno` | `Conoce los precios de TalIA y elige el plan que mejor se adapta a tu operación comercial.` | `Ver precios` |

## Recomendación de implementación

1. Simplificar la `home` primero.
2. Ajustar la jerarquía de navegación.
3. Mantener las páginas SEO como biblioteca de apoyo.
4. Reducir repetición en títulos, subtítulos y bloques introductorios.
5. Hacer que cada URL tenga una sola intención principal.

## Idea de arquitectura de vistas

Documento base: [Arquitectura de vistas](./ARQUITECTURA_VISTAS.md)

El sitio no debe depender de una sola plantilla larga para todas las páginas internas.

Si todas las vistas nacen del mismo bloque de `hero + stats + panel + enlaces + FAQ + CTA + secciones extra`, el resultado es repetición visual y exceso de texto.

### Principio

Cada tipo de página debe tener una estructura propia según su intención:

- `Home`
- `Pilar`
- `Solución`
- `Industria`
- `Precio`

### Qué cambia

- La estructura ya no se define solo por contenido.
- La estructura se define por función comercial.
- El contenido debe adaptarse al formato, no al revés.

### Reglas de longitud

- Máximo 3 a 5 secciones por página interna.
- Una sola idea principal por página.
- Un CTA dominante.
- Texto corto arriba, detalle solo si aporta decisión.
- Si una página necesita demasiada explicación, debe dividirse en dos.

### Estructura sugerida por tipo

#### Home

- Hero corto.
- Qué es TalIA en una línea.
- Flujo comercial en pocos pasos.
- Funciones principales.
- Industrias.
- Precio.
- Cierre con demo.

#### Página pilar

- Hero directo.
- Qué resuelve.
- Cómo funciona.
- 3 beneficios.
- CTA final.

#### Página de solución

- Hero corto.
- Problema.
- Solución.
- Resultado.
- 3 usos o beneficios.
- CTA final.

#### Página de industria

- Hero por sector.
- Caso real.
- Qué cambia en esa industria.
- 3 beneficios concretos.
- CTA final.

#### Página de precio

- Hero simple.
- Planes o referencia de precio.
- Qué incluye.
- Qué problema resuelve.
- CTA de conversión.

### Qué evitar

- Plantillas idénticas con títulos cambiados.
- Secciones editoriales que explican cómo leer la página.
- Bloques largos para cubrir SEO sin intención real.
- Repetir el mismo mensaje en todas las vistas.
- Hacer que la página parezca un documento interno.

### Recomendación práctica

- Mantener el generador JS solo como ayuda para páginas repetitivas o satélite.
- Las páginas más importantes deben poder variar en estructura.
- El contenido SEO debe ser corto, claro y distinto por intención.
- La home y las páginas clave deben sentirse diseñadas una por una, no clonadas.

## Criterio de terminado

La refactorización queda bien cuando:

- La home se entiende en menos de 5 segundos.
- El usuario puede decir qué hace TalIA sin leer demasiado.
- `Producto` y `Soluciones` dejan de pisarse.
- SEO sigue cubierto sin convertir la home en un catálogo largo.
- Las páginas internas ya no parecen copias con títulos distintos.
