# Incidente de listado de prospectos y conteo exacto — 2026-10-08

## Evidencia

El panel recibió:

```text
GET /api/prospeccion/prospectos?limit=500&offset=1000&...
HTTP 502 después de aproximadamente 8.6 segundos
```

FastAPI registró:

```text
Supabase respondió error 500 en /rest/v1/prospeccion_prospectos
code: 57014
message: canceling statement due to statement timeout
```

Durante la misma ventana también expiró la RPC
`prospeccion_enriquecimiento_resumen`. La petición de creación de campaña,
en cambio, respondió `202 Accepted`, por lo que el fallo del listado no debe
interpretarse como fallo de la campaña ya encolada.

La URL ya no contenía `opt_out_whatsapp`, confirmando que la corrección del
filtro de canal se publicó correctamente. El cuello de botella restante era la
consulta principal de `prospeccion_prospectos`.

## Causa

Hubo dos costos que se combinaron:

1. El repositorio solicitaba `count=exact` en cada página.
2. El panel enviaba `opt_out_whatsapp=false` incluso en el listado general,
   sin canal WhatsApp seleccionado. Ese parámetro activaba un escaneo de
   supresiones por páginas de 1,000 filas, con offsets crecientes.

Bajo concurrencia con workers, indicadores y otras consultas, el escaneo
superaba el `statement_timeout` de Supabase. Los logs confirmaron lecturas de
`prospeccion_prospectos` hasta offsets superiores a 30,000 durante una sola
operación.

## Corrección implementada

La vista normal ahora usa `count=planned`, que entrega un total estimado sin
forzar el conteo exacto completo. La respuesta incluye:

```json
{
  "total": 1427,
  "total_exact": false,
  "has_more": true
}
```

El frontend usa `has_more` para habilitar “Siguiente” y ya no depende de que
`total` sea exacto para continuar navegando. Los consumidores administrativos
que necesiten precisión pueden enviar:

```text
count_exact=true
```

El conteo exacto queda como una operación explícita, no como costo obligatorio
de cada página. La excepción son los filtros de estado de validación: correo,
teléfono o sitio web ahora fuerzan conteo exacto, porque sus totales son una
señal operativa que debe coincidir con las filas mostradas. En la verificación
del tenant maestro, `email_lookup_status = pendiente` devuelve 57 filas reales;
el valor 5,554 era una estimación del planificador, no registros pendientes.

Además, `opt_out_whatsapp` solo se envía y procesa cuando el filtro incluye
explícitamente el canal `whatsapp`. Un listado de correo o un listado general
ya no ejecuta el escaneo de supresiones de WhatsApp.

## Hallazgo adicional: selección repetida de correo

Al revisar el estado real después de cuatro preparaciones del 8 de octubre se
encontraron 3,229 filas solicitadas, pero sólo 1,427 prospectos distintos. El
listado usaba `envios_correo_total = 0`; ese contador representa únicamente
aceptación/éxito, pero permitía que un prospecto pendiente, suprimido o fallido
volviera a entrar en otra campaña.

La solución agrega la columna explícita
`prospeccion_prospectos.envios_correo_intentos_total`, con índice por tenant,
estado de validación y fecha. La regla queda:

- `envios_correo_total`: aceptación/entrega para métricas.
- `envios_correo_intentos_total`: reservado o intentado; bloquea una nueva
  selección automática, excepto estados `cancelado`/`omitido`.
- `sin envío + correo`: filtra por `envios_correo_intentos_total = 0`.
- `con envío + correo`: continúa filtrando por `envios_correo_total > 0`.

La migración `20261008_214500_prospeccion_correo_intentos_no_repetir.sql`
reconstruye el contador histórico y actualiza el worker Postmark en una sola
agregación por bloque, sin escanear el ledger desde la API en cada página.

## Desalineación de indicadores de validación

La RPC `prospeccion_enriquecimiento_resumen` reporta los estados reales del
tenant. Para correo, el corte verificado fue: 15,097 válidos, 57 pendientes,
1,337 inválidos, 3,209 dudosos y 11,469 sin correo. El listado mostraba 5,554
porque la vista normal solicitaba `count=planned`; las estadísticas de
PostgreSQL estaban desactualizadas para el filtro selectivo y devolvían una
estimación, aunque las filas de la página sí eran las 57 correctas.

El backend ahora activa `count=exact` automáticamente cuando se filtra por
estado de teléfono, correo o sitio web. La respuesta también marca
`total_exact=true` en esos casos. Los listados sin estados de validación siguen
usando `count=planned` para proteger la latencia.

## Alcance y límites

Este cambio reduce el costo del listado y evita que la selección de correo
dependa de un conteo exacto. No convierte todavía `offset` en cursor para todos
los consumidores externos; esa es la siguiente optimización si el volumen
continúa creciendo.

La creación de campañas sigue siendo asíncrona y debe usar su snapshot durable.
El listado visual no es la fuente de verdad del envío.

## Verificación

- Confirmar que el panel no vuelve a generar `502` para `offset=0`, `500` y
  `1000`.
- Confirmar que la respuesta contiene `has_more`.
- Confirmar que el botón “Siguiente” funciona aunque `total_exact=false`.
- Ejecutar una campaña de prueba y verificar que la creación responde `202`.
- Medir p95 del endpoint y registrar cualquier `57014` restante.

## Puesta en producción

La migración de intentos ya fue aplicada mediante Supabase y verificada: para
el tenant maestro quedan 11 prospectos válidos con correo y cero intentos
previos. La corrección completa aún requiere desplegar el backend que consume
el nuevo campo y comprobar la ruta HTTP autenticada. Hasta completar eso:

1. Desplegar backend y frontend, y reiniciar los servicios correspondientes.
2. Probar el endpoint autenticado con `offset=0`, `500` y `1000`, verificando
   `total_exact=false`, `has_more` y ausencia de `57014`.
3. Ejecutar una campaña pequeña y comprobar que la preparación, los lotes de
   hasta 500 y los webhooks de Postmark avanzan sin duplicados.

La migración no debe ejecutarse desde el navegador ni como parte de una
petición de usuario: debe aplicarse mediante el flujo controlado de Supabase.
