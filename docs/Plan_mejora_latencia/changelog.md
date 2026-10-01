# Changelog — Plan de mejora de latencia

Registro de hallazgos, decisiones y mejoras propuestas para reducir la latencia
en Supabase, Prospección y los workers de comunicación.

## [2026-10-01] — Tres mejoras prioritarias para Prospección y Supabase

Estado: propuesta documentada; implementación pendiente.

## [2026-10-01] — Implementación inicial del plan

Estado: implementado en backend y Supabase; despliegue del servicio pendiente.

- Corregido el logging de errores de zona horaria para no generar `TypeError`.
- La zona horaria solo se resuelve desde Supabase cuando existen filtros de
  fecha.
- Los indicadores detallados ya no se cargan dentro del listado por defecto.
  La UI los solicita mediante el endpoint separado existente.
- Si se solicitan indicadores de forma explícita y fallan, el listado puede
  responder degradado con `contact_indicators_degraded=true`.
- Eliminados los cinco refreshes síncronos de la MV desde endpoints de guardar
  y eliminar prospectos.
- Creado un runner periódico configurable cada 300 segundos para actualizar la
  MV fuera de las peticiones del usuario.
- Aplicado en Supabase un lock transaccional para evitar refreshes concurrentes.

Pendiente:

- Desplegar y reiniciar `talia-api.service`.
- Verificar en logs `prospeccion.query_daily_mv.refresh_ok` y la duración.
- Medir p50/p95/p99 de `/prospeccion/prospectos` antes y después.
- Confirmar que no reaparecen `57014` ni `TypeError` en la ruta.

### 1. Corrección del manejo de errores de `/prospeccion/prospectos`

#### Problema

Cuando falla una consulta auxiliar de Supabase, el manejo de excepciones usa
argumentos inválidos en `logger.warning`. Esto genera un `TypeError` y oculta
el error original, provocando respuestas `500` o diagnósticos incompletos.

#### Mejora propuesta

- Corregir el logging estructurado usando `extra` o `exc_info=True`.
- No consultar la zona horaria desde Supabase cuando no existen filtros de
  fecha.
- Usar una zona horaria segura como fallback para consultas auxiliares.
- Devolver `502` controlado cuando falle la consulta principal.
- Registrar por separado timeout, indisponibilidad de Supabase y errores de
  aplicación.

#### Criterio de validación

- La ruta no genera `TypeError` cuando Supabase falla.
- El panel recibe una respuesta controlada y entendible.
- Los logs conservan la causa original sin exponer información sensible.

### 2. Separación y optimización de indicadores

#### Problema

El listado obtiene primero los prospectos y después realiza una consulta
adicional de indicadores para los IDs de la página. Esta consulta permanece en
el camino crítico y puede coincidir con workers, refreshes y otras consultas.

#### Mejora propuesta

- Mantener el listado base limitado a los campos necesarios para la tabla.
- Utilizar los contadores persistidos en `prospeccion_prospectos` para totales
  y filtros frecuentes.
- Cargar indicadores detallados bajo demanda o desde un endpoint separado.
- Conservar la RPC por IDs para detalle, con límites estrictos.
- Mantener caché por tenant e IDs cuando sea seguro.
- Medir por separado `list_ms`, `contact_indicators_ms` y
  `scraper_status_ms`.

#### Criterio de validación

- La vista puede mostrar la página base sin esperar indicadores detallados.
- Una falla de indicadores no bloquea el listado principal.
- La latencia de indicadores se mide independientemente de la latencia del
  listado.

### 3. Refreshes de materialized views fuera de peticiones interactivas

#### Problema

Los refreshes de resúmenes/materialized views han producido errores `57014`
por timeout. Cuando compiten con navegación, filtros o workers, pueden
incrementar la presión sobre Supabase.

#### Mejora propuesta

- Retirar los refreshes del camino de las peticiones del usuario.
- Ejecutarlos mediante worker o tarea programada.
- Impedir refreshes simultáneos mediante lock o advisory lock.
- Evaluar `REFRESH MATERIALIZED VIEW CONCURRENTLY` si existe un índice único
  compatible.
- Registrar inicio, duración, resultado y última ejecución.
- Si el refresh sigue siendo costoso, migrar a una tabla resumen incremental.
- Servir el último resultado válido cuando un refresh falle.

#### Criterio de validación

- Ninguna petición de usuario dispara directamente un refresh pesado.
- No se reproducen `57014` durante una ventana de carga controlada.
- Existe evidencia de duración y resultado de cada ejecución.
- Un fallo de actualización no deja sin datos a la vista.

## Evidencia que originó estas mejoras

- `PGRST002` afectó varias áreas de la aplicación, no solo Prospección.
- `57014` apareció en refreshes y resúmenes de Prospección.
- `/prospeccion/prospectos` presentó solicitudes de 15–18 segundos bajo
  degradación o concurrencia.
- Brevo registró envíos exitosos, pero también errores de acceso a Supabase.
- WhatsApp presentó errores de red hacia Supabase y errores Meta `132000`
  independientes por parámetros incorrectos de plantilla.

## Orden de implementación

1. Manejo robusto de errores.
2. Separación de indicadores del listado.
3. Refreshes fuera del camino crítico.
4. Medición comparativa con `pg_stat_statements`, logs de aplicación y
   métricas p50/p95/p99.
