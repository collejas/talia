# Plan de refactor del sitio comercial

Base de trabajo para la landing y las páginas SEO del sitio comercial de TalIA.

## Objetivo

Separar con claridad dos cosas distintas:

- La `home`, que debe vender en pocos segundos.
- Las páginas SEO, que deben responder búsquedas concretas sin ensuciar el mensaje principal.

La narrativa central del sitio debe ser esta:

> TalIA te ayuda a conseguir prospectos, atenderlos por WhatsApp con IA y darles seguimiento en un CRM hasta convertirlos en ventas.

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
- Cómo funciona
- Funciones
- Casos de uso
- Industrias
- Precios
- Agenda una demo

Los grupos internos pueden seguir existiendo para SEO, pero no deben dominar la navegación principal.

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

- IA para WhatsApp.
- CRM de ventas.
- Prospección de contactos.
- Agenda y cotizaciones.
- Campañas y seguimiento.

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
- `/prospectos-google-denue`
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

- IA de WhatsApp
- IA para ventas
- Automatización de ventas
- Seguimiento de ventas
- Agenda y cotizaciones

### Casos de uso

- Prospección comercial
- Buscar contactos
- Prospectos Google y DENUE
- Campañas y marketing

### Industrias

- Ver industrias
- Inmobiliarias
- Servicios
- Negocios locales
- Ventas B2B
- Turismo

## Recomendación de implementación

1. Simplificar la `home` primero.
2. Ajustar la jerarquía de navegación.
3. Mantener las páginas SEO como biblioteca de apoyo.
4. Reducir repetición en títulos, subtítulos y bloques introductorios.
5. Hacer que cada URL tenga una sola intención principal.

## Criterio de terminado

La refactorización queda bien cuando:

- La home se entiende en menos de 5 segundos.
- El usuario puede decir qué hace TalIA sin leer demasiado.
- `Producto` y `Soluciones` dejan de pisarse.
- SEO sigue cubierto sin convertir la home en un catálogo largo.
