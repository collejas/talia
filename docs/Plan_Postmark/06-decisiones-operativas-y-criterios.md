# Decisiones operativas y criterios de implementación

Este documento convierte las decisiones pendientes en reglas obligatorias para la implementación.

## 1. Alcance obligatorio

El servicio nuevo debe cubrir y probar invitaciones, cuentas, cotizaciones, propuestas, agenda, portal, notificaciones, prospección, campañas y respuestas entrantes. Cada flujo tendrá una ficha con ruta, servicio, plantilla, stream, remitente, cuota, tabla, webhook y prueba de aceptación.

No se considerará completa la migración mientras exista un flujo de correo no clasificado.

## 2. Estado de migración por tenant

Crear `public.tenant_email_migrations` con columnas explícitas: `id`, `organizacion_id`, `status`, `feature_enabled`, `started_at`, `domain_verified_at`, `first_test_sent_at`, `production_enabled_at`, `validated_at`, `blocked_at`, `rollback_at`, `last_error_code`, `last_error_at`, `migrated_by`, `created_at` y `updated_at`.

Estados permitidos: `pending`, `configuring`, `domain_verified`, `active`, `blocked`, `validated`, `rolled_back` y `migrated`.

El primer registro será el tenant maestro `00000000-0000-0000-0000-000000000001`.

## 3. Activación y ausencia de fallback

- Tenant no migrado: permanece en el sistema anterior durante su ventana de migración.
- Tenant migrado: todos sus flujos definidos utilizan el servicio nuevo.
- No habrá fallback automático ni mezcla de proveedores dentro del mismo tenant.
- Si el servicio nuevo falla, el envío falla o queda en reintento controlado; no cambia silenciosamente de proveedor.
- El rollback será una operación administrativa explícita y auditada.

## 4. Modelo de datos, RLS e integridad

Todas las tablas nuevas deben tener `organizacion_id` cuando corresponda, foreign keys reales, constraints de estado/formato, índices por tenant/estado/fechas/correlación, RLS o el mecanismo vigente de Supabase y separación de permisos de tenant y plataforma.

Dominio, remitente, campaña, envío, destinatario, estado, cuota, periodo, MessageID, evento, rebote, queja, apertura y clic serán columnas. No usar `metadata`, `json`, `jsonb`, `payload`, `config` o `settings` para esos datos. JSON solo podrá conservar payload crudo o extensiones variables no consultadas frecuentemente, con justificación en la migración.

## 5. Cuotas y planes

Las tablas propias deben definir plan, límite, periodo, cuota diaria opcional, reservados, aceptados, fallidos, entregados, rebotados, reinicio, estado y sobreconsumo.

Reglas: la unidad de consumo es el destinatario; la reserva es atómica; el rechazo previo libera reserva; un mensaje aceptado no se libera por rebote; cancelar solo libera mensajes no enviados; el sobreconsumo queda bloqueado por defecto.

## 6. Máquina de estados del mensaje

Flujo principal: `queued -> submitted -> delivered`.

Ramas permitidas: `queued -> cancelled/failed`, `submitted -> failed/bounced/complained/suppressed` y `delivered -> opened/clicked`. Los eventos tardíos no regresan el mensaje a un estado anterior. Toda transición guarda fecha, código, motivo y origen.

## 7. Reintentos e idempotencia

Crear el registro antes de enviar, usar `idempotency_key` única, no repetir mensajes aceptados, reintentar solo errores transitorios con backoff, registrar intentos y hacer idempotentes reservas, liberaciones y webhooks.

## 8. Inbound: decisión definitiva

Se implementará directamente un Inbound Message Stream con webhook JSON. No se reutilizará IMAP/Brevo. Debe validar autenticación, resolver tenant/conversación desde la base local, deduplicar, responder rápido y guardar remitente, destinatario, asunto, MessageID, referencias y fechas en columnas.

## 9. Plantillas

Las plantillas se crearán nuevamente; no habrá importador ni sincronizador de Brevo. El modelo propio tendrá nombre, slug, versión, asunto, HTML, texto, variables permitidas, tipo de flujo, estado, alcance, creador y fechas. Cada envío guardará plantilla y versión; el snapshot, si se requiere, irá en tabla propia.

## 10. Dominios y remitentes

Definir quién registra, verifica, aprueba y bloquea dominios, qué remitentes se permiten y qué ocurre ante DNS eliminado, rebotes o quejas. El backend debe validar que el remitente pertenece al dominio verificado del tenant.

## 11. Consentimiento y supresiones

Guardar en columnas consentimiento, fecha, origen, baja, motivo, rebote, tipo de rebote, queja y fuente del evento. Bajas, rebotes permanentes, quejas y supresiones manuales deben bloquear futuros envíos.

## 12. Observabilidad

Medir envíos por tenant, cuota, aceptación, entregabilidad, rebotes, quejas, aperturas, clics, latencia, errores, webhooks, trabajos atrasados y dominios pendientes. No registrar tokens, contraseñas, cuerpos completos, listas completas ni payloads sensibles.

## 13. Deploy, secretos y rollback

Documentar secretos, rotación, workers, webhooks, DNS, orden de migraciones, deploy, health checks, feature flags, rollback y pausa de campañas. Rollback no borra envíos ni eventos; solo detiene nuevos envíos y deja auditoría.

## 14. Eliminación de Brevo

Antes de eliminarlo: todos los tenants están `migrated`, no hay campañas/jobs/webhooks pendientes, no existen llamadas ni secretos activos, no hay referencias en código/SQL/reportes, existe respaldo verificable y se aprobó la eliminación por razones operativas, legales y de auditoría.

La eliminación de tablas será una migración separada y posterior, nunca parte del primer despliegue.

## 15. Pruebas de aceptación

Para el tenant maestro y cada tenant: dominio, prueba transaccional, prueba Broadcast, cuota concurrente, rebote, supresión, apertura, clic, webhook repetido, inbound, aislamiento cross-tenant, ocultamiento del proveedor, rollback y bloqueo de activación del siguiente tenant hasta cerrar el actual.

