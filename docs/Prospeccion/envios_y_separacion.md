# Envíos de prospección y separación temporal

Última revisión: 2026-09-05 (UTC)

Diseño e implementación: `propuesta_separacion_estricta.md`.

## Estado actual

El flujo de contacto es asíncrono:

1. `/prospeccion/prospectos` valida la separación solicitada entre 5 y 3600 segundos.
2. `POST /crm/prospeccion/prospectos/contactar` crea un batch y un registro en `prospeccion_contacto_envio` por prospecto y canal.
3. Cada registro recibe `programado_en` con la separación configurada.
4. `contact_sender` consulta envíos vencidos y los ejecuta desde el `lifespan` de FastAPI.
5. El worker actualiza el envío, registra `prospeccion_contactos_log` y sincroniza el estado del lote.

Cuando el tenant usa Postmark, el correo tiene una segunda cola:
`contact_sender` crea el mensaje local y `postmark-worker` realiza después la
llamada externa. Por eso la reserva del intervalo se hace en el worker que
realmente llama al proveedor.

El correo puede usar Brevo o Postmark según la configuración del tenant. WhatsApp usa el transporte Meta configurado para prospección. Los estados posteriores llegan mediante webhooks/callbacks.

## Programación por sublotes

Un lote principal puede dividirse en ventanas de envío sin crear campañas
independientes. La configuración se conserva en `prospeccion_contacto_batch` y
cada envío conserva su ventana y plantilla exactas:

- `envios_por_lote`: cantidad máxima de envíos en cada ventana;
- `intervalo_entre_lotes_segundos`: separación entre el inicio planificado de
  cada ventana;
- `total_lotes`: número calculado de ventanas;
- `numero_lote` y `lote_programado_en`: auditoría por envío;
- `plantilla_id`: plantilla efectiva usada por el envío.

El intervalo entre ventanas debe ser igual o mayor que
`(envios_por_lote - 1) * separacion_segundos`; así se evita que una ventana se
solape con la siguiente. La distribución de varias plantillas es round-robin y
se realiza antes de dividir las ventanas. Por ejemplo, 500 prospectos, 50 por
ventana y tres plantillas producen aproximadamente 167/167/166 envíos por
plantilla dentro de un único lote principal.

El limitador durable por `organizacion_id + canal` continúa siendo la última
garantía en el despacho real. La programación sólo define elegibilidad; el
worker aún puede reprogramar un envío si otra campaña del mismo tenant ocupa el
turno del canal.

## Cuotas por proveedor

Las cuotas se aplican únicamente a `correo`. WhatsApp no usa la cuota diaria o
mensual de correo; conserva únicamente su separación y las reglas propias del
transporte configurado.

- Brevo: se valida la cuota diaria que reporta la cuenta. El límite de 300
  diarios no se aplica a Postmark ni a WhatsApp. Si los envíos proyectados
  superan el saldo diario disponible, la creación se rechaza para evitar dejar
  envíos en un estado que el proveedor no pueda aceptar; el usuario puede
  programar el siguiente sublote en otro día.
- Postmark: el límite efectivo es la cuota mensual contratada por el tenant y
  administrada por el tenant maestro. La reserva atómica de la cola Postmark
  bloquea el envío cuando se agota el periodo.

La ruta de prospección no consulta la cuota de Brevo para un tenant que ya está
habilitado en Postmark. No se debe convertir ninguna de estas cuotas en un
límite global del sistema.

## Qué significa la separación de 5 segundos

La separación configurada ahora también se aplica al despacho real mediante una
reserva transaccional durable por `organizacion_id + canal`.

El worker conserva concurrencia para no bloquear correo y WhatsApp entre sí, pero
cada tarea debe obtener turno antes de llamar al proveedor. La reserva usa la
RPC `reserve_prospeccion_envio_dispatch`, bloquea la fila del reloj del tenant y
reprograma el envío si todavía no corresponde.

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
| `despacho_iniciado_en` | Inicio de la llamada real al proveedor | medir separación mínima |
| `proveedor_aceptado_en` | Recepción del ID externo del proveedor | conciliar aceptación |
| `procesado_en` | Última actualización operativa del envío | no usarlo solo para medir despacho |
| estado `entregado`, `leido`, `fallido` o `respondido` | Resultado posterior | medir entregabilidad y respuesta |

`procesado_en` puede cambiar cuando llega un callback de entrega, lectura, rebote o respuesta. En Postmark, el estado inicial `enviado` significa que el mensaje fue encolado localmente; `proveedor_aceptado_en` sólo se completa después de la llamada real y del `MessageID` externo. Ninguno equivale necesariamente a entrega final.

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

## Implementación y validación pendiente

La migración `20260922_100000_prospeccion_envio_separacion_estricta.sql` ya fue
aplicada y el servicio API fue reiniciado. La implementación incluye:

- rate limiter durable por organización y canal;
- coordinación entre procesos y réplicas;
- reserva atómica del siguiente instante permitido;
- timestamps `despacho_iniciado_en` y `proveedor_aceptado_en`;
- métrica de violaciones y alerta operativa;
- prueba funcional repetible con correo y WhatsApp.

Queda la prueba funcional controlada con destinatarios de prueba. La medición
debe usar `despacho_iniciado_en` como fuente primaria; `proveedor_aceptado_en`
sirve para separar inicio local de aceptación externa. La garantía es mínima:
un despacho posterior no inicia antes del intervalo configurado; la latencia
del proveedor puede hacer que el intervalo sea mayor.
