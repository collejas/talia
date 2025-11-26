# Plan: Ejecución real de envíos de prospección (correo · WhatsApp · voz)

## Contexto actual
- La vista `/prospeccion/prospectos` ya permite seleccionar prospectos verificados y mandar un payload a `POST /crm/prospeccion/prospectos/contactar`, pero hoy todo sucede de forma síncrona dentro del request. El correo usa `send_email`, WhatsApp delega a `_send_whatsapp_reply` y las llamadas quedan como registros “pendientes” en `prospeccion_contactos_log` sin iniciar una llamada real.
- Existen tablas/utilidades previas:
  - `prospeccion_contactos_log` almacena canal, estado y detalle, pero no distingue lotes ni maneja reintentos.
  - El webhook de WhatsApp (Twilio) ya opera para conversaciones entrantes; falta reutilizarlo para campañas outbound y mapear los callbacks a los prospectos.
  - El módulo de voz (`backend/app/channels/voice/*`) es un placeholder: sólo registra callbacks y no expone endpoints TwiML ni procesos para originar llamadas.
  - La capa de frontend no muestra el historial ni estado de envíos a cada prospecto; sólo muestra un banner con el resultado del request inmediato.

## Objetivos
1. Permitir que los envíos de prospección se ejecuten realmente en los tres canales (correo, WhatsApp, llamada) usando las credenciales configuradas y respetando los límites regulatorios.
2. Manejar los envíos de forma asíncrona y confiable (reintentos, colas, control de tasa) sin bloquear la UI.
3. Registrar el historial por prospecto y por canal con estados (`pendiente`, `enviado`, `error`, `entregado`, `fallido`) y trazabilidad (payload enviado, plantillas, Message SID / Call SID).
4. Exponer en el panel el estado de cada envío y permitir reprogramar acciones fallidas.

## Alcance técnico

### 1. Modelado y almacenamiento ✅
1. Crear tablas nuevas en Supabase ✅:
   - `prospeccion_contacto_batch` (id, iniciado_por, filtros utilizados, total_prospectos, canales solicitados, estado global, creado_en).
   - `prospeccion_contacto_envio` (id, batch_id, prospecto_id, canal, payload jsonb, estado, intento_actual, max_reintentos, mensaje_id/call_sid, programado_en, procesado_en).
2. Mantener `prospeccion_contactos_log` como bitácora detallada pero relacionarla vía `envio_id` o `batch_id` (FKs). ✅
3. Migraciones ✅:
   - Añadir columnas `envio_id uuid` y `batch_id uuid` opcionales al log.
   - Índices por `prospecto_id+canal` y `estado` para facilitar dashboards.

### 2. Backend (FastAPI + servicios)
1. **Orquestador de batches** ✅
   - Extender `POST /crm/prospeccion/prospectos/contactar` para que en lugar de enviar de inmediato, cree un `batch` y registros `prospeccion_contacto_envio` por cada prospecto/canal. ✅
   - Añadir endpoint `GET /crm/prospeccion/prospectos/contactar/{batch_id}` para consultar progreso (totales por estado) y `POST /crm/prospeccion/prospectos/contactar/{batch_id}/cancelar`.
2. **Worker/cola de tareas**
   - Implementar un procesador asíncrono (por ejemplo, módulo `app/services/prospeccion_contact_sender.py`) que:
     - Tome envíos `estado=pending` ordenados por `programado_en`.
     - Ejecute el canal correspondiente y actualice `estado`.
     - Registre en `prospeccion_contactos_log` cada intento.
   - Utilizar `asyncio` + `BackgroundTasks` si corremos un worker dentro del API, o bien integrar una cola dedicada (Redis RQ/Celery) si el volumen lo amerita. Documentar la elección en README.
3. **Correo**
   - Reutilizar `send_email`, pero mover la construcción del mensaje a “plantillas”:
     - Crear tabla `prospeccion_contacto_templates` (canal, slug, asunto, cuerpo_texto, cuerpo_html opcional).
     - Permitir placeholders (`{{display_name}}`, `{{actividad}}`, etc.) usando `jinja2` o `.format_map`.
     - Guardar en `payload` del envío qué plantilla/version se usó.
4. **WhatsApp**
   - Usar Twilio Messaging Service con templates aprobadas:
     - Guardar `template_name` y parámetros en `payload`.
     - Reutilizar `_send_whatsapp_message`, pero moverlo al worker y capturar `sid`/`status`.
     - El webhook existente (`channels/whatsapp/router.py`) debe actualizar `prospeccion_contacto_envio` según callbacks (`delivered`, `read`, `failed`).
5. **Voz** ✅
   - Implementar servicio en `app/channels/voice/service.py` capaz de originar llamadas salientes ✅:
     - Nuevo helper `start_outbound_call(prospecto, notas)` que cree una llamada vía Twilio Voice (REST API) usando un número configurado y apunte a un endpoint TwiML (`/voice/outbound/{envio_id}`) que reproduzca un mensaje o conecte con un agente.
     - Guardar `call_sid` en `prospeccion_contacto_envio`.
     - Ampliar `VoiceStatusCallback` para mapear eventos (queued, ringing, in-progress, completed, busy, failed) y actualizar `estado`.
6. **Estados y reintentos**
   - Definir máquina de estados por canal (p.ej., `pending -> sending -> sent -> delivered` o `failed`).
   - Configurar reintentos automáticos (n reintentos con backoff) para errores transitivos (timeout SMTP, rate limit Twilio).
   - Permitir marcar manualmente como “omitido” cuando falta dato (sin email/teléfono) desde el worker y reflejarlo en el log.
7. **Seguridad y límites**
   - Validar que el usuario tenga permisos para disparar envíos (reutilizar `require_user_token`).
   - Añadir throttling por usuario/organización para evitar spam involuntario (p.ej., máximo 500 WhatsApps por hora).

### 3. Frontend (Next.js panel)
1. **Modal de contacto**
   - Separar canales en tabs con vista previa de la plantilla seleccionada. ✅
   - Permitir elegir plantillas guardadas por canal, editar placeholders y programar fecha/hora futura. (Tabs + selección ✅; programación queda pendiente.)
2. **Seguimiento de batches** ✅
   - Nueva vista `/prospeccion/contactos` con tabla de batches (fecha, creador, canales, totales por estado).
   - En la vista de prospectos, mostrar un drawer “Historial de contacto” consultando `GET /crm/prospeccion/prospectos/{id}/contactos`. ✅
3. **Notificaciones en tiempo real**
   - Usar polling o SSE (simple) para refrescar el estatus tras lanzar un batch; mostrar progreso (ej. 12/50 WhatsApps enviados).
4. **Reintentos manuales**
   - Botón “Reintentar canal” por prospecto que cree un nuevo `envio` reutilizando la plantilla previa.

### 4. Infraestructura y configuración
1. **Credenciales**
   - Validar en `settings` que existan `TWILIO_WHATSAPP_FROM`, `TWILIO_VOICE_NUMBER`, configuración SMTP productiva.
   - Documentar en `variables.md` cómo obtener y rotar credenciales.
2. **Twilio Voice**
   - Configurar el número de salida con webhook a `/channels/voice/status` y a la nueva ruta TwiML.
   - Verificar que la cuenta tenga permisos para WhatsApp y llamadas al destino (MX).
3. **Monitorización**
   - Añadir métricas (Prometheus/OpenTelemetry) por canal: tasa de éxito, errores, tiempo promedio.
   - Alertas en logs `prospeccion.contact_sender`.

### 5. QA y despliegue
1. **Pruebas unitarias**
   - Mock de `send_email`, Twilio REST, Twilio Lookup y verificación de que los envíos pasan por la cola correcta.
   - Tests para el worker: transiciones de estado, reintentos, manejo de errores.
2. **Pruebas integrales/Sandboxes**
   - Usar sandbox de Twilio WhatsApp y Voice para ejecutar al menos un envío de prueba por canal.
   - Validación de plantillas HTML de correo en entornos reales (MailHog o herramienta similar).
3. **Plan de despliegue**
   - Lanzar en etapas: primero correo, luego WhatsApp, finalmente voz (cada uno detrás de feature flag).
   - Registrar métricas base antes de habilitar para todos los usuarios.

## Entregables
1. Migraciones Supabase con nuevas tablas/índices y triggers de actualización.
2. Servicios backend (API, worker, helpers Twilio) con documentación en `README` y variables requeridas.
3. Actualización del panel con gestión de plantillas, modal renovado y vista de historial.
4. Guía operativa para soporte (cómo pausar un batch, reintentar, monitorear Twilio).
5. Suite de pruebas + checklist de QA manual.

Con este plan damos continuidad al documento “plan realizado para extender prospeccion” y abordamos lo necesario para que los envíos se ejecuten end-to-end en los tres canales, con trazabilidad y UX acorde.
