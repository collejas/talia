# Hallazgos flujo de correos (estado actual)

Fecha de levantamiento: 13 de marzo de 2026.

## Objetivo del diagnóstico

Entender cómo se enruta hoy el envío de correos entre:

- Prospección masiva
- Correos enviados por asistentes IA (WhatsApp y Webchat)
- Confirmación de cita de la agenda pública (`/demo.html`)

## Resumen ejecutivo

Actualmente existe una regla global: **si el tenant tiene `brevo.api_key`, el envío usa Brevo**.  
Por eso hoy no está separado por tipo de flujo.

## Evidencia técnica (backend)

1. Regla global de enrutamiento
- Archivo: `backend/app/services/email.py`
- Evidencia: si hay `brevo_settings_resolved.api_key`, `send_email()` usa `_send_email_brevo`; si no, usa SMTP.

2. Prospección masiva de correo
- Archivo: `backend/app/services/prospeccion_contact_sender.py`
- Evidencia: carga `mail_settings` + `brevo_settings` y llama `send_email(..., brevo_settings=...)`.
- Resultado: prospección se envía por Brevo cuando hay API key.

3. Correo desde asistente WhatsApp
- Archivo: `backend/app/channels/whatsapp/tools.py`
- Evidencia: `_handle_information_email` carga `brevo_settings` y llama `send_email(..., brevo_settings=...)`.
- Resultado: también se va por Brevo.

4. Correo desde asistente Webchat / Lead tools
- Archivo: `backend/app/assistants/tools/lead.py`
- Evidencia: carga `brevo_settings` y llama `send_email(..., brevo_settings=...)`.
- Resultado: también se va por Brevo.

5. Confirmación de booking en flujos de chat
- Archivo: `backend/app/channels/webchat/service.py`
- Evidencia: `_send_booking_confirmation_email` carga `brevo_settings` y llama `send_email(..., brevo_settings=...)`.
- Resultado: confirmaciones de cita de chat también se van por Brevo.

6. Agenda pública (`/web/booking/book`)
- Archivo: `backend/app/api/routes/crm.py`
- Evidencia: el endpoint crea contacto/conversación/booking/sesión, pero **no invoca** envío de correo de confirmación.
- Resultado: desde `demo.html` hoy no existe envío automático de confirmación.

## Evidencia técnica (frontend)

1. Configuración de correo por tenant
- Vista: `/settings/variables`
- Archivos:
  - `frontend/panel/src/app/settings/variables/actions.ts`
  - `frontend/panel/src/app/settings/variables/components/tenant-variables-sections-panel.tsx`
- Hallazgo: en la sección "Mail y Brevo" se guardan ambos (`mail.*` y `brevo.*`) sin selector de estrategia por flujo.

2. Agenda demo pública
- Archivo: `landing/src/demo.html`
- Hallazgo: envía `POST /api/crm/web/booking/book` correctamente, pero no controla envío de confirmación (eso depende de backend).

## Evidencia técnica (base de datos)

1. Configuración tenant
- Tabla `organizaciones`: `config` (jsonb) incluye `mail` y `brevo`.
- Tabla `secretos`: existen claves `mail.username`, `mail.password`, `brevo.api_key` por tenant.

2. Agenda pública
- Tabla `web_booking_sessions`: sí registra aperturas y bookings (`opened_at`, `booked_at`, UTM, referrer, geo, etc.).
- Tabla `calendar_bookings`: los registros con `metadata.source = 'public_demo'` no muestran `invite_status` ni `invite_message_id` (confirmación no enviada por ese flujo).

## Brecha contra el objetivo deseado

Objetivo deseado:

- Prospección: Brevo
- Asistentes IA (WhatsApp/Webchat): correo normal (SMTP)
- Confirmación de cita desde `demo.html`: correo normal (SMTP)

Estado actual:

- Prospección: Brevo (correcto)
- Asistentes IA: Brevo (incorrecto vs objetivo)
- Confirmación `demo.html`: no se envía (faltante)

