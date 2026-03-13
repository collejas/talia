# Diagnóstico técnico: agendamientos actuales + factibilidad Zoom

Fecha: 2026-03-13

## 1) Resumen ejecutivo

Hoy la app **sí soporta agenda unificada multi-flujo** (web pública, embudo/panel, webchat) y guarda citas en `calendar_bookings`.

También existe estructura para enlaces externos en las citas:

- `calendar_bookings.meeting_url`
- `calendar_bookings.external_join_url`

Conclusión: **integrar Zoom es viable** sin rediseñar el modelo principal de agenda.

## 2) Hallazgos en base de datos (Supabase)

### 2.1 Tablas clave detectadas

- `calendar_resources`
- `calendar_availability_patterns`
- `calendar_exceptions`
- `calendar_slot_holds`
- `calendar_bookings`
- `web_booking_sessions`
- `oportunidades`
- `contactos`
- `conversaciones`

### 2.2 Estructura relevante para Zoom

`calendar_bookings` ya contiene campos para link de reunión:

- `meeting_url` (nullable)
- `external_join_url` (nullable)
- `metadata` (jsonb)
- `tarjeta_id` (relación con oportunidad)

Esto permite guardar:

- `zoom_join_url`
- `zoom_start_url` (ideal en `metadata`)
- `zoom_meeting_id` (ideal en `metadata`)

### 2.3 RPC de calendario actuales

Funciones detectadas:

- `fn_calendar_hold_slot`
- `fn_calendar_confirm_slot`
- `fn_calendar_reschedule_booking`
- `fn_calendar_cancel_booking`
- `fn_calendar_sync_tarjeta_stage`
- y auxiliares de patrones/excepciones/listado

`fn_calendar_confirm_slot` ya recibe:

- `p_meeting_url`
- `p_external_join_url`

Pero hoy backend casi siempre confirma con esos valores vacíos (sin Zoom).

### 2.4 Configuración tenant actual

En `organizaciones.config` del tenant principal:

- Existe `config.calendar` (provider/server URL/port/URLs)
- Existe `config.webchat.calendar` (resource/timezone/default_days/hold_minutes)
- **No existe `config.zoom`**

Secretos existentes:

- `calendar.username`, `calendar.password`
- `mail.username`, `mail.password`
- `brevo.api_key`
- **No hay secretos `zoom.*`**

## 3) Hallazgos backend

## 3.1 Flujos de agendamiento detectados

### A) Landing pública (`/demo.html`)

Rutas backend:

- `POST /crm/web/booking/availability`
- `POST /crm/web/booking/book`

Archivo:

- `backend/app/api/routes/crm.py`

Comportamiento:

- Crea/usa contacto
- Crea oportunidad (demo)
- Crea booking
- Actualiza sesión de booking (`web_booking_sessions`)
- Envía correo confirmación

### B) Embudo/Panel (`/agenda/bookings`)

Ruta backend:

- `POST /crm/agenda/bookings`

Archivo:

- `backend/app/api/routes/crm.py`

Comportamiento:

- Agenda desde oportunidad/contacto/conversación
- Caso manual (sin conversación): ya corregido para agendar sin crear inbox
- Sincroniza etapa/metadata vía servicios de calendar/webchat

### C) Webchat canal (asistente)

Rutas backend:

- `POST /webchat/calendar/bookings`
- `POST /webchat/calendar/bookings/{booking_id}/reschedule`
- `POST /webchat/calendar/bookings/{booking_id}/cancel`

Archivos:

- `backend/app/channels/webchat/router.py`
- `backend/app/channels/webchat/service.py`

### D) Reprogramación / cancelación desde agenda panel

Rutas backend:

- `POST /crm/agenda/bookings/{booking_id}/reschedule`
- `POST /crm/agenda/bookings/{booking_id}/cancel`

## 3.2 Correo de confirmación actual

Archivo:

- `backend/app/channels/webchat/service.py`

Hallazgos:

- El correo de confirmación se envía por SMTP (flujo normal de mail runtime)
- El correo actualmente **no inserta explícitamente un enlace Zoom**
- Ya existe el hook natural para incluir `meeting_url` si se llena en booking

## 3.3 Soporte de “calendar provider” actual

Existe configuración `calendar.provider` en runtime/config (ej. `caldav`) y se usa sobre todo para metadata/ICS.

No hay implementación específica de cliente Zoom (OAuth/token/create meeting/cancel meeting).

## 4) Hallazgos frontend

## 4.1 Landing pública

Archivo:

- `landing/src/demo.html`

Flujo:

- consulta availability
- confirma booking con `/api/crm/web/booking/book`
- muestra éxito

No consume `meeting_url` en UI post-confirmación (solo mensaje de confirmación por texto).

## 4.2 Panel embudo

Archivos:

- `frontend/panel/src/components/embudo/board-client.tsx`
- `frontend/panel/src/lib/embudo/actions.ts`

Flujo:

- drag/drop a demo o avance desde drawer
- llama `scheduleLeadDemo` -> `/agenda/bookings`
- guarda `demo_booking_id` en metadata stage_prep

## 4.3 Panel agenda

Archivos:

- `frontend/panel/src/lib/agenda/data.ts`
- `frontend/panel/src/components/agenda/agenda-table.tsx`
- `frontend/panel/src/components/agenda/agenda-event-drawer.tsx`

Hallazgo:

- Agenda panel **ya muestra links** usando `meeting_url` / `external_join_url` cuando existen.

## 4.4 Variables tenant

Archivos:

- `frontend/panel/src/app/settings/variables/page.tsx`
- `frontend/panel/src/app/settings/variables/actions.ts`

Hallazgo:

- Hay UI para calendario/mail/brevo
- **No hay UI/campos para Zoom**

## 5) Conclusión técnica

La arquitectura actual ya tiene el 80% de las piezas para Zoom:

- persistencia de links de reunión en booking,
- múltiples flujos de agendamiento centralizados,
- envío de correo de confirmación centralizado.

Lo que falta es:

1. módulo Zoom (OAuth + API)
2. configuración segura por tenant (`config.zoom` + `secretos`)
3. inyección del link Zoom al confirmar/reprogramar/cancelar
4. mostrar esos links donde aplique en UI/correos

