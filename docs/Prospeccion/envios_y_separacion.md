# Envíos de prospección y separación temporal

Última revisión: 2026-09-04 (UTC)

## Estado actual

El flujo de contacto es asíncrono:

1. `/prospeccion/prospectos` valida la separación solicitada entre 5 y 3600 segundos.
2. `POST /crm/prospeccion/prospectos/contactar` crea un batch y un registro en `prospeccion_contacto_envio` por prospecto y canal.
3. Cada registro recibe `programado_en` con la separación configurada.
4. `contact_sender` consulta envíos vencidos y los ejecuta desde el `lifespan` de FastAPI.
5. El worker actualiza el envío, registra `prospeccion_contactos_log` y sincroniza el estado del lote.

El correo puede usar Brevo o Postmark según la configuración del tenant. WhatsApp usa el transporte Meta configurado para prospección. Los estados posteriores llegan mediante webhooks/callbacks.

## Qué significa la separación de 5 segundos

La separación de 5 segundos actualmente garantiza la secuencia de `programado_en`, no el intervalo real entre llamadas al proveedor.

El worker tiene concurrencia predeterminada `2` y crea tareas para varios envíos vencidos. No existe una espera obligatoria de 5 segundos antes de cada despacho. El control vigente es de volumen por minuto y backpressure por errores, no de intervalo mínimo.

Por eso pueden ocurrir ambas situaciones:

- intervalos reales menores a 5 segundos por procesamiento paralelo;
- intervalos mayores a 5 segundos por latencia del proveedor, errores, reintentos, callbacks o backlog.

Los envíos omitidos también ocupan una posición en la programación del lote, aunque no produzcan una llamada al proveedor.

## Evidencia operativa validada

La revisión del 2026-09-04 confirmó:

- `talia-api.service` estaba activo y el worker `contact_sender` se ejecutaba dentro del proceso FastAPI.
- La programación persistida de un lote WhatsApp avanzaba en pasos de 5 segundos.
- En un lote real WhatsApp se observaron envíos iniciales con intervalo mínimo aproximado de 2.656 segundos.
- En lotes reales de correo se observaron intervalos iniciales menores a 5 segundos, incluyendo casos inferiores a 1 segundo.

La evidencia de despacho inicial debe calcularse con el primer evento `estado=enviado` por `envio_id` en `prospeccion_contactos_log`, usando `creado_en`. Para WhatsApp, `mensajes.creado_en` y el ID `wamid` sirven como comprobación adicional.

## Timestamps y fuentes

| Dato | Significado | Uso recomendado |
| --- | --- | --- |
| `programado_en` | Momento en que el envío queda elegible | medir planificación |
| `prospeccion_contactos_log.creado_en` con `estado=enviado` | Primer registro del despacho | medir intervalo inicial |
| SID/message ID del proveedor | Identificador externo aceptado | reconciliar con Meta, Brevo o Postmark |
| `mensajes.creado_en` | Persistencia local del mensaje saliente | corroborar WhatsApp |
| `procesado_en` | Última actualización operativa del envío | no usarlo solo para medir despacho |
| estado `entregado`, `leido`, `fallido` o `respondido` | Resultado posterior | medir entregabilidad y respuesta |

`procesado_en` puede cambiar cuando llega un callback de entrega, lectura, rebote o respuesta. En Postmark, el estado inicial `enviado` significa que el mensaje fue encolado; no equivale necesariamente a entrega final.

## Auditoría recomendada

Para un lote controlado:

1. Seleccionar un único tenant, canal y plantilla.
2. Lanzar al menos 10 destinatarios de prueba con separación de 5 segundos.
3. Consultar el primer `estado=enviado` por `envio_id`.
4. Ordenar por `creado_en` y calcular diferencias consecutivas.
5. Comparar cada diferencia contra la separación solicitada.
6. Reconciliar los IDs externos con el proveedor.

Consulta base:

```sql
with primeros_despachos as (
  select distinct on (envio_id)
    envio_id,
    batch_id,
    canal,
    creado_en,
    detalle
  from public.prospeccion_contactos_log
  where batch_id = :batch_id
    and estado = 'enviado'
  order by envio_id, creado_en asc
)
select *
from primeros_despachos
order by creado_en asc;
```

## Pendiente para garantía estricta

Para presentar los 5 segundos como garantía de producto se requiere:

- rate limiter durable por organización y canal;
- coordinación entre procesos y réplicas;
- reserva atómica del siguiente instante permitido;
- timestamps `despacho_iniciado_en` y `proveedor_aceptado_en`;
- métrica de violaciones y alerta operativa;
- prueba funcional repetible con correo y WhatsApp.

Hasta completar ese cambio, la documentación y la UI deben describir la configuración como separación programada, no como separación real garantizada.
