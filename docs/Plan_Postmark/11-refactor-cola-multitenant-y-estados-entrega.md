# Refactor de envíos Postmark multi-tenant y estados de entrega

## Propósito

Este documento define el refactor completo para que Talia pueda procesar
campañas grandes de múltiples tenants sin bloquear la API, sin duplicar
mensajes y sin confundir la aceptación de Postmark con la entrega al
destinatario.

El diseño mantiene el límite de Postmark de máximo 500 mensajes por llamada
`/email/batch`. Una campaña mayor se divide internamente en bloques de 500 y
se procesa mediante una cola durable.

Este documento complementa:

- [Arquitectura Postmark](./02-arquitectura-postmark.md)
- [Seguridad y operación](./03-seguridad-y-operacion.md)
- [Incidente de lote 1001 y persistencia parcial](./09-incidente-lote-1001-20261002.md)

## Resultado esperado

Para campañas simultáneas:

```text
Tenant A: 1,690 destinatarios -> 4 bloques: 500 + 500 + 500 + 190
Tenant B: 3,825 destinatarios -> 8 bloques: 500 + 500 + 500 + 500 + 500 + 500 + 500 + 325
Tenant C: 2,892 destinatarios -> 6 bloques: 500 + 500 + 500 + 500 + 500 + 392
```

El sistema crea 18 bloques independientes. Los 18 quedan persistidos, pero no
se ejecutan todos en paralelo. El scheduler aplica concurrencia global,
concurrencia por tenant, límites de proveedor y reintentos. Los bloques que no
puedan ejecutarse inmediatamente permanecen en cola; no se descartan ni se
marcan como enviados.

## Principios no negociables

1. La API no renderiza mensajes ni llama a Postmark.
2. El worker Postmark dedicado permanece activo; solo se desactiva el worker
   embebido dentro de FastAPI.
3. Un bloque contiene mensajes de un solo tenant, campaña, canal y Message
   Stream.
4. Cada llamada a `/email/batch` contiene como máximo 500 mensajes.
5. Todo destinatario tiene un estado local individual y trazable.
6. La aceptación por Postmark y la entrega al destinatario son estados
   diferentes.
7. Un reinicio o timeout debe permitir reanudar sin duplicar aceptaciones.
8. Un tenant no puede monopolizar la cola completa.
9. La cuota y los límites se reservan de manera atómica.
10. Los secretos, tokens y credenciales nunca llegan al panel ni a logs.

## Arquitectura objetivo

```text
Panel
  |
  | POST crear campaña
  v
FastAPI / servicio de campañas
  | valida permisos, tenant, dominio, supresiones y cuota
  | crea snapshot e idempotency key
  | responde 202 con batch_id
  v
Cola durable de preparación
  |
  v
talia-postmark-preparer.service
  | construye targets y bloques con operaciones masivas
  | genera bloques de máximo 500
  v
Cola durable de entrega
  |
  v
talia-email-worker.service
  | scheduler justo por tenant
  | límites globales y por tenant
  | una llamada /email/batch por bloque
  v
Postmark
  |
  | acepta o rechaza cada elemento
  v
Recepción rápida de webhooks
  |
  v
Worker de eventos y métricas
```

`talia-api.service` debe tener desactivado el worker Postmark interno mediante
`POSTMARK_WORKER_IN_API=false`. Esto no desactiva `talia-email-worker.service`
ni `talia-postmark-preparer.service`; esos procesos son la ruta operativa
permanente para preparar y entregar correo.

## Flujo de una campaña

### 1. Creación

El endpoint recibe una selección o filtros autorizados y realiza únicamente:

- validación de permisos y organización;
- validación de dominio, remitente, stream y plantilla;
- validación de opt-out y supresiones;
- cálculo y reserva de cuota;
- persistencia del batch y su clave de idempotencia;
- creación de una orden durable de preparación.

La respuesta debe ser `202 Accepted`:

```json
{
  "batch_id": "uuid",
  "estado": "pendiente",
  "total_destinatarios": 8420,
  "preparacion_asincrona": true
}
```

La solicitud no debe esperar a que se rendericen los mensajes ni a que
Postmark acepte el envío.

### 2. Preparación

El preparador reclama una orden con lease. La operación debe ser masiva y
set-based en PostgreSQL/Supabase, evitando una llamada HTTP por destinatario.

Debe persistir columnas explícitas como:

- `organizacion_id`;
- `campaign_batch_id`;
- `prospecto_id`;
- `canal`;
- `message_stream`;
- `ordinal`;
- `estado_preparacion`;
- `attempt_count`;
- `claimed_at`;
- `lease_until`;
- `prepared_at`;
- `last_error`.

El snapshot de contenido puede conservarse como contenido variable de la
campaña, pero tenant, destinatario, estado, orden, intentos y timestamps deben
ser columnas explícitas y consultables.

### 3. Creación de bloques

Una campaña de `N` destinatarios genera:

```text
ceil(N / 500) bloques
```

Cada bloque tiene:

- `block_number`;
- `message_count`;
- `status`;
- `provider`;
- `message_stream`;
- `claimed_at`;
- `lease_until`;
- `attempt_count`;
- `submitted_at`;
- `last_error`.

Restricciones recomendadas:

```text
UNIQUE (organizacion_id, campaign_batch_id, block_number)
UNIQUE (organizacion_id, campaign_batch_id, prospecto_id, canal)
```

### 4. Scheduler multi-tenant

El worker no debe tomar todos los bloques de un solo tenant. Debe aplicar
round-robin o fair scheduling:

```text
Tenant A -> bloque 1
Tenant B -> bloque 1
Tenant C -> bloque 1
Tenant A -> bloque 2
Tenant B -> bloque 2
Tenant C -> bloque 2
```

La configuración inicial recomendada es:

```text
concurrencia global: 2 bloques
concurrencia por tenant: 1 bloque
tamaño máximo: 500 mensajes
límite global del proveedor: configurable
límite por tenant: configurable
```

La concurrencia global se puede subir después de medir CPU, memoria,
conexiones, latencia de Supabase y respuestas de Postmark. No debe aumentarse
solo porque haya más mensajes pendientes.

El scheduler debe usar una reclamación atómica equivalente a `FOR UPDATE SKIP
LOCKED`, implementada mediante RPC si el acceso se realiza por Supabase REST.

### 5. Entrega al proveedor

El worker reclama exclusivamente un bloque `ready` completo. Construye un
payload de hasta 500 elementos y hace una sola llamada a `/email/batch`.

La respuesta de Postmark se guarda inmediatamente por elemento. Un resultado
exitoso de algunos elementos no convierte automáticamente en exitosos a los
demás.

### 6. Eventos posteriores

Postmark puede enviar posteriormente eventos de entrega, rebote, queja,
apertura, clic o baja. El webhook debe:

1. autenticar la solicitud;
2. validar el tenant por configuración del servidor, nunca por un campo
   recibido como autoridad;
3. persistir una recepción idempotente mínima;
4. responder rápidamente;
5. delegar procesamiento, métricas y supresiones a un worker.

## Estados: enviado no significa entregado

La interfaz y la base de datos deben distinguir al menos cuatro conceptos.

### Estado local de preparación

Indica si Talia construyó correctamente el mensaje:

```text
pendiente
preparando
preparado
fallido_preparacion
```

`preparado` significa que Talia tiene el contenido listo. No significa que
Postmark lo haya recibido.

### Estado de aceptación del proveedor

Indica el resultado de la llamada a Postmark:

```text
pendiente_envio
enviando
aceptado_por_proveedor
rechazado_por_proveedor
error_transitorio
```

`aceptado_por_proveedor` significa que Postmark aceptó el elemento y devolvió
un identificador externo, normalmente `MessageID`. Es correcto mostrarlo como
“Enviado” solo si la interfaz aclara que significa “aceptado por el servicio de
correo”. No significa que llegó a la bandeja del destinatario.

### Estado de entrega al destinatario

Se obtiene mediante eventos posteriores del proveedor:

```text
pendiente_confirmacion
entregado
rebotado
queja
cancelado_baja
desconocido
```

`entregado` significa que el proveedor confirmó la entrega al servidor de
correo destinatario. Incluso este estado no garantiza que la persona haya
leído el mensaje.

### Estado de lectura o interacción

Es independiente de la entrega:

```text
sin_interaccion
abierto
clic
```

La secuencia conceptual es:

```text
preparado
  -> aceptado por Postmark
  -> entregado al servidor destinatario
  -> abierto o con clic
```

También puede terminar así:

```text
preparado
  -> rechazado por Postmark
```

o:

```text
aceptado por Postmark
  -> rebotado
```

La UI no debe usar “Entregado” inmediatamente después de la respuesta de
Postmark. Debe mostrar, por ejemplo:

| Estado visible | Significado |
|---|---|
| Preparando | Talia aún está construyendo el mensaje |
| En cola | El mensaje espera capacidad del worker |
| Enviado | El proveedor aceptó el mensaje |
| Entregado | El proveedor confirmó entrega al servidor destino |
| Rebotado | El servidor destino rechazó o no pudo recibirlo |
| Queja | El destinatario reportó el mensaje |
| Baja | El destinatario quedó suprimido |
| Error | No fue aceptado o agotó reintentos |

## Idempotencia y reintentos

La idempotencia debe existir en tres niveles:

1. **Campaña:** `organizacion_id + solicitud_idempotencia` evita campañas
   duplicadas por doble clic o reintento HTTP.
2. **Destinatario:** `campaign_batch_id + prospecto_id + canal` evita crear
   dos mensajes locales para el mismo destinatario.
3. **Proveedor:** `provider + MessageID + tipo_evento` evita duplicar eventos
   de webhook.

Los bloques necesitan lease, contador de intentos y `next_retry_at`. Un worker
reiniciado debe recuperar únicamente bloques cuyo lease expiró y que no tienen
aceptación durable. Un bloque con resultados parciales se debe reconciliar por
destinatario antes de reenviar.

Recomendación inicial:

```text
intento 1: inmediato
intento 2: 30 segundos
intento 3: 2 minutos
intento 4: 10 minutos
después: error_final y alerta operativa
```

Los tiempos deben ser configuración explícita y no deben utilizarse para
ocultar errores permanentes como destinatarios suprimidos.

## Cuotas y backpressure

La reserva de cuota debe ser atómica antes de poner la campaña en `ready`.
Si no hay capacidad, la campaña permanece pendiente con una razón visible:

```text
cuota_insuficiente
limite_tenant
limite_proveedor
worker_saturado
dominio_no_activo
```

El sistema no debe aceptar ilimitadamente campañas mientras el worker está
saturado. Debe controlar la profundidad de cola y alertar cuando aumente la
edad del bloque más antiguo.

La cuota reservada debe liberarse o ajustarse si la preparación falla antes de
que exista una aceptación del proveedor. Los mensajes aceptados no se deben
liberar automáticamente por un error posterior de webhook.

## Cambios por capa

### Base de datos

- Completar o ajustar tablas de órdenes, targets y bloques.
- Crear índices por tenant, estado, `lease_until`, `next_retry_at` y batch.
- Agregar restricciones únicas para campaña, target y bloque.
- Crear RPC atómicas para reclamar, renovar, finalizar y recuperar leases.
- Persistir resultados individuales de Postmark.
- Separar columnas de aceptación, entrega, rebote, queja y baja.
- Mantener aislamiento por `organizacion_id` en cada consulta y RPC.

### Backend

- Mantener la API rápida y asíncrona.
- Desactivar el worker Postmark dentro de FastAPI.
- Mantener activos `talia-postmark-preparer.service` y
  `talia-email-worker.service`.
- Implementar scheduler justo por tenant.
- Aplicar límites globales y por tenant.
- Aplicar backoff, leases e idempotencia.
- No reportar “entregado” al recibir únicamente un `MessageID`.

### Frontend

- No bloquear la pantalla esperando preparación o envío.
- Mostrar progreso por campaña y por bloque.
- Separar “Enviado” de “Entregado”.
- Mostrar contadores: total, en cola, aceptados, entregados, rebotados y
  errores.
- Permitir cancelar únicamente bloques aún no aceptados por el proveedor.
- No exponer tokens, nombres técnicos de proveedor ni detalles internos.

### Operación

- Verificar que solo exista un worker de entrega activo para la misma cola.
- Monitorizar profundidad de cola, leases vencidos y edad del bloque más viejo.
- Monitorizar respuestas 429/5xx, timeouts y tasa de rebotes.
- Crear runbook de conciliación antes de reintentar campañas ambiguas.

## Pruebas de aceptación

Antes de habilitar campañas grandes se deben completar pruebas controladas:

| Prueba | Resultado esperado |
|---|---|
| 25 destinatarios | 1 bloque y estados individuales |
| 500 destinatarios | 1 llamada de 500 |
| 501 destinatarios | 2 llamadas: 500 + 1 |
| 1,427 destinatarios | 3 llamadas: 500 + 500 + 427 |
| Tres tenants simultáneos | round-robin sin monopolio |
| Reinicio durante preparación | reanudación sin duplicados |
| Reinicio durante entrega | conciliación antes de reintentar |
| Timeout de Supabase | bloque reintentable, no campaña perdida |
| Error parcial de Postmark | solo se reintentan elementos no aceptados |
| Webhook repetido | un solo evento efectivo |

Para una prueba de 1,427, la evidencia mínima debe mostrar:

```text
1 campaña
3 bloques completos
500 + 500 + 427 elementos
3 llamadas a /email/batch
resultados individuales
aceptaciones conciliadas
eventos de entrega posteriores
sin duplicados
```

## Criterio de terminado

El refactor no se considerará terminado porque el worker esté activo o porque
Postmark acepte una prueba pequeña. Se considerará terminado cuando:

- la API responda sin esperar preparación ni proveedor;
- campañas simultáneas de varios tenants permanezcan en cola de forma justa;
- cada llamada tenga como máximo 500 mensajes;
- los bloques sean reanudables e idempotentes;
- aceptación y entrega sean estados diferentes en base de datos y panel;
- existan evidencias de `MessageID` y de webhooks de entrega;
- los reintentos no dupliquen mensajes aceptados;
- los timeouts de Supabase generen recuperación y alerta;
- las pruebas 25/500/501/1427 sean satisfactorias.

