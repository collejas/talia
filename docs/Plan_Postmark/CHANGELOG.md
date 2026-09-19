# Próxima entrega

- La función de cierre de bloques califica explícitamente `delivery_batch_id` para evitar que el nombre de la columna de salida PL/pgSQL entre en conflicto con la columna de mensajes.
- El worker de entrega usa `/email/batch` para agrupar hasta 500 mensajes por tenant, tipo y stream, conservando el resultado individual de cada destinatario.
- La separación operativa de 5 segundos se aplica entre lotes y no entre correos individuales; se mantiene una única ejecución concurrente por worker para no sobrecargar Talia ni mezclar tenants.
- Los lotes `broadcast` y `transactional` se envían por separado (`broadcast` y `outbound`) y continúan usando la cuota, la idempotencia y los webhooks existentes.

# Changelog — Plan Postmark

Registro de avances, decisiones, validaciones y pendientes de la migración del correo de Talia.

## [2026-09-19] — Implementación del preparador y cola durable de webhooks

### Cambios

- Se agregó `tenant_email_delivery_batches` para persistir bloques homogéneos de hasta 500 mensajes por tenant, lote, tipo y stream.
- Se agregó `delivery_batch_id` a `tenant_email_messages` para impedir que un mensaje preparado salga por el claim genérico.
- Se agregaron RPCs para preparar bloques, reclamarlos con `SKIP LOCKED` y cerrar su estado sin mantener transacciones abiertas durante la llamada externa.
- Se creó `backend/app/workers/postmark_preparer.py` y la unidad `talia-postmark-preparer.service`; este proceso prepara Postmark sin llamar al proveedor.
- `talia-email-worker.service` quedó dedicado a entrega Brevo/Postmark y ya no inicia el sender de preparación Postmark.
- La entrega Postmark reclama bloques preparados y realiza `/email/batch`; el fallback legado sólo atiende mensajes sin bloque durante la transición.
- Se agregó `tenant_email_webhook_jobs` con claim, lease, reintentos e idempotencia.
- El endpoint Postmark ahora persiste el trabajo y responde rápidamente; el worker procesa posteriormente el evento y sus supresiones/métricas.

### Seguridad y aislamiento

- La cola de lotes y la cola de webhooks son exclusivas de `service_role` y mantienen `organizacion_id`/servidor como parte de sus claves operativas.
- Brevo y WhatsApp no comparten la preparación Postmark ni sus límites de concurrencia.
- El payload JSON sólo conserva el contenido crudo del webhook; los estados, tenant, servidor, evento, intentos y leases son columnas explícitas.

### Validaciones

- Compilación de backend: aprobada.
- Pruebas enfocadas Postmark, integración Postmark y sender de prospección: `37 passed`.
- `git diff --check`: aprobado.

### Pendientes operativos

- Aplicar la migración `20260922_120000_postmark_preparation_and_webhook_queue.sql`.
- Instalar y arrancar `talia-postmark-preparer.service`; no se reiniciaron servicios desde este cambio.
- Ejecutar pruebas reales de 25, 500 y más de 500 mensajes y confirmar CPU, memoria, Supabase, tamaño de payload y llamadas `/email/batch`.

## [2026-09-19] — Plan de aislamiento de preparación y entrega

### Fase siguiente aprobada: preparación masiva sin latencia de API

La separación de workers ya evita que la entrega Postmark bloquee la API, pero
la preparación todavía procesa cada destinatario con operaciones repetidas.
En la prueba del lote `aa7beb0f-3e04-49b3-8722-91dd3432ea53`, 10 mensajes
terminaron en un único `/email/batch`, pero la preparación tardó cerca de un
minuto antes de crear el bloque.

La siguiente implementación deberá:

- Mantener la solicitud HTTP limitada a crear el trabajo y devolver su estado.
- Cargar en una sola operación acotada los contactos y el contexto invariable
  del tenant, plantilla, dominio, remitente, imágenes y enlaces.
- Renderizar los mensajes en memoria y persistirlos mediante inserciones o RPCs
  agrupadas, en transacciones cortas de 100–250 filas.
- Crear bloques homogéneos de hasta 500 mensajes sin mezclar tenant, tipo ni
  stream.
- Entregar cada bloque con una sola llamada `/email/batch`.
- Ejecutar las actualizaciones de prospección y bitácoras en operaciones
  agrupadas posteriores, sin retrasar la creación del payload.
- Mantener Brevo y WhatsApp sin cambios de cola, proveedor, cuota o límites.

No se aumentará la concurrencia de forma agresiva en el servidor de 1 GB. La
preparación conservará inicialmente 2–4 tareas concurrentes y el worker de
entrega mantendrá un batch activo por tenant, con backpressure medible.

### Criterios adicionales de aceptación

- El panel no espera la preparación ni la aceptación de Postmark.
- Un lote de 500 produce un bloque persistido con 500 objetos y una llamada
  `/email/batch`, salvo el corte documentado por tamaño de payload.
- La preparación masiva no ejecuta una consulta o escritura completa por
  destinatario.
- El tiempo de preparación, inserción y entrega queda medido por lote.
- Un reinicio conserva bloques `ready` y no duplica mensajes aceptados.
- La latencia de la API y el consumo de CPU/memoria se comparan contra una
  línea base antes de habilitar mayor concurrencia.

### Primera implementación de la fase

- `talia-postmark-preparer.service` reutiliza durante cada ciclo el contexto
  estable del tenant: URL pública, imágenes de plantilla, dominio verificado y
  activación de Postmark.
- El cache se reinicia por ciclo para no conservar cambios de configuración y
  usa exclusión mutua para evitar consultas duplicadas entre tareas concurrentes.
- Brevo y WhatsApp no utilizan este cache ni modifican sus límites.
- La siguiente iteración todavía debe sustituir las escrituras por destinatario
  por inserciones/RPCs agrupadas; no se marca esta fase como terminada hasta
  medir esa mejora con lotes de 500.

### Validación del lote 3ccecddd

- El lote de 10 mensajes terminó en una sola llamada `/email/batch`.
- Los 10 mensajes quedaron en `submitted` y el batch terminó correctamente.
- La preparación tardó aproximadamente 64 segundos.
- La reutilización de contexto no eliminó la latencia principal; persisten
  operaciones individuales por destinatario.
- Siguiente paso: RPC/inserción masiva para mensajes, cuota, actualizaciones de
  prospección y bitácoras, manteniendo transacciones cortas e idempotencia.

### Diagnóstico

- La prueba de 25 mensajes confirmó que el worker ya puede enviar un único `postmark.batch_dispatch` con `batch_size=25`; la integración `/email/batch` funciona.
- La latencia observada se concentra antes de Postmark: la preparación actual ejecuta trabajo por destinatario, realiza operaciones repetidas contra repositorios/Supabase y usa concurrencia de mensajes.
- Bajo carga se observaron ciclos de preparación de aproximadamente 31–34 segundos, consumo relevante de CPU en API y worker de correo, y timeouts de Supabase durante la persistencia de webhooks.
- Esperar a que el lote esté completo no es el problema principal; el problema es preparar y persistir destinatarios individualmente mientras la aplicación comparte recursos con los workers.

### Decisión aprobada

- La API sólo crea el lote, registra la intención, reserva la cuota y encola el trabajo; no renderiza ni envía los mensajes dentro de la solicitud HTTP.
- Un worker de preparación carga una vez el contexto invariable del tenant y construye bloques homogéneos de máximo 500 mensajes.
- Un worker de entrega reclama únicamente bloques `ready` y realiza una llamada `/email/batch` por bloque.
- La concurrencia se limita por batch completo; no se usa una pausa de cinco segundos entre mensajes individuales.
- El payload completo y el resultado individual de cada elemento deben conservarse localmente con estados e idempotencia explícitos.
- Los webhooks deben persistirse rápidamente y procesarse de forma asíncrona para no competir con la preparación ni bloquear el endpoint.
- Brevo, Postmark y WhatsApp mantienen workers, límites, backpressure y métricas independientes.

### Criterios de aceptación

- Crear un lote responde al panel sin esperar la preparación o la aceptación del proveedor.
- Una campaña Postmark de 500 mensajes debajo del límite de tamaño produce una sola llamada `/email/batch` con 500 objetos.
- Una campaña de más de 500 se divide en bloques de 500 sin mezclar tenant, tipo ni stream.
- CPU, memoria, conexiones y latencia de la API permanecen dentro de los umbrales definidos durante una prueba concurrente.
- Un timeout o reinicio no duplica mensajes aceptados ni elimina bloques preparados.
- Un error de webhook se reintenta sin duplicar eventos ni detener la API.

### Pendientes

- Crear o adaptar la entidad persistente de bloque preparado con columnas explícitas y estados `created`, `preparing`, `ready`, `sending`, `submitted`, `retry_wait` y `failed`.
- Separar definitivamente el worker de preparación del worker de entrega.
- Sustituir consultas repetidas por destinatario por carga de contexto y operaciones agrupadas.
- Implementar backpressure medible para Postmark sin modificar límites de Brevo ni WhatsApp.
- Ejecutar pruebas de 25, 500 y más de 500 mensajes y documentar CPU, memoria, Supabase, duración, payload y llamadas reales a Postmark.
- Implementar la fase de preparación masiva y medirla antes de elevar la concurrencia.

## [2026-09-19] — Persistencia agrupada del preparador Postmark

- Se agregó la migración `20260922_160000_postmark_bulk_queue.sql` con una RPC
  limitada a 500 elementos y ejecución exclusiva de `service_role`.
- La RPC materializa los campos de cada mensaje en columnas explícitas y
  reutiliza la validación de cuota/idempotencia existente; el JSON sólo es
  transporte transitorio.
- El preparador agrupa mensajes por tenant, reutiliza contexto invariable y
  mantiene separadas las rutas de Brevo y WhatsApp.
- La fase queda pendiente de medición real con lotes de 500 para confirmar que
  el grupo concurrente alcanza el tamaño objetivo sin saturar Supabase o CPU.
- El preparador registra `postmark.bulk_queue_flush` con `item_count`,
  `result_count` y duración para medir el tamaño efectivo de cada agrupación.
- Se corrigió la espera por mensaje: el renderizado libera la concurrencia,
  la RPC se ejecuta al cerrar el bloque y los estados se finalizan después con
  los IDs individuales retornados.

## [2026-09-18] — Batch real de 500 y límite de payload

- El worker reclama hasta 500 mensajes por tenant y ciclo.
- La entrega usa `/email/batch` con máximo de 500 destinatarios por llamada.
- Los mensajes se separan por tipo y stream, y además se cortan antes de 45 MiB para conservar margen frente al límite de 50 MiB del proveedor.
- La respuesta individual de Postmark continúa cerrando cada intento por separado; no se combinan estados ni idempotencias.
- `POSTMARK_SYNC_ENABLED` permanece desactivado deliberadamente: esta entrega no reactiva todavía la sincronización histórica.

## [2026-09-14] — Sincronización integral por tenant

- Se inició la implementación segura del sincronizador: las recepciones de webhook ahora quedan preparadas para persistir `X-PM-Webhook-Trace-Id` junto con tenant, servidor, tipo y mensaje.
- Se agregaron y aplicaron `tenant_email_sync_runs` y `tenant_email_sync_checkpoints` para reanudar la sincronización por tenant/servidor/stream y auditar resultados sin habilitar purgas.
- El worker quedó preparado para ejecutar una página histórica por tenant y stream en cada ciclo de conciliación, con ventana de 45 días y activación explícita mediante `POSTMARK_SYNC_ENABLED`; permanece desactivado hasta completar la validación del piloto.
- Se agregó y aplicó la reclamación atómica de checkpoints mediante `tenant_email_claim_sync_checkpoint`, con expiración de bloqueo de 30 minutos para recuperar trabajos interrumpidos sin duplicar ciclos concurrentes.
- Se agregó un timeout configurable por página (`POSTMARK_SYNC_PAGE_TIMEOUT_SECONDS`, 120 segundos por defecto); la activación automática queda pausada hasta optimizar la consulta de detalles históricos.
- Se corrigió la ventana del worker para usar fechas diarias estables en lugar de timestamps variables; así el checkpoint puede continuar desde el siguiente `offset` durante el mismo día.
- El worker ahora libera y omite un checkpoint ya completo durante el mismo día, evitando descargar repetidamente la misma página; los nuevos eventos continúan llegando por webhook.
- La sincronización diaria del worker incorpora la `Bounce API` de Broadcast para mantener hard bounces y supresiones del tenant sin depender de una ejecución manual.
- Se documentó la sincronización de mensajes, entregas, rebotes, quejas, aperturas, clics, cambios de suscripción, estadísticas e inbound que Postmark permita recuperar.
- Se separaron los dos mecanismos necesarios: webhooks para tiempo real y API histórica para carga inicial, conciliación y recuperación de ventanas faltantes.
- Se definió que cada consulta debe usar el Server API Token y el servidor propio del tenant, con checkpoints, paginación, reintentos, deduplicación y auditoría.
- Se documentó la diferencia entre mensajes, destinatarios y eventos, incluyendo que los totales de Messages API no sustituyen los contadores por destinatario.
- Se ajustó la operación de webhooks con la documentación oficial: `X-PM-Webhook-Trace-Id` para deduplicar reintentos, `X-PM-Retries-Remaining` para diagnóstico, allowlist de rangos IP de Postmark y reglas distintas para fallos reintentables y 4xx permanentes.
- Se documentó que la verificación y posible pausa se gestionan por tipo de evento, por lo que la provisión debe verificar cada evento habilitado.
- Se estableció que la retención de Postmark no limita el historial de Talia: el sincronizador será incremental, sólo hará upsert y nunca borrará datos locales por ausencia o expiración en Postmark.
- Se estableció que una coincidencia ambigua no marcará automáticamente un correo como enviado y que borrar filas locales no modifica el historial de Postmark.
- La implementación existente ya cuenta con cliente/servicio para consultas parciales; queda pendiente completar el importador de todos los eventos disponibles, sus checkpoints y la conciliación validada en producción.

## [2026-09-13] — Inicio del refactor de aislamiento por tenant

- Se agregó la migración `20260913_220000_postmark_tenant_servers.sql` con un registro explícito por tenant en `tenant_email_servers`.
- Dominios y mensajes ya pueden conservar la referencia al servidor Postmark que les corresponde.
- El worker resuelve el Server API Token desde `public.secretos` cifrado y deja de depender del token global para tenants reconciliados.
- Se agregó provisión administrativa desde backend; la respuesta nunca expone tokens.
- El servidor existente de Postmark (`20008586`) quedó reservado exclusivamente para el tenant maestro; los demás tenants no reutilizan ese servidor ni su token.
- Se agregó integridad referencial compuesta para impedir que un dominio o mensaje se asigne al servidor de otro tenant.
- Se definió la provisión automática del servidor después de pago confirmado o activación manual del tenant maestro, mediante un proceso idempotente y asíncrono.
- La suspensión bloquea envíos sin eliminar el servidor ni sus métricas; la reactivación reutiliza el servidor existente.
- Se documentó que la provisión debe configurar y verificar automáticamente webhooks de entrega, rebote, queja, apertura, clic, suscripción e inbound por servidor/tenant.

## [2026-09-13]

### Decisión confirmada

- GEOACTIV operará una cuenta maestra de Postmark.
- Cada tenant tendrá su propio servidor Postmark, Server API Token, streams, webhooks, inbound, dominios, Return-Path, supresiones, métricas y cuota.
- Los clientes configurarán el servicio desde Talia y no necesitarán acceso directo a Postmark.
- El Account API Token quedará restringido a backend y tareas de plataforma; los Server API Tokens se administrarán como secretos separados por tenant.
- Se elimina del diseño objetivo el uso de servidores, tokens, streams Broadcast y supresiones compartidos entre tenants.

### Corrección necesaria

- La documentación anterior describía servidores globales por tipo de correo y un único token de servidor. Esa decisión queda reemplazada por el aislamiento completo por tenant.
- La separación por servidor no garantiza una IP dedicada; la asignación de IP depende del plan, volumen y política de Postmark.

## [2026-09-04]

### Coordinación con prospección

- Se revisó la separación estricta de envíos a la luz de la cola propia de Postmark.
- Se documentó que la reserva debe ocurrir también en `postmark-worker`, justo antes de la llamada externa; espaciar únicamente el encolamiento local no garantiza el intervalo real.
- Se distinguió el ID interno de `tenant_email_messages` del `MessageID` externo de Postmark.
- `proveedor_aceptado_en` queda reservado para la aceptación real del proveedor; la creación de la fila local se considera sólo `queued`.

## [2026-08-27]

### Cambios

- Se corrigió el alta idempotente de dominios para que un tenant con migración Postmark ya inicializada no provoque un error 500 al registrar su primer dominio.
- Se agregó la reclamación concurrente de mensajes Postmark con `FOR UPDATE SKIP LOCKED`, estado explícito `processing` y recuperación de reclamaciones obsoletas.
- Se conectó el worker aislado de Postmark al ciclo de vida de FastAPI, limitado a tenants con la migración Postmark habilitada.
- El worker conserva y utiliza el `stream_name` persistido al encolar; un cambio posterior de configuración no puede desviar un mensaje a otro stream.
- Se agregó `POSTMARK_WORKER_ENABLED`, desactivado por defecto, para impedir actividad del worker antes de configurar el piloto del tenant maestro.
- Se conectó el envío de correo de prospección al corte por tenant: tenants Postmark activos encolan en Postmark y los no migrados conservan temporalmente su proveedor anterior.
- La rama Postmark de prospección usa el remitente verificado del tenant, la plantilla seleccionada y su tipo `transactional` o `broadcast`, con una clave de idempotencia por envío.
- No existe fallback automático entre Postmark y el proveedor anterior dentro del mismo tenant.

### Validaciones

- La migración `postmark_queue_claim` fue aplicada y verificada en Supabase.
- La función de reclamación está restringida a `service_role`.
- Se validó el piloto real del tenant maestro: `administracion@talia.mx` fue aceptado y recibido; un destinatario `@geoactiv.mx` fue rechazado por la restricción de aprobación de Postmark.
- El rechazo del piloto fue conciliado como fallido y la cuota fue liberada.
- Pruebas Postmark y sender de prospección: 28 aprobadas; compilación del backend y `git diff --check`: aprobados.

### Pendientes

- Configurar de forma segura los tokens de cuenta/servidor y habilitar el worker únicamente durante el piloto.
- Registrar y verificar el primer dominio remitente del tenant maestro.
- Crear webhooks autenticados y procesar entrega, rebote, queja y supresión.
- Solicitar la aprobación de la cuenta Postmark para permitir destinatarios de dominios externos.
- Implementar y verificar webhooks de entrega, rebote, queja y supresión antes de retirar el proveedor anterior.
- Ejecutar una campaña controlada desde `prospeccion/prospectos` con el tenant maestro.

## [2026-08-29]

### Cambios

- Se agregó el aprovisionamiento automático de Postmark para cada tenant nuevo mediante un trigger de PostgreSQL sobre `organizaciones`.
- Cada tenant nuevo recibe estado Postmark pendiente y deshabilitado, plan mensual `included_10000` de 10,000 correos y su periodo de consumo actual.
- Se regularizaron los tenants existentes sin habilitar Postmark ni modificar dominios, remitentes o configuración de Brevo.

### Validaciones

- La migración `20260829_120000_provision_postmark_for_new_tenants` fue aplicada correctamente en Supabase.
- Los 9 tenants existentes tienen registro de migración, plan activo de 10,000 y periodo mensual actual.
- El trigger `organizaciones_provision_tenant_email_service` está activo y su función usa `SECURITY DEFINER` con `search_path` restringido.

### Pendientes

- Configurar dominio, DNS y remitente por cada tenant.
- Activar cada tenant únicamente después de validar su dominio y realizar una prueba controlada.
- Implementar y verificar webhooks de entrega, rebote, queja, apertura y clic.

## [2026-08-26]

### Cambios

- Se precisó la documentación de credenciales: Account API Token para dominios desde `Account -> API Tokens` y Server API Tokens por servidor para envíos; no se capturan en la vista del tenant.
- Se corrigió la configuración para usar un único `POSTMARK_SERVER_TOKEN` por servidor y seleccionar `MessageStream` mediante `POSTMARK_TRANSACTIONAL_STREAM` o `POSTMARK_BROADCAST_STREAM`.
- Se corrigió el identificador del stream de Broadcast a `broadcast`, que es el stream existente en el servidor Postmark piloto.
- Se agregó al constructor existente de `prospeccion/campanas` la selección explícita del tipo de correo; se persiste en `email_message_kind` y no dentro de `metadata`.
- Se agregó al servicio Postmark la preparación de mensajes en cola con validación de tenant, dominio verificado, plan, supresión, cuota e idempotencia; el `stream_name` se deriva del tipo de mensaje.
- Se agregó un worker Postmark aislado con reclamación segura por tenant y recuperación de mensajes en estado `processing` obsoleto; solo procesa migraciones Postmark habilitadas.
- Se corrigió el adaptador para usar `PUT /domains/{id}/verifyDkim` y `PUT /domains/{id}/verifyReturnPath`, y para leer `ReturnPathDomainCNAMEValue` según el contrato oficial actual.
- Se agregó el adaptador aislado `backend/app/integrations/postmark/` para llamadas HTTP al servicio de correo.
- Se agregaron contratos internos para mensajes y resultados individuales o batch.
- Se agregaron variables de configuración exclusivas del backend para tokens transaccional y broadcast, sin valores por defecto sensibles.
- El adaptador valida cuerpo, remitente, destinatario, asunto y el límite máximo de 500 mensajes por batch.
- Se agregó una migración nueva para conservar el contenido explícito del mensaje y reservar cuota con idempotencia en una transacción.
- Se agregó una migración de intentos de entrega para reclamar, cerrar y contabilizar mensajes Postmark de forma idempotente.
- Se agregó el endpoint tenant-scoped `GET /tenant/me/email-service` con autorización `settings.view`.
- Se agregó el panel de tenant para consultar estado, dominios, registros DNS y cuota sin exponer tokens ni identificadores del proveedor.
- Se agregó lectura administrativa protegida para consultar el correo de un tenant desde `settings/tenants/{tenantId}`.
- Se materializó la cuota inicial comercial de 10,000 mensajes mensuales por tenant en las tablas propias `tenant_email_plans` y `tenant_email_usage_periods`.
- Se agregó una RPC administrativa atómica y la auditoría `tenant_email_quota_changes` para ajustar la cuota actual por tenant.
- Se agregó el alta y verificación de dominios mediante Account API, con normalización de DKIM y Return-Path en columnas propias.
- Se agregaron rutas tenant y administrativas para registrar dominios y solicitar verificación sin exponer credenciales.
- El panel de `settings/variables` y el detalle de `settings/tenants/{tenantId}` muestran el formulario, los DNS y el estado de verificación.

### Decisiones

- El adaptador no resuelve tenant, permisos, cuotas ni persistencia; esas reglas permanecerán en servicios de negocio separados.
- Los envíos batch conservan el resultado de cada destinatario aunque la respuesta HTTP sea exitosa.
- Postmark no importa, reutiliza ni comparte implementación con Brevo o SMTP; ambos proveedores permanecen completamente separados.
- El panel ya consulta el servicio mediante un contrato neutral; los jobs y los envíos productivos todavía no están conectados.
- La reserva de cuota y la creación del registro local deben ocurrir antes de llamar al proveedor externo.
- Un mensaje aceptado por el proveedor queda en `submitted` hasta que un webhook confirme la entrega.
- El ciclo de entrega reclama el mensaje, llama únicamente al adaptador Postmark y cierra su intento en las tablas propias.

### Validaciones

- `backend/tests/integrations/postmark/test_client.py`: 4 pruebas aprobadas.
- `backend/tests/services/postmark/test_service.py`: 4 pruebas aprobadas.
- `git diff --check`: aprobado.
- `20260826_220000_postmark_queue_quota` fue aplicada y verificada en Supabase; agregó las columnas de contenido y la RPC atómica de cola/cuota.
- `20260826_230000_postmark_delivery_attempts` fue aplicada y verificada en Supabase; las RPC quedaron protegidas y no se crearon registros de prueba.
- `20260826_235000_reconcile_postmark_core` fue aplicada y verificada en Supabase; confirmó las 11 tablas originales, `FORCE RLS` y el único registro pendiente del tenant maestro sin reejecutar el DDL inicial.

### Estado

La cola y el worker aislado fueron completados posteriormente; los pendientes actuales se mantienen en la entrada del 2026-08-27.

## [No publicado]

### Base de datos

- Se creó la migración nueva `supabase/migrations/20260812_130000_email_service_core.sql`.
- Se agregaron tablas propias para migración por tenant, dominios, planes, cuotas, plantillas, mensajes, intentos, eventos, webhooks y supresiones.
- Se agregaron columnas explícitas, constraints, índices, RLS y claves compuestas para impedir referencias cross-tenant.
- Se agregó el ledger `tenant_email_usage_events` para auditar reservas, liberaciones y consumo de cuota sin depender únicamente de contadores agregados.
- Se inicializó únicamente el tenant maestro `00000000-0000-0000-0000-000000000001` en estado `pending` y con la funcionalidad desactivada.
- No se modificaron tablas ni migraciones de Brevo o de prospección existentes.

### Documentación

- Se creó el plan general de migración completa de Brevo a un servicio central de correo.
- Se definió una implementación nueva e independiente, sin reutilizar código, contratos ni tablas de Brevo.
- Se estableció el tenant maestro `00000000-0000-0000-0000-000000000001` como primer tenant de implementación y validación.
- Se definió la migración progresiva, tenant por tenant.
- Se documentó que no habrá fallback automático ni mezcla de proveedores dentro del mismo tenant.
- Se documentó la separación física de la implementación en carpetas propias de integración, servicios, schemas y pruebas.
- Se definió que el nombre del proveedor no debe aparecer en vistas, configuraciones, respuestas API, errores ni textos visibles para tenants.
- Se estableció el uso prioritario de columnas explícitas, foreign keys, constraints e índices.
- Se restringió el uso de `metadata`, `json`, `jsonb`, `payload`, `config` y `settings` a datos crudos o realmente variables que no formen parte de la lógica de negocio.
- Se documentaron cuotas, estados, idempotencia, webhooks, inbound, dominios, plantillas, supresiones, observabilidad, rollback y eliminación final de Brevo.
- Se agregó este archivo para registrar los siguientes avances de la implementación.
- Se documentaron como fuentes oficiales de infraestructura el [Postmark Manual](https://postmarkapp.com/manual) y la [Postmark Developer Documentation](https://postmarkapp.com/developer).
- Se definió que el Manual guiará la creación de cuenta, servidores, dominios, DNS, streams, pruebas, tracking, webhooks, DMARC e inbound.
- Se definió que la Developer Documentation será la referencia para APIs, contratos, librerías, templates, dominios, mensajes, supresiones y webhooks.

### Validaciones

- Se revisó la documentación oficial de Postmark sobre dominios, Message Streams, Bulk API, plantillas, webhooks e inbound.
- Se revisó el acoplamiento actual de Brevo en backend, panel, SQL, métricas, cuotas, plantillas y procesamiento inbound.
- `git diff --check` pasó correctamente después de actualizar la documentación.

### Pendientes

- Confirmar la cuenta y el plan comercial de Postmark.
- Confirmar aprobación de Bulk API para la cuenta.
- Aplicar y verificar la migración nueva en la base de datos real.
- Implementar las carpetas y módulos propios de la integración.
- Definir los contratos API neutrales visibles para el panel.
- Implementar el piloto en el tenant maestro.
- Configurar y verificar el primer dominio remitente.
- Ejecutar pruebas de envío, cuotas, webhooks, rebotes, supresiones e inbound.
- Migrar los tenants restantes uno por uno.
- Retirar Brevo después de completar el checklist de eliminación y respaldo histórico.

## Formato para futuras entradas

```md
## [AAAA-MM-DD]

### Cambios

- ...

### Decisiones

- ...

### Validaciones

- ...

### Pendientes

- ...

### Riesgos

- ...
```
## [2026-09-14]

### Sincronización histórica de quejas y bajas

- Se agregó el filtro explícito del proveedor al checkpoint para separar cursores de `HardBounce`, `SpamComplaint` y `Unsubscribe`.
- El worker consulta e importa esos tres tipos mediante Bounce API para cada tenant y cada stream.
- `SpamComplaint` se persiste como queja y `Unsubscribe` como cambio de suscripción con supresión activa.
- La migración `20260914_150000_postmark_sync_provider_filter.sql` fue aplicada y verificada en Supabase.

### Sincronización histórica: pasos 3 y 4

- Se completó la importación histórica de eventos expuestos por `MessageEvents`: entrega, apertura, clic, rebote y cambio de suscripción, con deduplicación común entre webhook y API.
- Se integró `HardBounce` a `tenant_email_sync_runs` y `tenant_email_sync_checkpoints`.
- Los rebotes ahora se procesan por páginas de hasta 500 registros, con reanudación por `offset`, ejecución auditable y liberación del bloqueo ante error.
- El worker procesa rebotes por separado para cada tenant y para ambos streams, `outbound` y `broadcast`.
- No se eliminan registros locales cuando desaparecen de Postmark por la retención del proveedor.
- Postmark documenta que `MessageEvents` expone `SubscriptionChanged`, `Delivered`, `Opened`, `LinkClicked` y `Bounced`; Bounce API expone tipos separados como `HardBounce`, `SpamComplaint` y `Unsubscribe`.

### Validaciones

- `backend/.venv/bin/python -m compileall` pasó para los módulos Postmark.
- `10` pruebas de integración del cliente Postmark pasaron.
