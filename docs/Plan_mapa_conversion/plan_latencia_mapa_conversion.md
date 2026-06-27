# Plan de latencia · Mapa de Conversion

Fecha: 2026-06-27
Ruta: `docs/Plan_mapa_conversion/plan_latencia_mapa_conversion.md`

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
