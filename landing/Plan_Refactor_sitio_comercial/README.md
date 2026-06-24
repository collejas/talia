# Plan de refactor del sitio comercial

Base de trabajo para la landing y las páginas SEO del sitio comercial de TalIA.

## Objetivo

Mantener la `landing/home` simple y comercial, y por debajo construir páginas SEO claras, rastreables y bien enlazadas.

La navegación visible debe ser:

- Inicio
- Producto
- Soluciones
- Prospección
- Industrias
- Precios

Cada botón principal puede abrir un dropdown o una vista agrupada, pero el texto del enlace debe ser explícito para usuarios y buscadores.

## Principios

- La home vende.
- Las subpáginas posicionan.
- Cada URL debe tener una intención de búsqueda clara.
- El texto del enlace debe describir la página destino.
- Evitar páginas duplicadas con el mismo enfoque.
- Cada página debe enlazar a 3 o 4 páginas relacionadas al final.

## Mapa del sitio

```txt
/
├── que-es-talia
├── caracteristicas
├── crm-con-ia-para-whatsapp
├── asistente-ia-empresas
├── ia-de-whatsapp
├── ia-para-ventas
├── automatizacion-de-ventas
├── seguimiento-ventas
├── agenda-y-cotizaciones
├── prospeccion-comercial
├── buscar-contactos
├── prospectos-google-denue
├── campanas-marketing
├── precios
└── industrias/
    ├── inmobiliarias
    ├── servicios
    ├── negocios-locales
    ├── ventas-b2b
    └── turismo
```

## URLs canónicas

Estas son las rutas públicas que deben quedar visibles y enlazadas en el sitio:

- `/`
- `/que-es-talia`
- `/caracteristicas`
- `/crm-con-ia-para-whatsapp`
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
- `/precios`
- `/industrias`
- `/industrias/inmobiliarias`
- `/industrias/servicios`
- `/industrias/negocios-locales`
- `/industrias/ventas-b2b`
- `/industrias/turismo`

### Dominio canónico

- Canonical público: `https://talia.mx`
- Alias que deben redirigir a `https://talia.mx`:
  - `https://www.talia.mx`
  - `https://tal-ia.mx`
  - `https://www.tal-ia.mx`

### Variantes que deben redirigir

- `/caracteristicas.html` -> `/caracteristicas`
- `/caracteristicas/` -> `/caracteristicas`
- `/que-es-talia.html` -> `/que-es-talia`
- `/que-es-talia/` -> `/que-es-talia`
- `/crm-con-ia-para-whatsapp.html` -> `/crm-con-ia-para-whatsapp`
- `/crm-con-ia-para-whatsapp/` -> `/crm-con-ia-para-whatsapp`
- `/asistente-ia-empresas.html` -> `/asistente-ia-empresas`
- `/asistente-ia-empresas/` -> `/asistente-ia-empresas`
- `/ia-de-whatsapp.html` -> `/ia-de-whatsapp`
- `/ia-de-whatsapp/` -> `/ia-de-whatsapp`
- `/ia-para-ventas.html` -> `/ia-para-ventas`
- `/ia-para-ventas/` -> `/ia-para-ventas`
- `/automatizacion-de-ventas.html` -> `/automatizacion-de-ventas`
- `/automatizacion-de-ventas/` -> `/automatizacion-de-ventas`
- `/seguimiento-ventas.html` -> `/seguimiento-ventas`
- `/seguimiento-ventas/` -> `/seguimiento-ventas`
- `/agenda-y-cotizaciones.html` -> `/agenda-y-cotizaciones`
- `/agenda-y-cotizaciones/` -> `/agenda-y-cotizaciones`
- `/prospeccion-comercial.html` -> `/prospeccion-comercial`
- `/prospeccion-comercial/` -> `/prospeccion-comercial`
- `/buscar-contactos.html` -> `/buscar-contactos`
- `/buscar-contactos/` -> `/buscar-contactos`
- `/prospectos-google-denue.html` -> `/prospectos-google-denue`
- `/prospectos-google-denue/` -> `/prospectos-google-denue`
- `/campanas-marketing.html` -> `/campanas-marketing`
- `/campanas-marketing/` -> `/campanas-marketing`
- `/precios/` -> `/precios`
- `/precios/index` -> `/precios`
- `/precios/index.html` -> `/precios`
- `/industrias/` -> `/industrias`
- `/industrias/index` -> `/industrias`
- `/industrias/index.html` -> `/industrias`
- `/industrias/inmobiliarias/` -> `/industrias/inmobiliarias`
- `/industrias/servicios/` -> `/industrias/servicios`
- `/industrias/negocios-locales/` -> `/industrias/negocios-locales`
- `/industrias/ventas-b2b/` -> `/industrias/ventas-b2b`
- `/industrias/turismo/` -> `/industrias/turismo`

## Inicio

- URL: `/`
- Keyword principal: `TalIA`
- Keywords secundarias:
  - `CRM con IA`
  - `IA de WhatsApp`
  - `Prospección con IA`
  - `IA para ventas`
- Headline:
  - `TalIA convierte prospectos en ventas`
- Objetivo:
  - Explicar rápido qué hace TalIA.
  - Llevar al usuario a pedir demo.
  - No intentar posicionar demasiadas keywords en una sola página.

## Producto

### Orden recomendado en menú

- Qué es TalIA
- CRM con IA para WhatsApp
- Asistente IA para empresas
- Características

### Páginas

| Página | URL | Keyword principal | Keywords secundarias |
| --- | --- | --- | --- |
| Qué es TalIA | `/que-es-talia` | qué es TalIA | CRM con IA, asistente IA comercial |
| Características | `/caracteristicas` | características CRM con IA | IA WhatsApp, prospección, marketing, seguimiento |
| CRM con IA para WhatsApp | `/crm-con-ia-para-whatsapp` | CRM con IA para WhatsApp | CRM WhatsApp, IA de WhatsApp, CRM con IA |
| Asistente IA para empresas | `/asistente-ia-empresas` | Asistente IA | asistente IA para empresas, asistente virtual con IA |

### Vista más importante

- `/crm-con-ia-para-whatsapp`

Motivo:

- Une la categoría completa.
- Tiene la combinación más fuerte de intención comercial:
  - CRM
  - IA
  - WhatsApp
  - ventas
  - seguimiento

## Soluciones

### Orden recomendado en menú

- IA de WhatsApp
- IA para ventas
- Automatización de ventas
- Seguimiento de ventas
- Agenda y cotizaciones

### Páginas

| Página | URL | Keyword principal | Keywords secundarias |
| --- | --- | --- | --- |
| IA de WhatsApp | `/ia-de-whatsapp` | IA de WhatsApp | IA para WhatsApp, WhatsApp con IA |
| IA para ventas | `/ia-para-ventas` | IA ventas | IA para ventas, inteligencia artificial ventas |
| Automatización de ventas | `/automatizacion-de-ventas` | automatización de ventas | automatizar ventas, ventas con IA |
| Seguimiento de ventas | `/seguimiento-ventas` | seguimiento ventas | seguimiento de prospectos, seguimiento comercial |
| Agenda y cotizaciones | `/agenda-y-cotizaciones` | agenda y cotizaciones | cotizaciones WhatsApp, agendar citas WhatsApp |

### Vista más importante

- `/ia-de-whatsapp`

### Criterio SEO recomendado

No crear una página separada para `IA para WhatsApp` al inicio.

La keyword debe vivir dentro de `/ia-de-whatsapp`.

Ejemplo de enfoque:

- Title SEO: `IA de WhatsApp para empresas | TalIA`
- H1: `IA de WhatsApp para responder, calificar y dar seguimiento`
- Texto clave:
  - TalIA funciona como una IA para WhatsApp que atiende conversaciones, pide datos, responde dudas y conecta al prospecto con tu CRM.

Así se cubren:

- `IA de WhatsApp`
- `IA para WhatsApp`
- `WhatsApp con IA`

sin duplicar contenido.

## Prospección

### Orden recomendado en menú

- Prospección comercial
- Buscar contactos
- Prospectos en Google y DENUE
- Campañas y marketing

### Páginas

| Página | URL | Keyword principal | Keywords secundarias |
| --- | --- | --- | --- |
| Prospección comercial | `/prospeccion-comercial` | prospección | prospección comercial, prospección con IA |
| Buscar contactos | `/buscar-contactos` | buscar contactos | buscar contactos para ventas, encontrar prospectos |
| Prospectos en Google y DENUE | `/prospectos-google-denue` | buscar prospectos en Google | DENUE, contactos de empresas, directorio comercial |
| Campañas y marketing | `/campanas-marketing` | marketing con IA | campañas por WhatsApp, campañas email, tracking |
| Reactivación de prospectos | `/reactivacion-prospectos` | reactivar prospectos | leads fríos, seguimiento automático |

### Vistas más importantes

- `/prospeccion-comercial`
- `/buscar-contactos`

## Industrias

### Orden recomendado en menú

- Inmobiliarias
- Servicios
- Negocios locales
- Ventas B2B
- Turismo

### Páginas

| Página | URL | Keyword principal | Keywords secundarias |
| --- | --- | --- | --- |
| Inmobiliarias | `/industrias/inmobiliarias` | IA para inmobiliarias | CRM inmobiliario, WhatsApp inmobiliarias |
| Servicios | `/industrias/servicios` | IA para servicios | cotizaciones, agenda, atención WhatsApp |
| Negocios locales | `/industrias/negocios-locales` | IA para negocios locales | WhatsApp negocios, atención automática |
| Ventas B2B | `/industrias/ventas-b2b` | IA para ventas B2B | prospección B2B, seguimiento comercial |
| Turismo | `/industrias/turismo` | IA para turismo | reservas WhatsApp, cotización viajes |

### Vista más importante

- `/industrias/inmobiliarias`

## Precios

- URL: `/precios`
- Keyword principal: `precios TalIA`
- Keywords secundarias:
  - `CRM con IA precio`
  - `IA WhatsApp precio`
  - `automatización WhatsApp precio`
- Objetivo:
  - Conversión.
  - No sobrecargar esta página con demasiada densidad SEO.
  - Debe ser clara, comercial y orientada a decisión.

## Prioridad de implementación

### Fase 1

1. `/`
2. `/ia-de-whatsapp`
3. `/prospeccion-comercial`
4. `/buscar-contactos`
5. `/ia-para-ventas`
6. `/seguimiento-ventas`
7. `/crm-con-ia-para-whatsapp`
8. `/industrias/inmobiliarias`
9. `/caracteristicas`
10. `/precios`

### Fase 2

- `/asistente-ia-empresas`
- `/automatizacion-de-ventas`
- `/agenda-y-cotizaciones`
- `/prospectos-google-denue`
- `/campanas-marketing`
- `/industrias/servicios`
- `/industrias/negocios-locales`
- `/industrias/ventas-b2b`
- `/industrias/turismo`

## Regla de enlaces internos

Cada página debe incluir al final una sección como:

```txt
También te puede interesar:
- CRM con IA para WhatsApp
- IA para ventas
- Seguimiento de ventas
```

Esto ayuda a:

- Guiar al usuario.
- Aumentar rastreabilidad.
- Fortalecer la relación semántica entre páginas.

## Menú visible

La navegación principal debe mantenerse simple:

`Inicio | Producto | Soluciones | Prospección | Industrias | Precios`

## Nota operativa

La `landing/home` no debe intentar posicionar todo.
Debe vender claro, con una sola promesa principal.

Las páginas internas son las que deben capturar búsquedas específicas y distribuir la intención SEO por tema.
