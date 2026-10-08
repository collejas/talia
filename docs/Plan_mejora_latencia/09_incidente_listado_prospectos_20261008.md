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
de cada página.

Además, `opt_out_whatsapp` solo se envía y procesa cuando el filtro incluye
explícitamente el canal `whatsapp`. Un listado de correo o un listado general
ya no ejecuta el escaneo de supresiones de WhatsApp.

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

El cambio de aplicación y la migración están preparados en el repositorio, pero
la corrección no se considera comprobada en producción hasta completar, en
este orden:

1. Aplicar la migración `20261008_120000_postmark_atomic_materialization_and_fair_queue.sql`.
2. Desplegar backend y frontend, y reiniciar los servicios correspondientes.
3. Probar el endpoint autenticado con `offset=0`, `500` y `1000`, verificando
   `total_exact=false`, `has_more` y ausencia de `57014`.
4. Ejecutar una campaña pequeña y comprobar que la preparación, los lotes de
   hasta 500 y los webhooks de Postmark avanzan sin duplicados.

La migración no debe ejecutarse desde el navegador ni como parte de una
petición de usuario: debe aplicarse mediante el flujo controlado de Supabase.
