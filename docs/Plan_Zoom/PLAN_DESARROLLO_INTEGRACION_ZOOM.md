# Plan de desarrollo: integración Zoom en agendamientos

Fecha: 2026-03-13

## Objetivo

Cuando se crea una cita en Tal-IA, crear también reunión en Zoom y enviar al cliente el link correcto en el correo de confirmación, sin romper los flujos existentes (landing, embudo, agenda, webchat).

## Alcance

Incluye:

- Crear reunión Zoom al confirmar booking.
- Actualizar reunión Zoom al reprogramar booking.
- Cancelar reunión Zoom al cancelar booking.
- Persistir enlaces/IDs Zoom en `calendar_bookings` (`meeting_url`, `external_join_url`, `metadata`).
- Enviar correo de confirmación con enlace Zoom.
- Configuración por tenant en `/settings/variables`.

No incluye (fase inicial):

- grabaciones automáticas,
- webhooks avanzados de attendance,
- reportes analíticos de Zoom.

## Decisión recomendada

Usar **Zoom Server-to-Server OAuth** por tenant.

Razones:

- sin autorización interactiva por usuario final,
- backend-to-backend estable,
- apto para operación multi-tenant.

## Diseño propuesto

## 1) Configuración por tenant

### `organizaciones.config.zoom`

Propuesta mínima:

- `enabled: boolean`
- `provider: "zoom"`
- `host_email: string | null`
- `default_duration_minutes: number | null`
- `auto_create_meeting: boolean` (default `true`)

### secretos (`secretos`)

- `zoom.account_id` (tier A)
- `zoom.client_id` (tier A)
- `zoom.client_secret` (tier B)

## 2) Persistencia en booking

Sin migración obligatoria inicial (ya hay campos):

- `calendar_bookings.meeting_url` <- Zoom `join_url`
- `calendar_bookings.external_join_url` <- opcional (`join_url` alterno)
- `calendar_bookings.metadata`:
  - `zoom_meeting_id`
  - `zoom_join_url`
  - `zoom_start_url` (solo interno)
  - `zoom_host_email`
  - `zoom_created_at`

## 3) Backend: nuevo servicio Zoom

Nuevo módulo sugerido:

- `backend/app/services/zoom.py`

Responsabilidades:

- obtener access token S2S OAuth,
- crear reunión,
- actualizar reunión (reagendar),
- cancelar reunión,
- mapear errores de Zoom a errores de negocio.

## 4) Puntos de integración (backend)

## 4.1 Crear booking

Rutas impactadas:

- `POST /crm/web/booking/book`
- `POST /crm/agenda/bookings`
- `POST /webchat/calendar/bookings`

Flujo recomendado:

1. hold slot
2. crear meeting Zoom (si tenant habilitado)
3. confirm slot enviando `meeting_url`/`external_join_url`
4. enviar correo de confirmación incluyendo link

Fallback:

- si Zoom falla, configurable:
  - modo estricto: aborta booking
  - modo tolerante (recomendado inicial): confirma booking sin zoom y marca `metadata.zoom_status = failed`

## 4.2 Reprogramar booking

Rutas impactadas:

- `POST /crm/agenda/bookings/{booking_id}/reschedule`
- `POST /webchat/calendar/bookings/{booking_id}/reschedule`

Acción:

- si booking tiene `zoom_meeting_id`, actualizar meeting en Zoom
- persistir metadata de actualización

## 4.3 Cancelar booking

Rutas impactadas:

- `POST /crm/agenda/bookings/{booking_id}/cancel`
- `POST /webchat/calendar/bookings/{booking_id}/cancel`

Acción:

- si booking tiene `zoom_meeting_id`, cancelar meeting en Zoom
- persistir `zoom_cancelled_at`

## 4.4 Correo de confirmación

Archivo base actual:

- `backend/app/channels/webchat/service.py`

Cambio:

- agregar bloque “Únete a la demo” con `meeting_url` cuando exista.

Regla:

- nunca enviar `zoom_start_url` al cliente (solo host interno).

## 5) Frontend

## 5.1 Settings variables

Agregar en pestaña calendario (o subsección Zoom):

- `zoom.enabled`
- `zoom.host_email`
- secretos Zoom (`account_id`, `client_id`, `client_secret`)

Archivos objetivo:

- `frontend/panel/src/app/settings/variables/page.tsx`
- `frontend/panel/src/app/settings/variables/actions.ts`
- componentes de secciones variables

## 5.2 Agenda panel

Ya muestra `meeting_url`/`external_join_url`; validar QA para estado Zoom y mensajes de fallback.

## 5.3 Landing `demo.html`

Opcional fase 2:

- tras confirmar, mostrar “Enlace de Zoom enviado por correo” o link directo si se decide exponerlo.

## 6) Seguridad y cumplimiento

- Secretos Zoom solo en `secretos` (nunca en `config` plano).
- Enmascarar logs de tokens/credenciales.
- No exponer `zoom_start_url` al cliente.
- Timezone siempre normalizado con `calendar_bookings.timezone`.

## 7) Plan por fases

## Fase 1: Infraestructura Zoom (backend)

- Crear servicio `zoom.py` con token + create/update/cancel.
- Tests unitarios de parseo/respuesta/error.

Criterio de salida:

- crear reunión Zoom desde script/test controlado.

## Fase 2: Integración creación de cita

- Integrar Zoom en `web/booking/book` y `agenda/bookings`.
- Persistir `meeting_url` + metadata Zoom.
- Incluir link en correo confirmación.

Criterio de salida:

- booking creado con `meeting_url` válido + correo con link.

## Fase 3: Reprogramar/cancelar

- Integrar update/cancel de Zoom en rutas respectivas.
- Reflejar estado en metadata.

Criterio de salida:

- reprogramación y cancelación sincronizan en Zoom.

## Fase 4: UI de configuración tenant

- Campos Zoom en `/settings/variables`.
- Guardado de secretos y validación básica.

Criterio de salida:

- tenant puede habilitar/deshabilitar Zoom sin tocar código.

## Fase 5: Observabilidad y hardening

- logs estructurados (`zoom_create_ok/fail`, `zoom_update_ok/fail`, `zoom_cancel_ok/fail`)
- métricas de error por tenant
- manejo de rate-limit/retries

Criterio de salida:

- operación estable con alertas mínimas.

## 8) Riesgos y mitigaciones

- Rate limit/API fail Zoom: retries exponenciales + modo tolerante.
- Drift de zona horaria: usar siempre `start_at/end_at/timezone` de booking.
- Credenciales inválidas por tenant: validación en settings + healthcheck.
- Duplicidad de meetings: idempotencia por `booking_id` en metadata.

## 9) Checklist de aceptación final

- Crear cita desde landing crea booking + Zoom + correo con link.
- Crear cita desde embudo manual (sin conversación) crea booking + Zoom, sin inbox.
- Crear cita desde webchat crea booking + Zoom.
- Reprogramar/cancelar se refleja también en Zoom.
- Agenda panel muestra link cuando aplica.
- No se expone `start_url` en UI/correos al cliente.

