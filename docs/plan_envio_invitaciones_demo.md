## Plan · Envío automático de invitaciones de demo por correo

### Objetivo
Al confirmar una cita con `schedule_demo`, enviar automáticamente al prospecto (y a nuestro equipo) un correo con invitación ICS que se sincronice con sus calendarios, utilizando el mismo proveedor (correo/calendario) que usa el asistente.

---

### 1. Diagnóstico y decisiones previas
- **Proveedor de correo/calendario**: confirmar credenciales y protocolo disponible (SMTP con SSL, API específica, etc.).  
- **Remitente**: usar la misma cuenta que envía respuestas del asistente (`From` y `Reply-To`).  
- **Destinatarios**: prospecto (`contacto.correo`), copia a ventas/soporte si aplica.
- **Formato**: enviar email con `Content-Type: text/calendar; method=REQUEST` y adjunto `.ics`.

---

### 2. Cambios en el prompt / tools
1. Ajustar `docs/prompt_landing.md`: cuando Tal-IA cierre la cita y tenga correo, indicarle que confirmará el envío de invitación por correo.
2. Documentar en `docs/funciones_prompt_openai.md` que `schedule_demo` debe incluir `metadata.send_calendar_invite = true` (y correo del lead) para disparar la automatización.

---

### 3. Backend (FastAPI)
1. Crear helper `build_ics_event(cita, contacto)` que devuelva texto ICS + UID único.
2. Extender `_execute_function_call` (`schedule_demo` branch):
   - Tras `storage.upsert_demo_cita`, verificar `metadata.send_calendar_invite`.
   - Recuperar contacto (`storage.get_contact(contact_id)`) para obtener correo.
   - Encolar evento en nueva tabla `citas_invites` o ejecutar envío inmediato.
3. Implementar servicio `email_service.send_calendar_invite(...)` (SMTP u otro) con:
   - Asunto, cuerpo en HTML/Texto.
   - Adjuntar ICS y establecer headers `Content-Class: urn:content-classes:calendarmessage`.
4. Registrar en BD: éxito/fracaso (`citas.metadata.invite_status`, `invite_sent_at`).
5. Manejar reintentos y logs (`app.channels.webchat`).

---

### 4. Supabase / Datos
1. Añadir columnas opcionales en `public.citas`:
   - `invite_status` (`pendiente`, `enviado`, `fallido`).
   - `invite_sent_at` (timestamp).
   - `invite_message_id` (opcional, tracking).
2. Crear RPC `fn_cita_marcar_invite` para actualizar estado desde backend.

---

### 5. Pruebas y QA
1. Unit tests: generación ICS, envío SMTP (mock).
2. Tests de integración: flujo `schedule_demo` → email enviado.
3. Validar invitación en Gmail/Outlook (aceptar, reprogramar, cancelar).
4. Incluir casuística sin correo (no enviar) y contactos con dominio inválido.

---

### 6. Despliegue y operación
1. Declarar variables nuevas en el entorno:
   - `TALIA_MAIL_USERNAME`
   - `TALIA_MAIL_CONTRASENA`
   - `TALIA_MAIL_INCOMING_SERVER`
   - `TALIA_MAIL_INCOMING_PORT_IMAP`
   - `TALIA_MAIL_OUTGOING_SERVER`
   - `TALIA_MAIL_OUTGOING_PORT_SMTP`
2. Actualizar `.env`, reiniciar backend.
3. Monitoreo básico (logs + contadores de envíos).
4. Runbook: reenvío manual, gestión de fallos SMTP, revocación de credenciales.

---

### 7. Iteraciones futuras
- Reenvío automático al reprogramar (`reschedule_demo`) o cancelar (`cancel_demo` con METHOD:CANCEL).
- Integración con proveedores externos (Google API / Microsoft Graph).
- Portal interno para descargar ICS / reenviar invitación desde el panel.
