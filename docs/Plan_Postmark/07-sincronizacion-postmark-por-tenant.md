# Sincronización de correo Postmark por tenant

## Objetivo

Talia debe mantener una representación operativa y auditable de lo que Postmark conoce para cada tenant: mensajes, destinatarios, estados de entrega, rebotes, quejas, aperturas, clics y cambios de suscripción.

La sincronización será por tenant y por servidor. El token, el `ServerID`, los streams y las ventanas de consulta se resolverán desde la configuración interna del tenant. Nunca se consultará un servidor con el token de otro tenant.

Esto no significa copiar ciegamente toda la interfaz de Postmark. Postmark es la fuente de verdad para los eventos y el estado del proveedor; Talia conserva la atribución de negocio (`envio_id`, campaña, batch, prospecto), la cuota contratada y las reglas operativas.

## Qué se sincroniza

| Información | Fuente | Uso en Talia |
| --- | --- | --- |
| Mensaje y destinatario | Messages API y respuesta de envío | Inventario de intentos, estado y conciliación |
| Entrega | Webhook `Delivery` | Estado entregado y métricas |
| Rebote | Bounce API y webhook `Bounce` | Bloqueo del destinatario, motivo y auditoría |
| Queja | Webhook `SpamComplaint` | Supresión y alerta de reputación |
| Apertura | Webhook `Open` y API histórica disponible | Primera/última apertura y métricas |
| Clic | Webhook `Click` y API histórica disponible | Primera/última interacción y métricas |
| Cambio de suscripción | Webhook `SubscriptionChange` | Supresión o reactivación controlada |
| Estadísticas agregadas | Delivery Stats API | Comparación de salud, no reemplaza eventos |
| Mensajes entrantes | Inbound webhook | Respuestas y conversaciones del tenant |

La ventana histórica está limitada por la retención configurada en Postmark (por defecto 45 días, configurable entre 7 y 365). Los webhooks son necesarios para no perder eventos posteriores a esa ventana.

La retención de Postmark no será la retención de Talia. Una vez que un mensaje, evento, rebote, queja, apertura, clic o cambio de suscripción se haya persistido correctamente en Talia, formará parte del historial local y no será eliminado porque desaparezca de Postmark. El job histórico sólo agregará o actualizará información del proveedor que todavía no exista; nunca ejecutará `DELETE`, truncará tablas ni reemplazará el historial local completo por la ventana actual del proveedor.

## APIs históricas

El sincronizador usará exclusivamente el backend y el Server API Token del tenant:

- `GET /messages/outbound`: inventario de mensajes de salida, filtrado por fechas, stream, destinatario, tag y estado. Se paginará con `count` y `offset`; cada página tendrá como máximo 500 registros y se usarán ventanas de fecha para no depender del límite total de la consulta.
- `GET /messages/outbound/{messageid}/details`: detalle bajo demanda o para reconciliar un mensaje concreto. No se almacenará el cuerpo completo salvo que exista una necesidad funcional y una política explícita de retención.
- `GET /bounces`: rebotes y sus datos de supresión, con paginación y filtros por fechas, tipo, correo y `MessageID`.
- `GET /deliverystats`: totales agregados para comparar la salud del servidor y detectar diferencias; no se usará para inventar filas por destinatario.
- APIs históricas de aperturas y clics, cuando estén disponibles para la versión contratada, o los webhooks como fuente histórica a partir de su activación. Si Postmark no expone una clase de evento histórica, se documentará como no recuperable y no se inferirá.

La respuesta HTTP exitosa de una operación batch no garantiza que todos sus elementos hayan sido aceptados. Se deben importar y conservar los resultados individuales y sus errores.

## Dos caminos complementarios

### 1. Tiempo real: webhooks

Cada servidor tendrá sus propios endpoints autenticados para `Delivery`, `Bounce`, `SpamComplaint`, `Open`, `Click` y `SubscriptionChange`. El webhook de inbound seguirá separado.

El receptor debe autenticar, validar que el servidor y el `MessageID` pertenecen al tenant resuelto, registrar primero una recepción idempotente, encolar el procesamiento y responder rápidamente con HTTP 200. Postmark no firma actualmente los webhooks con HMAC; la protección será HTTPS, Basic Auth, validación del payload y, cuando el firewall lo permita, allowlist de los rangos IP publicados por Postmark. La IP de origen puede cambiar entre intentos, por lo que no se debe permitir únicamente una IP fija.

La verificación de Postmark se ejecuta por tipo de evento y comprueba que el endpoint responde HTTP 200. Si un tipo falla persistentemente, Postmark puede marcarlo como no verificado y pausar únicamente ese tipo hasta que se corrija y verifique de nuevo. La provisión del servidor debe comprobar cada evento, no sólo que la URL exista.

Postmark reintenta fallos 5xx, `408`, `429` y fallos de red; no reintenta los demás 4xx como `401`, `403`, `404` o `422`. Por ello, los errores transitorios deben devolver un código reintentable y los errores permanentes deben registrarse y alertarse sin esperar que Postmark los repita.

### 2. Histórico y conciliación: job backend

Un job por tenant hará la carga inicial y las conciliaciones periódicas:

1. Resolver el servidor activo y su secreto.
2. Reclamar un checkpoint para impedir dos sincronizaciones simultáneas del mismo tenant/stream.
3. Consultar cada stream y ventana de fechas con paginación.
4. Hacer upsert idempotente de mensajes y eventos sin eliminar registros ausentes en la respuesta del proveedor.
5. Consultar rebotes y eventos históricos disponibles.
6. Aplicar estados de forma monotónica: un evento tardío puede completar un mensaje, pero no regresarlo a un estado anterior.
7. Relacionar el `MessageID` con el envío local mediante `provider_message_id`, `Metadata` o referencias persistidas.
8. Guardar métricas, diferencias y checkpoint.
9. Reintentar errores transitorios con backoff y generar alerta ante errores persistentes.

La carga inicial debe ejecutarse en modo de sólo lectura/reporte. No marcará envíos ni cambiará cuotas hasta validar las coincidencias. Una coincidencia sólo por correo electrónico no es suficiente: si hay varios candidatos se marcará `ambiguous`, y si no existe relación segura se marcará `unmatched` para revisión. La ausencia de un registro en una respuesta de Postmark no significa que deba borrarse de Talia: puede estar fuera de la retención, pertenecer a otra ventana o ser un dato histórico local válido.

## Modelo de datos requerido

Se reutilizarán las tablas Postmark existentes cuando su contrato sea suficiente. Si faltan estructuras, se agregará una migración reversible con columnas explícitas:

- `tenant_email_messages`: un registro por mensaje/proveedor y destinatario operativo, con `organizacion_id`, `tenant_email_server_id`, `provider_message_id`, stream, correo, tag, estado, fechas de estado y referencias a campaña, batch y `envio_id`.
- `tenant_email_events`: un registro por evento normalizado, con tipo, `provider_message_id`, destinatario, fecha del evento, tipo/código del proveedor, origen (`webhook` o `api_sync`) y referencias de negocio.
- `tenant_email_webhook_receipts`: recepción idempotente y estado de procesamiento.
- `tenant_email_sync_runs`: ejecución, tenant, servidor, stream, ventana, origen, inicio/fin, páginas, mensajes, eventos, coincidencias, diferencias, estado y error.
- `tenant_email_sync_checkpoints`: última ventana/página confirmada por tenant, servidor y stream, con bloqueo y fecha de actualización.

Los identificadores y relaciones consultadas por el negocio serán columnas e índices reales, no campos JSON. El payload crudo, si se conserva, será únicamente auxiliar, redacted y sujeto a retención; nunca será la fuente de los contadores.

Las restricciones deben impedir cruces entre tenants. Como mínimo se requiere unicidad por servidor y `provider_message_id`, y una clave idempotente para el evento normalizado. Además, se almacenará el header `X-PM-Webhook-Trace-Id`: Postmark lo mantiene estable durante los reintentos del mismo evento. `MessageID` identifica el mensaje, no necesariamente cada evento, por lo que no debe usarse solo como clave de deduplicación. Los eventos repetidos de webhook y API deben converger en una sola representación.

## Estados y contabilización

Talia distinguirá claramente:

- `queued`: creado en la cola local;
- `provider_accepted`: Postmark devolvió un `MessageID` válido;
- `processed`: Postmark procesó el mensaje;
- `delivered`: el destinatario aceptó la entrega;
- `bounced` o `suppressed`: Postmark no lo entregó o impidió el envío;
- `complained`: hubo queja;
- `failed`: falló la solicitud o el resultado individual.

Un mensaje a varios destinatarios no debe confundirse con varios mensajes: la Messages API cuenta mensajes, mientras que las métricas por destinatario deben contar cada destinatario. La reserva de cuota ocurre en Talia; la sincronización concilia la aceptación por destinatario y registra ajustes en un ledger auditable. Nunca se “corrige” Postmark eliminando filas locales, ni se modifica el total histórico del proveedor.

## Seguridad y operación

- Los tokens de servidor se leen sólo desde secretos de backend.
- El navegador no llama a Postmark ni recibe tokens, payloads crudos o credenciales.
- El `ServerID` obtenido de Postmark se contrasta con el servidor local del tenant.
- Los logs no guardan tokens, Basic Auth, cuerpos completos ni datos innecesarios del destinatario.
- Los jobs respetan límites, timeout, reintentos y backoff de la API.
- El receptor conserva `X-PM-Retries-Remaining` y `X-PM-Webhook-Trace-Id` para diagnóstico, sin exponerlos al tenant.
- La pérdida temporal del job no debe perder eventos: el siguiente ciclo repite una ventana solapada y usa idempotencia.
- Suspender un tenant detiene envíos nuevos, pero no borra mensajes, eventos ni historial.
- La sincronización no tiene permisos ni código de purga sobre las tablas históricas de Talia; la limpieza, si algún día se requiere, será un proceso separado con política de retención, autorización y auditoría propias.

Métricas mínimas: última sincronización exitosa por tenant, mensajes consultados, eventos insertados, duplicados, coincidencias exactas, ambiguas y no encontradas, errores por endpoint y diferencia entre Postmark y Talia.

## Despliegue progresivo y aceptación

1. Ejecutar el modo de sólo lectura para el tenant maestro y su servidor `20008586`.
2. Comparar mensajes por stream, destinatarios, rebotes y estadísticas con el panel de Postmark.
3. Activar webhooks y verificar deduplicación, reintentos y estados tardíos.
4. Habilitar la conciliación periódica del tenant maestro.
5. Repetir tenant por tenant, siempre con su servidor y token propios.
6. Habilitar ajustes de contadores sólo después de revisar las diferencias y conservar la auditoría.

Casos obligatorios: respuesta batch con errores individuales, mensaje sin relación local, destinatario duplicado, evento repetido, evento tardío, mensaje fuera de la retención, registro local ausente en Postmark sin borrarlo, token de otro servidor, webhook duplicado, timeout después de procesar, respuesta 429, respuesta 401/403, verificación fallida de un único tipo de evento y tenant suspendido.

## Resultado esperado

Cada tenant tendrá en Talia una vista confiable de sus eventos Postmark, actualizada en tiempo real por webhooks y reparada/validada por API histórica. La sincronización será observable, repetible e idempotente, sin mezclar reputación, métricas, cuotas o datos entre tenants.
