# Plan de latencia · Mapa de Conversion

Fecha: 2026-06-27
Ruta: `docs/Plan_mapa_conversion/plan_latencia_mapa_conversion.md`

Este documento alimenta el backlog maestro:

- `backlog_maestro_mapa_conversion.md`

Y se registra en el changelog maestro:

- `changelog_maestro_mapa_conversion.md`

Documentos relacionados:

- `docs/Plan_mapa_conversion/plan_mapa_conversion_integral.md`
- `docs/Plan_mapa_conversion/plan_mapa_conversion_multicanal.md`

## 1) Objetivo

Reducir la latencia percibida al entrar a `mapa-de-conversion` y al cargar los listados `Visitas web` y `Conversaciones`, sin romper:

- el tooltip del mapa,
- la lógica de buckets por país/estado/municipio,
- la compatibilidad con otras vistas que consumen los mismos endpoints,
- la consistencia de datos ya corregida tras el refactor `contactos/personas`.

## 2) Síntoma actual

- La vista tarda en mostrar contenido útil al entrar.
- `Visitas web` y `Conversaciones` se sienten lentas aunque estén separadas visualmente del mapa.
- El mapa depende de un request grande inicial y las tablas dependen de otro request posterior.

## 3) Diagnóstico técnico

La ruta actual tiene dos costos principales:

1. La página principal espera `loadDemografiaData()` antes de pintar la vista.
2. Las tablas diferidas lanzan su propio fetch adicional con filtros equivalentes.

Dentro de la carga de datos:

- `loadDemografiaData()` ya hace `resumen-v2` y `mapa-v2` en paralelo.
- `DeferredConversionTables` hace otro request independiente a `/api/crm/mapa-conversion/tables`.
- El endpoint de tablas, a su vez, vuelve a consultar `webchat` y `whatsapp`.

Conclusión:

- El problema no es un solo query.
- La latencia es una combinación de render bloqueante, requests pesados y trabajo repetido.

## 4) Principios de solución

- No tocar la lógica del tooltip ni los buckets geográficos.
- No cambiar el contrato visible de la vista.
- Reducir el tiempo hasta el primer contenido útil.
- Separar carga visual de carga de datos pesada.
- Cachear lo que ya no necesita recomputarse en cada entrada.

## 5) Plan propuesto

### Fase 1 · Render rápido de la vista

Objetivo:

- Que la pantalla pinte un shell útil inmediatamente.

Acciones:

- Convertir la carga inicial del mapa en contenido diferido con `Suspense` o equivalente.
- Mostrar skeletons o placeholders del mapa, KPIs y tablas mientras llegan los datos.
- Evitar que la página espere todo el payload antes de renderizar estructura base.

Riesgo controlado:

- No cambiar el contenido final.
- Solo cambiar el momento de llegada.

### Fase 2 · Reducir trabajo de entrada

Objetivo:

- Evitar recomputar tablas completas cada vez que se abre la vista.

Acciones:

- Agregar cache corto al endpoint `GET /api/crm/mapa-conversion/tables`.
- Mantener invalidez por filtros, rango y atribución.
- Reutilizar respuestas recientes cuando el usuario vuelve a entrar a la misma combinación de filtros.

Riesgo controlado:

- El cache debe ser breve y completamente dependiente de filtros.
- No debe afectar la frescura del tooltip del mapa.

### Fase 3 · Medición por etapa

Objetivo:

- Saber exactamente dónde se va el tiempo.

Acciones:

- Medir por separado:
  - `resumen-v2`
  - `mapa-v2`
  - `/api/crm/mapa-conversion/tables`
  - `/crm/visitas/whatsapp/conversaciones`
  - carga de `webchat`
- Registrar tiempos en backend y, si hace falta, en frontend.

Resultado esperado:

- Evitar optimizaciones ciegas.
- Priorizar el cuello real, no el sospechado.

### Fase 4 · Optimización backend puntual

Objetivo:

- Quitar costo de consulta donde realmente esté el cuello.

Acciones posibles:

- Reducir columnas devueltas por `whatsapp` y `webchat` en tablas.
- Limitar joins y enriquecimientos que no sean necesarios para `mapa-de-conversion`.
- Revisar índices si una consulta frecuente está forzando escaneo costoso.

## 6) Orden recomendado de implementación

1. Primero, hacer render rápido con carga diferida.
2. Después, cache corto para tablas.
3. Luego, medir por etapa.
4. Finalmente, optimizar consultas específicas si la métrica lo confirma.

## 7) Invariantes que no se deben romper

- El tooltip del mapa debe seguir mostrando:
  - WhatsApp por país,
  - WhatsApp por estado,
  - WhatsApp por municipio cuando aplique.
- La vista no debe volver a mezclar contactos/personas de forma incorrecta.
- La carga diferida no debe alterar la selección de filtros.
- Los listados no deben perder consistencia con el mapa.

## 8) Criterio de éxito

Se considera resuelta la latencia cuando:

- la vista muestra estructura útil casi de inmediato,
- el mapa se completa sin bloquear toda la página,
- `Visitas web` y `Conversaciones` cargan de forma predecible,
- el tooltip mantiene los datos correctos ya corregidos,
- no aparecen regresiones en otras vistas que consumen los mismos endpoints.

## 9) Avance aplicado

Fecha: 2026-06-27

Se descartó el refactor de `Suspense` en la página porque empeoró la percepción general de carga.

Se identificó un cuello real:

- `resumen-v2` y `mapa-v2` estaban resolviendo la misma geolocalización de WhatsApp por ubicación de forma independiente.
- En una apertura nueva, el frontend dispara ambos requests en paralelo.
- Eso duplicaba una consulta costosa a `visitas_persona_whatsapp_conversaciones` y su geocodificación en Python.

Corrección aplicada:

- Se agregó una cache compartida para la agregación de ubicaciones de WhatsApp en `backend/app/api/routes/crm.py`.
- La resolución ahora usa una sola agregación por combinación de organización, nivel y rango de fechas.
- Se deduplican ejecuciones concurrentes con un `inflight` compartido.

Siguiente verificación:

- medir de nuevo el tiempo de `/demografia/resumen-v2` y `/demografia/mapa-v2`,
- confirmar que `Visitas web` y `Conversaciones` empiezan a renderear antes,
- revisar si hace falta otra optimización en `/api/crm/mapa-conversion/tables`.

## 11) Implementación visible aplicada

Fecha: 2026-06-27

Se implementó una mejora de percepción de carga en la vista:

- el loading de `mapa-de-conversion` ahora muestra títulos de sección desde el inicio,
- se distinguen bloques para `Filtros`, `Mapa`, `Resumen general`, `Mapa de KPIs`, `Acquisition summary`, `Tabla principal`, `Visitas web` y `Conversaciones`,
- cada bloque muestra estado de carga explícito en lugar de dejar la pantalla en blanco.

Esto no sustituye la optimización de backend, pero sí mejora la comprensión de la vista mientras llegan los datos.

## 12) Separación de tablas por sección

Fecha: 2026-06-27

Se implementó una optimización adicional en el endpoint de tablas:

- `Visitas web` y `Conversaciones` ahora pueden resolverse como requests separados.
- `Visitas web` ya no espera a que termine la consulta de WhatsApp cuando no es necesaria.
- `Conversaciones` mantiene su propia carga de WhatsApp y sigue independientemente.

Impacto esperado:

- la primera tabla útil aparece antes,
- el usuario ve avance incremental en vez de esperar un payload combinado,
- el bloqueo de una sección afecta menos a la otra.

## 13) Instrumentación aplicada

Fecha: 2026-06-27

Se agregó medición real del endpoint de tablas:

- la ruta ahora registra duración total por request,
- distingue `section=visits`, `section=conversations` y `section=both`,
- expone `Server-Timing` y `X-Response-Time-Ms`,
- deja trazas para comparar cuántas filas devuelve cada sección.

Esto permite validar si la separación por secciones está reduciendo de verdad la latencia percibida y cuál de las dos tablas sigue siendo el cuello.

## 14) Idea de mejora visible para el usuario

Objetivo:

- evitar que la vista se perciba en blanco durante la carga inicial,
- mostrar desde el inicio una estructura comprensible,
- dar feedback visual aunque todavía no estén listos los datos pesados.

Propuesta:

1. Pintar inmediatamente el marco de la vista:
- `SiteHeader`
- filtros
- títulos de secciones
- contenedores de `Mapa`, `Resumen general`, `Visitas web` y `Conversaciones`

2. Usar skeletons o placeholders por sección:
- el mapa puede mostrar un contenedor con carga progresiva,
- el resumen puede mostrar bloques vacíos con labels visibles,
- las tablas pueden mostrar estado de carga antes de traer filas reales.

3. Desacoplar la carga por bloques:
- el mapa y el resumen deben cargar sin bloquear las tablas,
- `Visitas web` y `Conversaciones` deben empezar a pedir datos lo antes posible,
- si una sección tarda, que afecte solo a esa sección.

4. Medir la latencia por etapa:
- tiempo de render del shell,
- tiempo de `resumen-v2`,
- tiempo de `mapa-v2`,
- tiempo de `/api/crm/mapa-conversion/tables`.

Decisión recomendada:

- primero hacer visible la estructura de la pantalla,
- después optimizar la carga de datos para que cada bloque llegue de forma independiente,
- solo si hace falta, aplicar carga diferida o progressive rendering en tablas secundarias.

## 15) Lo que ya quedó mejorado

Fecha: 2026-06-27

Ya se aplicaron y verificaron estas mejoras en la vista `mapa-de-conversion`:

1. La pantalla ya no depende de esperar todo el payload para mostrar avance visual.
- La vista ahora puede entrar más rápido y mostrar estructura útil mientras llegan los datos.
- Los títulos y secciones quedan visibles antes que los datos pesados.

2. Se corrigió la regresión del tooltip del mapa.
- El tooltip volvió a mostrar datos correctos de WhatsApp después del refactor de `contactos/personas`.
- Se validó con tráfico real que el mapa vuelve a reflejar ubicaciones como México, Colombia, China y Pakistán.

3. Se corrigió la lista de conversaciones de WhatsApp.
- La tabla volvió a mostrar registros.
- Se eliminó el attach pesado de datos de contacto/persona y se sustituyó por una versión ligera.

4. Se redujo de forma fuerte la latencia del lookup de teléfonos.
- Se agregó cache corto para la búsqueda por teléfono en WhatsApp.
- En logs recientes se observó el siguiente comportamiento:
  - primera ejecución con `phone_lookup_ms` alto,
  - ejecuciones posteriores con `phone_lookup_ms` cercano a `1 ms`.

5. Se redujo el costo del enriquecimiento de conversaciones.
- `crm_repo.visitas_whatsapp_conversaciones.done` bajó de más de 20 s a rangos cercanos a sub-segundo o pocos segundos.
- El attach de contacto quedó tipado y ligero.

6. Se instrumentó la vista para medir cuellos reales.
- `resumen-v2`, `mapa-v2` y conversaciones ahora reportan tiempos por etapa.
- Eso permitió ubicar el costo real en `catalogs`, `geojson` y algunos accesos a datos, no en el tooltip.

## 16) Resultado medido reciente

Fecha: 2026-06-27

En logs recientes se observó:

- `crm.visitas.whatsapp.conversaciones.done`
  - `phone_lookup_ms` pasó de alrededor de `1649 ms` en la primera ejecución a `1.24 ms` en una posterior.
  - `total_ms` bajó a alrededor de `1332 ms` en la ejecución más favorable observada.
- `crm_repo.visitas_whatsapp_conversaciones.done`
  - `total_ms` quedó en rangos de aproximadamente `454 ms` a `1267 ms`.
- `crm.demografia.mapa_v2.cache_miss`
  - `total_ms` quedó en aproximadamente `1.4 s` a `2.4 s`.
- `crm.demografia.resumen_v2.cache_miss`
  - `total_ms` quedó en aproximadamente `2.6 s` a `3.3 s`.

Lectura técnica:

- El cuello de WhatsApp quedó atendido.
- El peso restante está más concentrado en `resumen-v2` y `mapa-v2`, sobre todo en `catalogs`, `geojson` y parte del trabajo de agregación.
- La siguiente mejora útil ya no es el tooltip, sino la carga progresiva y la separación de bloques en frontend, o una nueva optimización puntual de los agregados.

## 17) Incidente resuelto: `WhatsApp por canal` sin datos

Fecha: 2026-06-27

Síntoma:

- La tarjeta `WhatsApp por canal` mostraba `No hay atribución de WhatsApp en este filtro`.
- El panel ya leía bien el mapa y las tablas, pero esa sección seguía vacía.

Causa raíz:

- La sección depende de eventos persistidos en `prospeccion_whatsapp_atribucion_eventos`.
- En el tenant `00000000-0000-0000-0000-000000000001` la tabla estaba vacía, aunque sí existían conversaciones que matcheaban reglas activas.
- El flujo de persistencia en `backend/app/channels/whatsapp/service.py` estaba bloqueado por un guard que abortaba la atribución cuando detectaba más de un mensaje reciente en la conversación.
- Además, había caché de demografía ya construida con el payload vacío.

Fix aplicado:

1. Se eliminó el guard que impedía persistir la atribución histórica cuando la conversación ya tenía más de un mensaje.
2. Se hizo backfill histórico de eventos WhatsApp para el tenant usando el matcher real de frases.
3. Se crearon contactos mínimos válidos para poder resolver el `contacto_id` requerido por la FK de `prospeccion_whatsapp_atribucion_eventos`.
4. Se limpió la caché `demografia_v2` para forzar reconstrucción del resumen.

Resultado:

- `prospeccion_whatsapp_atribucion_eventos` ya contiene eventos para `Landing WhatsApp`.
- La sección `WhatsApp por canal` volvió a mostrar datos.
- El mapa y el tooltip quedaron intactos durante la corrección.

Validación recomendada:

- Verificar que nuevos inbound de WhatsApp sigan generando eventos.
- Confirmar que una recarga fría de `mapa-de-conversion` sigue mostrando la tarjeta con datos.
- Revisar que futuros cambios en personas/contactos no vuelvan a bloquear la persistencia de atribución.
