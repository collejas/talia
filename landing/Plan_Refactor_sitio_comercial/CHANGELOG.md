# Changelog del refactor de la landing

Registro de avances del refactor de `talia.mx`.

## Como usar este archivo

- Anotar cada avance importante en orden cronologico.
- Incluir fecha, cambio realizado, alcance y nota breve.
- Registrar solo decisiones o avances que afecten la estructura, el copy, el SEO o la visual.

## 2026-08-04

### Avance reciente

- Se reordeno la home para que el hero derecho represente correctamente los 4 modulos del flujo:
  - Prospeccion
  - Marketing
  - Agente IA
  - CRM
- Se movio `Tal-IA Automatiza` al circulo central del hero y se elimino el quinto modulo visual como tarjeta separada.
- Se ajusto el subtitulo principal de la home para incluir envios masivos por correo y WhatsApp.
- Se redujo la altura del contenedor derecho del hero y se corrigio la distribucion de las tarjetas alrededor del circulo.
- Se unifico el header de las vistas nuevas de prospeccion con el header general de la landing.
- Se corrigio el header de `lp/prospeccion` para que el boton `Hablar por WhatsApp` permanezca alineado en una sola linea como en la home.
- Se ajusto el ancho del contenedor de `lp/prospeccion` para evitar que el CTA del header se parta en pantallas intermedias.
- Se corrigio el enlace `Inicio` en las vistas de `lp/prospeccion` para que apunte al home real y no a un ancla local.
- Se mejoraron las vistas de:
  - `/lp/prospeccion/google`
  - `/lp/prospeccion/gob-mx`
  - `/lp/prospeccion/webscraper`
  - `/lp/prospeccion/buscar-contactos`
- Se alinearon los datos visibles por fuente:
  - Google: nombre comercial, direccion, ubicacion, telefono, sitio web/Facebook y calificacion.
  - Gob-MX: razon social, nombre comercial, direccion, ubicacion, telefono, correo, sitio web, tamano de la empresa y calificacion.
  - Web Scraper: correo electronico visible.
- Se actualizo `buscar-contactos` para explicar que combina Google y Gob-MX y para reflejar los campos reales que alimentan la lista comercial.
- Se hizo una segunda limpieza de enlaces legacy en paginas heredadas, video demostrativo y generadores internos para evitar que siguieran reapareciendo rutas retiradas.
- Se ajustaron los `canonical` y `og:url` de las paginas legacy retiradas para que apunten al home o a la ruta vigente en el caso de `buscar-contactos`.
- Se verifico que las paginas conservadas de prospeccion sigan canonizando hacia `/lp/prospeccion/...` y no a los aliases viejos.
- Se creo la nueva familia de marketing con vista madre `/marketing` y vistas hijas `/marketing/email` y `/marketing/whatsapp`.
- Se separo el mensaje de marketing saliente entre correo y WhatsApp, dejando la atención conversacional para Agente IA.

### Agregado

- Se definio una estructura objetivo para la landing basada en:
  - HOME
  - QUÉ ES TAL-IA
  - PROSPECCIÓN
  - MARKETING
  - AGENTE IA
  - CRM
  - INDUSTRIAS
  - AUTOMATIZACION
  - video-demostracion-inmobiliarias
  - PRECIOS
  - DEMO
- Se separaron vistas que se mantienen, vistas nuevas a crear y secciones internas sin URL propia.
- Se identificaron vistas que salen del arbol objetivo del plan.
- Se ajusto la arquitectura de prospeccion para incluir `/lp/prospeccion` como pagina padre de la landing y rutas hijas para `google`, `gob-mx`, `buscar-contactos` y `webscraper`.
- Se dejo `/lp/prospeccion/buscar-contactos` como ruta canónica de la landing y se saco `/buscar-contactos` del sitemap y de los enlaces internos del sitio.
- Se agrego `/lp/prospeccion/webscraper` como nueva ruta hija para completar la fuente Web Scraper dentro de prospección.

### Nota

- El documento base sigue siendo `PLAN LANDING.md`.
- Este changelog registra avances del refactor, no sustituye la directriz principal.
