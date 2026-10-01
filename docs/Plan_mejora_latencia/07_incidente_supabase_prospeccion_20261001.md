# Incidente de latencia y disponibilidad: Supabase, Prospección y workers

Fecha del diagnóstico: 2026-10-01 (UTC)
Estado: diagnóstico documentado; implementación inicial aplicada, pendiente de despliegue y medición.

## Resumen ejecutivo

El problema no corresponde únicamente a Brevo ni a WhatsApp. Se identificaron
tres capas que se combinan:

1. Inestabilidad temporal de Supabase/PostgREST que afectó varios módulos.
2. Consultas costosas en Prospección, especialmente resúmenes, refreshes e
   indicadores de contacto.
3. Un defecto de manejo de excepciones en `/prospeccion/prospectos` que
   transforma un fallo de dependencia en un error interno adicional.

Brevo y WhatsApp operan en workers separados, pero ambos dependen de Supabase y
por eso pueden fallar durante la misma ventana de degradación.

## Evidencia de Supabase

Se observaron respuestas `PGRST002`:

> Could not query the database for the schema cache. Retrying.

El error apareció en actividades, notificaciones, webchat, visitas, WhatsApp,
configuración de tenant y Prospección. No debe atribuirse exclusivamente a una
consulta de la vista de prospectos.

También se registraron errores `57014` (`canceling statement due to statement
timeout`) en:

- `prospeccion_query_daily_mv_refresh`.
- `prospeccion_enriquecimiento_resumen`.
- Consultas históricas de indicadores de contactos.

Después del reinicio del servidor, los servicios quedaron activos desde
`2026-10-01T17:06:58Z`. No se observaron nuevos errores de Supabase en API,
email-worker ni request log durante la verificación posterior. El reinicio
eliminó la condición transitoria, pero no corrige las consultas ni los defectos
de código que pueden reproducirla.

## Evidencia específica de `/prospeccion/prospectos`

Se observaron solicitudes de aproximadamente 15 a 18 segundos que terminaron
con error. La ruta ejecuta, en secuencia:

1. Resolución de zona horaria y contexto de permisos.
2. Listado paginado de `prospeccion_prospectos`.
3. Consulta adicional de indicadores para los IDs de la página.
4. Consulta opcional de estados de scraper.

Cuando falla la resolución de contexto por un problema de Supabase, el código
usa `logger.warning(..., error=str(exc))`. El logging estándar no acepta ese
argumento directamente; debe utilizar `extra={"error": ...}` o `exc_info=True`.
El manejo del error genera entonces un `TypeError` y oculta la causa original.

## Indicadores y rendimiento observado

El listado principal realiza una llamada adicional a
`prospeccion_contacto_indicadores_por_ids` después de obtener los prospectos,
dividiendo los IDs en bloques de 100.

En la muestra actual de `pg_stat_statements`:

- La RPC de indicadores tuvo 9 llamadas, con media aproximada de 96 ms.
- Consultas del listado de prospectos tuvieron medias aproximadas de 1.6 a
  2.1 segundos en una muestra pequeña.
- El histórico de request logs conserva picos de 15 a 18 segundos bajo
  degradación o concurrencia.

La RPC de indicadores no es siempre lenta de forma aislada; el riesgo está en
que se ejecuta dentro del camino crítico y coincide con otras consultas,
workers y refreshes.

## Relación con Brevo y WhatsApp

### Brevo

- Se observaron envíos exitosos (`email.sent`).
- También hubo `database_unreachable` al resolver el alcance de proveedores.
- No hay evidencia suficiente para atribuir el problema a una falla directa de
  la API de Brevo.

### WhatsApp

- Hubo errores de red hacia Supabase durante la misma ventana.
- También existen errores independientes de Meta `132000`, causados por una
  cantidad de parámetros distinta a la esperada por la plantilla.
- El error `132000` no es un timeout de base de datos.

## Decisión técnica

La prioridad no es elevar `statement_timeout`. La prioridad es reducir el
trabajo síncrono, separar los procesos de actualización y hacer que las fallas
de dependencias sean degradables.

## Acciones propuestas

### A. Manejo robusto de errores

- Corregir todos los `logger.warning` con argumentos inválidos.
- No resolver zona horaria desde Supabase cuando la petición no usa filtros de
  fecha.
- Usar una zona horaria segura como fallback cuando falle una consulta
  auxiliar.
- Devolver `502` controlado cuando falle la consulta principal, conservando el
  error técnico en logs estructurados.
- Mantener métricas separadas para error de dependencia, timeout y error de
  manejo.

### B. Separación del listado e indicadores

- Mantener el listado base limitado a los campos necesarios para la tabla.
- Utilizar los contadores persistidos en `prospeccion_prospectos` para totales
  generales y filtros frecuentes.
- Cargar indicadores detallados bajo demanda o mediante endpoint separado.
- Mantener la RPC por IDs para detalle, con límites y caché por tenant.
- Evitar recalcular indicadores para toda la página si la UI no los necesita.

### C. Refreshes fuera del camino crítico

- Retirar los refreshes de materialized views de las peticiones interactivas.
- Ejecutarlos en worker o tarea programada con control de concurrencia.
- Impedir refreshes simultáneos mediante lock/advisory lock.
- Evaluar `REFRESH MATERIALIZED VIEW CONCURRENTLY` solo con el índice único
  necesario.
- Registrar inicio, duración, resultado y última ejecución.
- Si el refresh continúa siendo costoso, migrar a una tabla resumen
  incremental en vez de recalcular todo el histórico.

## Criterios de validación

- `/prospeccion/prospectos` no genera `TypeError` al fallar una dependencia.
- La carga base puede responder sin esperar indicadores detallados.
- Ningún refresh de MV se ejecuta dentro de una petición de usuario.
- No se reproducen `57014` durante una ventana de carga controlada.
- Los errores `PGRST002` se registran con ruta, operación y duración, sin datos
  sensibles.
- Brevo y WhatsApp pueden continuar sus reintentos sin duplicar despachos.
