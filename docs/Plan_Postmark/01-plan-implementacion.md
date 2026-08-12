# Plan de implementación: migración completa de Brevo a Postmark

## Resultado esperado

Al finalizar, Talia enviará y recibirá el correo operativo sin usar Brevo. No deberán quedar:

- llamadas a `api.brevo.com`;
- claves o variables `BREVO_*` activas;
- rutas públicas o adapters Brevo;
- jobs que consulten cuota Brevo;
- consultas SQL que dependan de nombres `brevo_*` para métricas de negocio;
- UI que requiera importar o consultar plantillas Brevo;
- procesamiento inbound dependiente del formato de Brevo.

## Decisión de implementación

La implementación de Postmark será nueva e independiente. No se reutilizarán servicios, contratos, tablas, endpoints ni nombres de negocio de Brevo. El código existente se revisará únicamente para conocer los flujos que deben conservarse funcionalmente.

El primer tenant habilitado será el tenant maestro dueño de la aplicación:

`00000000-0000-0000-0000-000000000001`

La secuencia operativa será:

1. Construir tablas y servicios Postmark propios.
2. Probar todos los flujos en el tenant maestro.
3. Corregir y estabilizar con evidencia real.
4. Migrar tenants individualmente, sin activar el siguiente hasta cerrar el anterior.
5. Deshabilitar Brevo cuando todos los tenants estén confirmados en Postmark.
6. Retirar código, endpoints, secretos, jobs y tablas exclusivas de Brevo.

Las tablas históricas de Brevo no se eliminarán como parte automática del primer despliegue. Antes habrá que verificar dependencias en SQL, reportes, auditoría, jobs y datos históricos, generar respaldo y aprobar su eliminación.

## Fase 0.1: aislamiento de proveedor en producto

El proveedor maestro de correo no se mostrará a los tenants. La experiencia tenant-facing debe usar exclusivamente nombres neutrales:

- “Correo”;
- “Servicio de correo”;
- “Dominio de envío”;
- “Remitente”;
- “Cuota de correo”;
- “Estado de entrega”.

No se debe incluir el nombre técnico del proveedor en vistas, formularios, configuraciones del tenant, respuestas API, contratos TypeScript visibles al panel, mensajes de error, notificaciones, documentación de ayuda, HTML, JavaScript ni variables públicas del frontend.

El proveedor podrá aparecer únicamente en módulos backend, secretos, configuración interna de plataforma, tareas administrativas internas y logs técnicos restringidos. Los endpoints tenant-facing deben devolver códigos neutrales como `email_provider_unavailable`, `sending_domain_unverified` o `email_quota_exceeded`, nunca el nombre del proveedor.

## Fase 0.2: estructura propia de código

La implementación se hará en carpetas nuevas y separadas del código actual de Brevo. La estructura inicial propuesta es:

```text
backend/app/integrations/postmark/
backend/app/services/postmark/
backend/app/schemas/postmark/
backend/tests/integrations/postmark/
backend/tests/services/postmark/
frontend/panel/src/lib/email-service/
supabase/migrations/  # migraciones nuevas con tablas propias
```

La integración no se agregará dentro de `backend/app/services/brevo.py`, `backend/app/services/brevo_quota.py`, `backend/app/services/brevo_templates.py`, `backend/app/services/email.py` ni dentro de los módulos legados de prospección. Los flujos existentes se conectarán al nuevo servicio mediante cambios explícitos en sus puntos de entrada, sin convertir el código legado en una capa compartida.

## Fase 0: decisiones y preflight

La creación de la infraestructura seguirá como guía operativa el [Postmark Manual](https://postmarkapp.com/manual) y como referencia técnica de APIs y contratos la [Postmark Developer Documentation](https://postmarkapp.com/developer). El manual cubre la decisión API/SMTP, servidores, dominios, DKIM, Return-Path, streams, pruebas, tracking, webhooks, templates, DMARC e inbound.

1. Confirmar cuenta Postmark, plan Platform y aprobación de Bulk API.
2. Confirmar volumen mensual, picos horarios, tipos de correo y política de consentimiento.
3. Inventariar tenants activos, dominios remitentes, remitentes, plantillas, campañas programadas y envíos pendientes.
4. Definir streams centrales:
   - `outbound` o equivalente para transaccional.
   - `broadcasts` o equivalente para prospección/campañas permitidas.
   - `inbound` para respuestas entrantes, obligatorio en la arquitectura nueva.
5. Aplicar la política de cuotas definida en [decisiones operativas](./06-decisiones-operativas-y-criterios.md).
6. Fijar como tenant piloto `00000000-0000-0000-0000-000000000001` y definir una ventana de reversión.

Salida: decisión aprobada, credenciales provisionadas de forma segura y matriz de dependencias cerrada.

## Fase 1: modelo de datos propio

Crear una migración antes de escribir el código que dependa de estas columnas.

### Regla obligatoria de modelado

Toda información importante de Postmark debe almacenarse en columnas explícitas. Esto incluye tenant, dominio, remitente, stream, campaña, batch, envío, destinatario, estado, cuota, periodo, MessageID, eventos, rebotes, quejas, aperturas, clics y fechas.

No usar `metadata`, `json`, `jsonb`, `payload`, `config`, `settings` ni campos equivalentes para información que se consulte, filtre, ordene, relacione, valide, audite, reporte o utilice en permisos y lógica de negocio. Esa información debe tener columnas, foreign keys, constraints e índices.

Los campos JSON solo podrán existir para datos crudos u opcionales del proveedor que no formen parte de la lógica principal y que no se consulten frecuentemente. Su uso debe justificarse en la migración y no puede sustituir una columna necesaria.

### Dominio remitente

Tabla propuesta: `public.tenant_email_domains`.

Columnas mínimas explícitas:

- `id uuid primary key`
- `organizacion_id uuid not null references public.organizaciones(id)`
- `domain_name text not null`
- `postmark_domain_id bigint`
- `postmark_server_id bigint`
- `status text not null` con valores controlados: `pending_dns`, `pending_verification`, `verified`, `blocked`, `removed`
- `dkim_host text`
- `dkim_record_value text`
- `return_path_domain text`
- `return_path_cname_target text`
- `dkim_verified_at timestamptz`
- `return_path_verified_at timestamptz`
- `verified_at timestamptz`
- `default_from_email text`
- `default_from_name text`
- `reply_to_email text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Restricciones e índices:

- unique por `(organizacion_id, lower(domain_name))`.
- unique por `lower(default_from_email)` cuando no sea null, si el producto exige exclusividad.
- índice por `(organizacion_id, status)`.
- validación de ownership en cada endpoint.

### Plan y consumo

Tablas propuestas:

- `public.tenant_email_plans`: límite, periodo, fecha de vigencia, estado y flags de envío.
- `public.tenant_email_usage`: una fila por tenant y periodo con contadores reservados, aceptados, entregados, fallidos y rebotados.
- `public.tenant_email_usage_events`: ledger inmutable de reserva, liberación, aceptación y ajuste.

Los contadores de cuota no deben depender de una suma eventual de webhooks. La reserva debe ser atómica para evitar que dos workers superen el límite.

### Mensajes y webhooks

Crear tablas nuevas exclusivas de Postmark. No reutilizar ni alterar las tablas de Brevo para almacenar mensajes Postmark. Las tablas nuevas pueden referenciar entidades de negocio existentes, como organización, campaña, batch y contacto, únicamente mediante foreign keys o IDs de negocio.

Las tablas nuevas deben tener columnas explícitas para:

- `provider` (`postmark` después del corte).
- `provider_message_id`.
- `message_stream`.
- `tenant_id`/`organizacion_id`.
- `campana_id`, `batch_id`, `envio_id`.
- `status`, `status_updated_at`.
- `delivered_at`, `opened_at`, `clicked_at`, `bounced_at`, `complained_at`.
- `idempotency_key`.

Agregar índices para `organizacion_id`, `provider_message_id`, `envio_id`, `campana_id`, `status`, `created_at` y las combinaciones usadas por cuota, webhooks, panel y reportes. No crear un índice sobre JSON como sustituto de una columna estructural.

Crear una tabla de recepción de webhooks con unique por `(provider, event_id o message_id, event_type, event_timestamp)` según el payload disponible. Debe soportar reintentos sin duplicar efectos.

## Fase 2: implementación Postmark independiente

Crear los módulos dentro de `backend/app/integrations/postmark/` y `backend/app/services/postmark/`, sin modificar `brevo.py`, `brevo_quota.py`, `brevo_templates.py` ni insertar Postmark dentro del servicio Brevo actual.

Responsabilidades:

- enviar un mensaje transaccional;
- enviar lote con mensajes individualizados;
- enviar Bulk API para broadcast, previa aprobación;
- enviar usando el catálogo y contrato de plantillas propios definidos por Talia;
- crear/listar/verificar/eliminar dominios con Account API;
- consultar estado de dominio y credenciales DNS;
- configurar webhooks/servers en tareas administrativas;
- normalizar errores y `MessageID`.

El adaptador debe verificar el resultado de cada mensaje en respuestas batch: Postmark puede responder HTTP exitoso aunque existan errores individuales.

## Fase 3: servicio de correo Postmark propio

Crear un servicio nuevo para Postmark. Los flujos migrados se conectarán explícitamente a este servicio y no pasarán por `backend/app/services/email.py` mientras ese módulo conserve rutas de Brevo/SMTP del sistema anterior.

Contrato propio objetivo:

```python
send_email_detailed(
    tenant_id=..., 
    message_kind="transactional" | "broadcast",
    from_email=..., 
    to=..., 
    template=..., 
    template_model=..., 
    envio_id=...,
    campana_id=...,
    batch_id=...,
    reply_to=...,
)
```

No habrá flag de proveedor ni fallback dentro del nuevo servicio. Si el tenant no tiene dominio, remitente o cuota válidos, el envío Postmark se rechaza. El sistema anterior solo continuará atendiendo tenants no migrados, fuera del flujo Postmark y sin compartir sus tablas nuevas.

## Fase 4: dominios, remitentes y panel

Crear flujo administrativo con:

1. Alta de dominio.
2. Presentación de TXT DKIM y CNAME Return-Path.
3. Revisión de DNS.
4. Verificación bajo demanda y polling controlado.
5. Selección de remitente predeterminado.
6. Prueba de envío.
7. Bloqueo si el dominio pierde estado válido o presenta rebotes elevados.

Permisos recomendados:

- `settings.manage` para configuración del propio tenant.
- permiso de plataforma para administrar dominios de cualquier tenant.
- solo backend para tokens Account/Server de Postmark.

## Fase 5: migración de plantillas

1. Definir las plantillas nuevas desde los requisitos de producto y los flujos actuales.
2. Crear un contrato propio de variables y contenido.
3. Crear plantillas Postmark con alias estables y versionados.
4. Validar HTML, texto plano, enlaces, imágenes y unsubscribe.
5. Mantener snapshot en las tablas nuevas de la plantilla usada por cada envío.
6. No crear importador ni sincronizador Brevo.

No se debe depender de la plantilla remota para reconstruir históricamente un envío.

## Fase 6: envío de prospección y cuotas

Modificar `prospeccion_contact_sender.py` para:

- consultar cuota antes de reservar;
- reservar de forma atómica por tenant;
- crear un registro de envío local antes de llamar a Postmark;
- usar `MessageStream` Broadcast;
- usar `Metadata` con claves pequeñas: `tenant_id`, `envio_id`, `campana_id`, `batch_id`;
- guardar el `MessageID` devuelto;
- reintentar solo errores transitorios y con backoff;
- no repetir un envío aceptado por Postmark;
- marcar por separado `queued`, `submitted`, `delivered`, `bounced`, `failed` y `suppressed`.

La Bulk API está orientada a broadcast y requiere confirmación/aprobación de Postmark para la cuenta. La API batch admite hasta 500 mensajes por llamada, pero el límite de la llamada no sustituye la cuota del tenant.

## Fase 7: webhooks e inbound

Crear endpoints separados y protegidos:

- `/webhooks/postmark/transactional`
- `/webhooks/postmark/broadcast`
- `/webhooks/postmark/inbound`

El endpoint debe:

1. autenticar mediante Basic Auth o control equivalente y HTTPS;
2. validar estructura y tenant/message identifiers;
3. registrar la recepción idempotentemente;
4. responder 200 rápidamente;
5. procesar efectos en background/worker;
6. actualizar el ledger de envío y las supresiones;
7. evitar confiar en un `tenant_id` enviado sin verificar contra el mensaje local.

Postmark reintenta webhooks que no reciben 200. La deduplicación por MessageID/evento es obligatoria.

Para respuestas entrantes se implementará directamente un Inbound Message Stream de Postmark con webhook JSON. No se agregará una capa de compatibilidad con el lector IMAP/Brevo.

## Fase 8: métricas y atribución

Crear funciones, vistas y contratos nuevos para Postmark. No modificar las funciones históricas de métricas Brevo para hacerlas funcionar con Postmark.

Los contratos nuevos usarán nombres de negocio neutrales:

- `brevo_aperturas` -> `aperturas`.
- `brevo_clicks` -> `clics`.
- `brevo_eventos` -> `email_eventos`.

Conservar `provider` y detalles crudos solo como auditoría técnica en las tablas nuevas. Mantener intacta la atribución de negocio por `envio_id`, `campana_id`, `template_id`, UTM y sesiones mediante las nuevas funciones/repositorios. Las funciones Brevo se retirarán al final, no se convertirán en una base compartida.

Validar que un mensaje a múltiples destinatarios se contabilice por destinatario cuando la métrica sea de emails, no como una sola petición API.

## Fase 9: corte y retiro de Brevo

### Corte controlado

1. Congelar cambios de plantillas/campañas durante la ventana.
2. Vaciar o migrar trabajos programados pendientes.
3. Activar tenant piloto en Postmark.
4. Comparar aceptación, entregabilidad, rebotes, respuestas, aperturas, clics y cuota.
5. Activar el resto por grupos.
6. Bloquear nuevas claves/configuraciones Brevo.

### Eliminación final

- retirar `brevo.py`, `brevo_quota.py`, `brevo_templates.py` y tests específicos;
- retirar rutas/adapters `brevo-*`;
- retirar variables y secretos Brevo del runtime;
- retirar imports y nombres Brevo de métricas;
- eliminar UI de catálogo/importación Brevo;
- eliminar webhook Brevo después de confirmar cero eventos pendientes;
- buscar referencias activas a las tablas Brevo en código, funciones SQL, vistas, reportes y jobs;
- generar respaldo verificable de las tablas históricas antes de cualquier eliminación;
- eliminar tablas Brevo solo con evidencia de que no son necesarias para operación, auditoría, cumplimiento o análisis histórico;
- archivar documentación y migraciones históricas, sin borrar auditoría útil.

## Criterios de aceptación

- Ninguna llamada productiva a Brevo.
- Un tenant puede registrar y verificar su dominio.
- Un tenant no puede usar el dominio de otro tenant.
- El envío falla antes de salir si no existe dominio/remitente válido.
- La cuota no se puede exceder con concurrencia.
- Los reintentos no duplican mensajes aceptados.
- Los webhooks son idempotentes y no permiten cross-tenant updates.
- Las métricas del piloto coinciden con eventos de Postmark y registros locales.
- El inbound crea/relaciona la conversación correcta.
- Las vistas, configuraciones, respuestas y errores tenant-facing no revelan el proveedor maestro.
- `rg -n -i "brevo|api.brevo.com" backend frontend/panel supabase` solo devuelve historial/documentación explícitamente archivada.
