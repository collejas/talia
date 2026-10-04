# Incidente de envío masivo y saturación de Supabase — 2026-10-02

## Estado

Diagnóstico documentado. No se modificaron datos ni se repitió el envío. La
corrección queda pendiente de implementación y validación controlada.

## Resumen

Al intentar enviar 1001 prospectos desde
`/api/prospeccion/prospectos/contactar`, el navegador recibió `HTTP 502` después
de aproximadamente 42 segundos. La respuesta no demuestra que no se hubiera
persistido trabajo: la base contiene dos lotes relacionados con la ventana del
incidente y con persistencia parcial.

Después del `POST`, la vista intentó recargar prospectos y recibió solicitudes
de 9 a 11 segundos que terminaron en `HTTP 502`. El `NS_BINDING_ABORTED` de la
solicitud anterior es consecuencia de que el frontend cancela la petición
anterior al iniciar otra; no significa que el resultado del paginador esté
vacío.

## Evidencia de los lotes

Tenant revisado: `00000000-0000-0000-0000-000000000001`.

### Lote `f126d4ea-cae3-4bd9-a501-a97b0ae61fad`

- Creado: `2026-10-02 23:17:20 UTC`.
- Prospectos solicitados: 1001.
- Targets Postmark persistidos: 500.
- Targets: 500 en estado `pendiente`.
- Envíos operativos: 0.
- Estado del lote: `pendiente`.
- `solicitud_idempotencia`: `NULL`.

### Lote `4e9070a1-8277-4603-b4b0-5092920b0771`

- Creado: `2026-10-02 23:18:38 UTC`.
- Prospectos solicitados: 1001.
- Targets Postmark persistidos: 1001.
- Targets: 500 `fallido`, 500 `procesando` y 1 `preparado`.
- Envíos operativos persistidos al momento de la revisión: 1 pendiente.
- Preparación: 1001 objetivos, 1 preparado y 500 fallidos.
- Error: `postmark_target_preparation_failed`.
- `solicitud_idempotencia`: `NULL`.

No se debe interpretar `procesando`, `preparado` o `pendiente` como entregado
por Postmark. La aceptación, entrega, rebote y apertura requieren el
`MessageID` y los eventos del proveedor.

## Causas confirmadas

### 1. La petición HTTP conserva demasiado trabajo

El endpoint actual valida la selección, construye el manifiesto, inserta los
targets y arranca la preparación dentro del mismo flujo HTTP. Aunque la
persistencia divide los targets en bloques de hasta 500, las llamadas todavía
se ejecutan durante la petición del usuario.

Cuando Supabase se degrada, el usuario recibe `502` después de que una parte de
la operación ya pudo haber sido confirmada.

### 2. Idempotencia no persistida

El navegador envió `Idempotency-Key`, pero ambos registros quedaron con
`solicitud_idempotencia = NULL`. Por ello, un reintento no pudo reutilizar el
lote anterior y creó otra operación parcial.

La idempotencia debe persistirse y protegerse con una restricción única por
organización y clave. No debe depender únicamente de la memoria del endpoint o
del estado del navegador.

### 3. Fallas de Supabase durante la ventana

En la misma ventana se registraron `57014 canceling statement due to statement
timeout`, `database_unreachable`, errores de schema cache y errores de red al
insertar targets Postmark. También fallaron temporalmente operaciones de
webhooks y workers porque no podían leer o actualizar Supabase.

### 4. Recarga pesada posterior al envío

Después del `POST`, la vista vuelve a solicitar hasta 500 prospectos con
filtros, `offset`, conteo exacto y una selección amplia de columnas. Esa
consulta también agotó el tiempo de Supabase, agravando la percepción de que
el envío no se había registrado.

## Plan de mejora

### Fase A — Seguridad operativa inmediata

1. No repetir envíos de los lotes afectados hasta conciliarlos.
2. Consultar targets, envíos operativos y eventos Postmark por lote.
3. Marcar lotes parciales o indeterminados como `requiere_revision`.
4. No incrementar contadores por selección solicitada; usar envíos operativos
   creados y estados confirmados.

### Fase B — Idempotencia durable

1. Persistir siempre `Idempotency-Key` en el lote.
2. Crear una restricción única por organización y clave de idempotencia.
3. Hacer que un reintento devuelva el lote existente, no cree otro.
4. Registrar cada intento sin exponer la clave completa en logs.

### Fase C — Desacoplamiento del endpoint

1. El endpoint debe validar y crear únicamente la orden de campaña.
2. Debe devolver `202 Accepted` con `batch_id` y estado `preparando`.
3. La creación de targets debe ejecutarse en el worker de preparación.
4. El worker debe procesar bloques independientes de máximo 500.
5. Un fallo de un bloque no debe invalidar ni duplicar los demás bloques.
6. Cada bloque debe tener estado, intento, lease y último error propios.

### Fase D — Protección de Supabase

1. Aplicar backoff y límites de concurrencia por tenant y globales.
2. Evitar reintentos simultáneos de la misma operación.
3. Separar los workers de correo, Brevo y WhatsApp.
4. Sacar métricas, refreshes y consultas auxiliares del camino crítico.
5. Medir `selection_ms`, `manifest_ms`, `target_insert_ms`,
   `preparation_ms` y `provider_submit_ms` por separado.

### Fase E — Recarga del panel

1. No recargar automáticamente el listado pesado después de crear el lote.
2. Actualizar solo el resumen del lote mediante el progreso del batch.
3. Cargar la lista de prospectos de forma independiente y degradable.
4. Separar el total exacto, indicadores y datos de la tabla.

## Criterios de cierre

- Una solicitud masiva responde en menos de 2 segundos en condiciones normales.
- Un envío de 1001 genera exactamente tres bloques lógicos: 500, 500 y 1.
- Un reintento con la misma clave devuelve el mismo `batch_id`.
- Un timeout posterior a un commit no duplica targets ni envíos.
- Cada bloque muestra preparados, aceptados, rechazados y pendientes.
- La vista no depende de que termine la preparación.
- No se reproducen `57014` en una prueba controlada de carga.

## Ejecución inicial del plan — 2026-10-02

Se implementó la primera corrección estructural:

- Se creó `prospeccion_postmark_campaign_preparation_jobs` como cola durable,
  aislada del flujo de Brevo.
- La petición Postmark ya no inserta targets ni envíos operativos. Persiste un
  manifiesto y devuelve `202 Accepted`.
- El worker `talia-postmark-preparer.service` reclama manifiestos con lease,
  reintentos y `SKIP LOCKED`, y materializa los targets después en bloques de
  máximo 500.
- Un worker puede reanudar un manifiesto parcialmente materializado porque la
  inserción de targets sigue siendo idempotente por lote, prospecto y canal.
- La cola queda protegida con RLS sin acceso para `anon` ni `authenticated`; la
  ejecución queda limitada a `service_role`.

### Evidencia de verificación

- Migración aplicada: `20261002_233000_postmark_manifest_queue.sql`.
- La base confirmó la existencia de la tabla y de las dos RPC nuevas.
- La prueba de `worker_claim_postmark_preparation_jobs(5, 900)` no reclamó
  trabajos cuando la cola estaba vacía.
- `compileall`, `git diff --check` y las pruebas de `contactar_prospectos`
  terminaron correctamente: `2 passed`.

### Pendiente antes de prueba masiva

1. Reiniciar el preparador y el worker de correo para cargar el código nuevo.
2. Probar primero con 10, después 500 y finalmente 1001 destinatarios.
3. Verificar que la respuesta HTTP sea inmediata, que se cree una sola cola y
   que el worker produzca exactamente bloques de 500, 500 y 1.
4. Confirmar en Postmark y en Talia la aceptación individual de cada mensaje.
5. Mantener sin cambios el flujo Brevo durante toda la prueba.

## Corrección aplicada y recuperación — 2026-10-03

- Se reencolaron targets Postmark fallidos por red/RPC y se creó la orden de
  preparación durable para lotes que habían quedado con targets sin materializar.
- La finalización de envíos se dividió en subbloques de 100 dentro del límite
  público de 500 para reducir `57014` bajo concurrencia.
- La RPC del worker tiene un timeout específico de 30 segundos, sin modificar
  el timeout global de PostgREST.
- Se actualizaron índices de lotes, targets y envíos para reducir recorridos en
  preparación y filtros por campaña.
- Se actualizó la caché de atribución del 2026-10-03: 7 filas y última
  actualización registrada a las 23:49 UTC.
- La vista de métricas ahora muestra advertencias explícitas cuando la caché de
  atribución está vacía, atrasada o la serie temporal falla.

## Ajuste posterior de métricas y filtros — 2026-10-04

- Se confirmó que el tenant opera en `America/Mexico_City`; el snapshot se
  generó para el rango exacto que usa el filtro de últimos 7 días:
  `2026-09-27 06:00Z` a `2026-10-04 06:00Z`.
- La ruta de métricas dejó de ejecutar consultas de WhatsApp cuando el canal
  seleccionado es `correo`, reduciendo trabajo innecesario y la exposición a
  `57014`.
- Si se solicita un periodo que todavía no tiene snapshot exacto, la API lo
  genera una sola vez con límite de 15 segundos y después lee el resultado
  persistido. Así el panel no muestra cero como si fuera un dato real.
- La carga del panel ahora envía `include_whatsapp_channels` según el canal
  seleccionado, en lugar de pedir WhatsApp también para correo.
