# Plan de experiencia · Mapa de Conversión Multicanal

Fecha: 2026-06-27
Ruta: `docs/Plan_mapa_conversion/plan_mapa_conversion_multicanal.md`

Este documento alimenta el backlog maestro:

- `backlog_maestro_mapa_conversion.md`

Y se registra en el changelog maestro:

- `changelog_maestro_mapa_conversion.md`

## 1) Objetivo

Convertir `mapa-de-conversion` en una vista multicanal entendible para usuario operativo, sin mezclar fuentes distintas de adquisición y conversación.

La vista debe responder claramente:

- de dónde vino el tráfico web,
- qué campañas o CTAs generaron conversaciones,
- qué conversaciones terminaron en oportunidad o venta,
- qué datos pertenecen a web, WhatsApp, campañas de prospección o UTM.

## 2) Decisión de producto

No se va a forzar una sola fuente de verdad para todas las campañas.

Se mantiene separado:

- `CTA de WhatsApp`: frases o botones que abren WhatsApp con una frase específica.
- `Campañas de prospección`: envíos hechos desde la app.
- `UTM web`: etiquetas de tráfico web desde anuncios, links o medios externos.

Lo que sí se unifica es la lectura visual dentro de `mapa-de-conversion`.

## 3) Problema a resolver

Hoy el mapa es potente, pero puede ser ambiguo para el usuario:

- muestra tráfico web de múltiples orígenes,
- muestra conversaciones de WhatsApp,
- muestra atribución por canal,
- muestra campañas y fuentes,
- y todo eso convive en una sola pantalla.

Sin una guía clara, el usuario puede interpretar métricas distintas como si fueran una sola cosa.

## 4) Principio rector

La vista no debe intentar contar una sola historia.

Debe funcionar como un mapa de lectura multicanal con tres niveles:

1. `Tráfico`
2. `Conversación`
3. `Campaña / Atribución`

Cada bloque conserva su propia semántica, pero la pantalla completa explica cómo se relacionan.

## 5) Modelo de lectura de la vista

### 5.1 Qué representa el mapa

El mapa representa ubicación y rendimiento por origen de interacción.

Puede contener:

- sesiones web,
- referrers,
- UTM,
- conversaciones WhatsApp,
- conversaciones de voz,
- atribución por CTA de WhatsApp,
- campañas enviadas desde la app,
- conversiones ligadas a oportunidades.

### 5.2 Qué NO representa

El mapa no debe confundirse con:

- un dashboard exclusivo de campañas enviadas,
- un reporte exclusivo de UTM,
- un reporte exclusivo de WhatsApp,
- ni una vista de pipeline puro.

## 6) Estructura propuesta de la vista

### 6.1 Encabezado de contexto

Agregar una frase corta debajo del título principal:

- “Esta vista combina tráfico web, conversaciones y atribución por campaña.”

Agregar una ayuda breve de lectura:

- `UTM web` = origen del tráfico
- `WhatsApp` = conversaciones y CTA
- `Prospección` = envíos realizados desde la app

### 6.2 Capas o modos de lectura

El mapa debe permitir cambiar el foco sin cambiar la vista completa:

- `Todo`
- `Tráfico web`
- `WhatsApp`
- `Campañas`
- `Conversiones`

El usuario sigue dentro del mismo mapa, pero cambia el contexto de interpretación.

### 6.3 Bloques fijos de contenido

La pantalla debe conservar bloques separados y consistentes:

- `Mapa`
- `Resumen general`
- `Visitas web`
- `Conversaciones`
- `Fuentes y campañas`
- `WhatsApp por canal`

## 7) Definición de cada bloque

### 7.1 Mapa

Debe mostrar geodatos agregados por ubicación.

Puede combinar varios tipos de origen, pero el tooltip debe dejar claro:

- qué dato está mostrando,
- de qué fuente proviene,
- y si corresponde a tráfico o conversación.

### 7.2 Resumen general

Debe responder:

- cuántas visitas hubo,
- cuántas conversaciones hubo,
- cuántas conversiones se atribuyen,
- cuál fue el rendimiento general.

### 7.3 Visitas web

Debe mostrar:

- sesiones,
- referrers,
- tipo de visita,
- conversiones ligadas a contacto o conversación cuando aplique.

### 7.4 Conversaciones

Debe mostrar:

- conversaciones WhatsApp,
- conversaciones de voz si existen,
- conversación vinculada a origen/CTA/campaña cuando el sistema lo tenga.

### 7.5 Fuentes y campañas

Debe mostrar:

- `utm_source`
- `utm_medium`
- `utm_campaign`

Su función es explicar el rendimiento del tráfico web etiquetado.

### 7.6 WhatsApp por canal

Debe mostrar:

- canal publicitario,
- campaña publicitaria,
- regla o CTA que hizo match,
- conversaciones atribuidas a WhatsApp.

## 8) Diferencia entre fuentes

La vista debe evitar mezclar estos conceptos:

- `Fuentes y campañas` no es igual a `WhatsApp por canal`.
- `WhatsApp por canal` no es igual a `Campañas de prospección`.
- `Campañas de prospección` no es igual a `UTM web`.

Lo que sí comparten es que forman parte del análisis de adquisición.

## 9) Reglas de UX

### 9.1 Mostrar intención desde el inicio

La pantalla no debe parecer vacía.

Debe mostrar desde el primer render:

- títulos,
- subtítulos,
- estructura de bloques,
- placeholders de carga.

### 9.2 No mezclar sin etiqueta

Cada tarjeta debe decir explícitamente qué mide.

Ejemplos:

- `Origen de tráfico web`
- `Conversaciones atribuidas`
- `Campañas enviadas`
- `CTA de WhatsApp`

### 9.3 Mantener consistencia visual

Cada bloque debe usar:

- mismo patrón de estado vacío,
- mismo patrón de carga,
- mismo patrón de totales,
- misma jerarquía visual.

## 10) Tooltip del mapa

El tooltip debe adaptarse al tipo de dato visible.

Debe poder mostrar:

- tráfico web por país/estado/municipio,
- conversaciones WhatsApp por ubicación,
- atribución de WhatsApp por canal,
- referencia de CTA o campaña cuando exista.

Regla:

- si el dato viene de UTM, el tooltip habla de UTM;
- si el dato viene de WhatsApp, el tooltip habla de conversación y canal;
- si el dato viene de campaña enviada, el tooltip habla de campaña y rendimiento.

## 11) Backend requerido

### 11.1 Mantener fuentes separadas

No consolidar todo en una sola tabla artificial.

Se mantienen las fuentes de negocio:

- `web_sessions`
- `conversaciones`
- `prospeccion_whatsapp_atribucion_eventos`
- `campanas`
- `webchat`

### 11.2 Unificar solo la lectura

El backend debe construir un dataset común para el mapa, con etiquetas claras por fuente:

- `traffic_web`
- `conversation_channels`
- `whatsapp_atribucion`
- `utm_campaign_labels`
- `campana_options`

### 11.3 Mantener compatibilidad

No romper:

- tooltip actual del mapa,
- tablas `Visitas web` y `Conversaciones`,
- filtros de atribución ya existentes,
- correcciones ya aplicadas de `contactos/personas`.

## 12) Frontend requerido

### 12.1 Estructura de lectura

La vista debe incluir una guía corta al usuario.

### 12.2 Segmentación visual

Debe verse claro qué pertenece a:

- tráfico web,
- conversación WhatsApp,
- campañas enviadas,
- atribución CTA.

### 12.3 Estados de carga

Debe mostrarse:

- skeletons,
- títulos desde el inicio,
- placeholders por bloque,
- carga incremental de tablas.

## 13) Métricas esperadas

La vista debe poder responder, sin ambigüedad:

- de dónde vino el tráfico,
- qué CTA o campaña generó la conversación,
- qué conversación terminó en contacto,
- qué campaña tuvo mejor rendimiento,
- qué geografía concentra mejor desempeño.

## 14) Riesgos

- Mezclar fuentes distintas en un solo bloque sin etiquetado.
- Hacer que el tooltip sugiera un significado incorrecto.
- Forzar una taxonomía única antes de necesitarla.
- Perder claridad al intentar mostrar demasiada información en una sola tarjeta.

## 15) Recomendación de implementación

Orden sugerido:

1. Definir la narrativa visual de la vista.
2. Mantener bloques separados y titulados.
3. Ajustar tooltips según la fuente visible.
4. Mejorar estados vacíos y de carga.
5. Validar con datos reales que el usuario entienda cada bloque.

## 16) Criterio de éxito

Se considera bien resuelta la vista cuando:

- el usuario entiende que es un mapa multicanal,
- no confunde UTM con WhatsApp ni campañas enviadas,
- cada bloque explica qué mide,
- el tooltip cambia según la fuente,
- no se rompe la lectura operativa ni la consistencia del dashboard.

## 17) Backlog de implementación

### Fase 1 · Narrativa y semántica visual

Objetivo:

- hacer que el usuario entienda de inmediato qué está viendo.

Tareas:

- Agregar un copy breve de contexto debajo del título principal.
- Mostrar etiquetas de lectura para `Tráfico`, `Conversación` y `Campaña / Atribución`.
- Renombrar bloques para que indiquen con precisión qué miden.
- Definir estados vacíos específicos por bloque.

Entrega esperada:

- La pantalla explica su propósito sin depender del tooltip.

### Fase 2 · Tooltip multicanal

Objetivo:

- adaptar el tooltip al tipo de dato visible.

Tareas:

- Mostrar UTM cuando el dato provenga de tráfico web.
- Mostrar canal/campaña/regla cuando el dato provenga de WhatsApp.
- Mostrar campaña y rendimiento cuando el dato provenga de prospección.
- Evitar textos genéricos que mezclen fuentes distintas.

Entrega esperada:

- El tooltip cambia de significado según la capa o bloque activo.

### Fase 3 · Separación visual por bloques

Objetivo:

- mantener una vista única, pero con bloques que no se pisan semánticamente.

Tareas:

- Mantener tarjetas separadas para:
  - `Mapa`
  - `Resumen general`
  - `Visitas web`
  - `Conversaciones`
  - `Fuentes y campañas`
  - `WhatsApp por canal`
- Asegurar que cada bloque use labels, subtítulos y métricas coherentes.
- Evitar reutilizar el mismo título para fuentes distintas.

Entrega esperada:

- Cada bloque puede interpretarse por separado sin perder contexto global.

### Fase 4 · Modo de lectura del mapa

Objetivo:

- permitir cambiar el foco sin cambiar de pantalla.

Tareas:

- Agregar selector de modo:
  - `Todo`
  - `Tráfico web`
  - `WhatsApp`
  - `Campañas`
  - `Conversiones`
- Hacer que el mapa y los resúmenes reflejen el modo activo.
- Mantener los datos originales separados en backend.

Entrega esperada:

- El usuario puede explorar una sola vista con distintas lecturas sin confusión.

### Fase 5 · Validación con datos reales

Objetivo:

- comprobar que la narrativa funciona con tráfico real.

Tareas:

- Probar la vista con:
  - UTM web,
  - CTA de WhatsApp,
  - campañas enviadas desde la app,
  - conversaciones reales.
- Verificar que el usuario entiende qué fuente está viendo.
- Confirmar que no se mezclan campañas enviadas con CTAs o UTM.

Entrega esperada:

- La vista queda lista para usuarios operativos sin explicación adicional.

## 18) Criterios de QA

- El mapa no debe mostrar una métrica sin etiqueta de origen.
- `Fuentes y campañas` no debe aparentar medir WhatsApp.
- `WhatsApp por canal` no debe aparentar medir UTM.
- `Campañas de prospección` no debe mezclarse con tráfico web.
- El estado vacío debe decir explícitamente qué fuente no tiene datos.

## 19) Dependencias

- Mantener la corrección de latencia ya aplicada.
- Mantener la persistencia de `whatsapp-atribucion`.
- Mantener los catálogos de campaña y UTM.
- Mantener la compatibilidad con contactos/personas ya corregida.

## 20) Resultado esperado del backlog

Al cerrar estas fases, la vista de `mapa-de-conversion` quedará:

- rápida de entender,
- multicanal,
- semánticamente clara,
- operativamente útil,
- y compatible con el modelo actual de datos separado por fuente.
