# Plan · Agenda con Calendario Interactivo

Documento de trabajo para seguir el avance de la nueva vista de agenda en el panel (`frontend/panel/src/app/agenda`). Marca cada casilla cuando se complete la tarea correspondiente.

## 1. Alcances generales

- [ ] Validar con el equipo los requisitos funcionales: vista calendario (mes/semana), edición inline, filtros y disparo de notificaciones por correo.
- [ ] Confirmar dependencias externas (librería de calendario, endpoints necesarios, permisos/Supabase).

## 2. Backend / API panel

- Notas (WIP):
  - `GET /panel/agenda/bookings?from=&to=&estado=&responsable=` → proxy seguro de `panel_calendar_bookings`, pagina y filtra por rango, estado y asignado. Responde `items[]` + `metrics`.
  - `GET /panel/agenda/availability?resource_id=&from=&to=&timezone=` → invoca `fn_calendar_list_slots`, retorna slots ordenados con flags `is_available`, `booked`, `holds`.
  - `POST /panel/agenda/bookings/{booking_id}/reschedule` body: `{ start_at: ISO, notes?: string }` → usa `calendar_service.reschedule_booking`, refresca metadata y dispara correo “Demo reprogramada”.
  - `POST /panel/agenda/bookings/{booking_id}/cancel` body: `{ reason?: string }` → usa `calendar_service.cancel_booking` + correo “Demo cancelada / reprogramar cuando quieras”.
  - Considerar `GET /panel/agenda/bookings/{id}` para detalle si la vista necesita datos extendidos (historial de acciones, nota interna).

- [x] Diseñar contrato REST para la agenda del panel (lectura, disponibilidad, edición, cancelación).
  - Autenticación: reutilizar `X-Talia-Panel-Token` (JWT del usuario) heredado de las rutas `/panel/...`; cada endpoint revalida el token y forwardea `sub` para filtros.
  - `GET /panel/agenda/bookings`: query `from`/`to` (ISO, default hoy-30 + hoy+30), `estado[]`, `assigned[]`, `provider[]`, `search`. Respuesta:
    ```json
    {
      "items": [
        {
          "id": "uuid",
          "start_at": "2025-02-10T15:00:00Z",
          "end_at": "2025-02-10T15:30:00Z",
          "timezone": "America/Mexico_City",
          "estado": "confirmada",
          "notes": "string|null",
          "contacto": { "id": "...", "nombre": "...", "correo": "...", "telefono": "..." },
          "asignado": { "id": "...", "nombre": "..." },
          "propietario": { "id": "...", "nombre": "..." },
          "canal": "whatsapp",
          "meeting_url": "https://...",
          "metadata": { "invite_status": "sent", ... }
        }
      ],
      "metrics": { "total": 0, "activas": 0, "proximas24h": 0, "canceladas": 0, "realizadas": 0 },
      "pagination": { "next_cursor": null }
    }
    ```
    Internamente: consulta `panel_calendar_bookings` con `limit` 200 + cursor `start_at,id`.
  - `GET /panel/agenda/availability`: requiere `resource_id` (default `settings.webchat_calendar_resource_id`), `from`/`to` (YYYY-MM-DD) y opcional `timezone`. Respuesta:
    ```json
    {
      "resource_id": "...",
      "window_start": "...",
      "window_end": "...",
      "slot_duration_minutes": 30,
      "generated_at": "...",
      "slots": [
        {
          "slot_id": "...",
          "start_at": "...",
          "end_at": "...",
          "timezone": "America/Mexico_City",
          "local_date": "2025-02-10",
          "local_time": "10:00",
          "capacity": 1,
          "booked": 0,
          "holds": 0,
          "is_available": true
        }
      ]
    }
    ```
  - `POST /panel/agenda/bookings/{booking_id}/reschedule`:
    ```json
    {
      "start_at": "2025-02-10T16:00:00-06:00",
      "notes": "Opcional",
      "notify": true
    }
    ```
    Respuesta: booking actualizado + `notifications: { email: { status: "sent|failed", message_id } }`.
  - `POST /panel/agenda/bookings/{booking_id}/cancel`:
    ```json
    { "reason": "Cliente canceló", "notify": true }
    ```
    Respuesta incluye booking con `estado="cancelada"`.
  - Opcional `GET /panel/agenda/bookings/{booking_id}` para detalle extendido (historial, metadata completa, timeline de mensajes) si el calendario lo requiere.
- [x] Implementar endpoint de lectura que encapsule `panel_calendar_bookings` evitando exponer `service_role` al frontend.
  - Ruta: `GET /panel/agenda/bookings` (`backend/app/api/routes/panel.py`). Maneja filtros de fecha/rango, estado, responsable, búsqueda y devuelve `items`, `metrics`, `total`, `limit/offset` y `has_more`.
  - Respuesta incluye bloques `contacto`, `asignado`, `propietario`, y normaliza estados (`confirmada/cancelada/reprogramada/realizada`). Métricas replican el cálculo del frontend (activas, próximas 24h, canceladas, realizadas).
- [x] Implementar endpoint para disponibilidad (`fn_calendar_list_slots`) con filtros de recurso, rango y zona horaria.
  - Ruta: `GET /panel/agenda/availability` (usa `calendar_service.list_slots`). Requiere JWT, permite `from`, `to`, `timezone`, `resource_id` y `max_days` (clamp 60). Respuesta `{ ok, availability }` replicando la estructura del helper (slots, window, duration).
- [x] Implementar endpoints para reprogramar (`fn_calendar_reschedule_booking`) y cancelar citas (`fn_calendar_cancel_booking`), registrando metadata y motivos.
  - Rutas: `POST /panel/agenda/bookings/{booking_id}/reschedule` y `/cancel`. Ambas validan JWT, consultan la cita vía Supabase, invocan los servicios de webchat para ejecutar la acción y regresan el booking actualizado (`backend/app/api/routes/panel.py`).
- [ ] Añadir envío de correos para reprogramaciones/cancelaciones y marcar estado en `calendar_bookings.metadata`.
- [ ] Cubrir rutas nuevas con pruebas unitarias/integración.

## 3. Frontend / Panel

- Notas (WIP):
  - Librerías evaluadas: `@fullcalendar/react` (rich features, SSR tricky) vs `react-big-calendar` (ligera, depende de Luxon/DateFns). Backlog: prototipar RBC con adaptador de zona horaria.
  - UX prevista: toggle “Calendario | Lista”; vista calendario con header (mes/semana), chips para estado/responsable, clic en evento → panel lateral con acciones (abrir enlace, ver notas, botones “Reprogramar”, “Cancelar”).
  - Reprogramar: modal paso 1 selecciona nueva fecha, paso 2 consume availability y confirma; cancelar: modal con textarea “Motivo”.

- [ ] Elegir librería de calendario (FullCalendar, React Big Calendar u otra) y validar soporte SSR/Next 16.
- [ ] Crear data layer en `src/lib/agenda` que consuma los nuevos endpoints (lectura + availability + acciones).
- [ ] Construir componente de calendario con modos mes/semana y sincronizar filtros existentes (estado, responsable, proveedor).
- [ ] Agregar vista detalle/drawer para cada cita con acciones de abrir enlace, reprogramar (selector de slot) y cancelar (motivo + confirmación).
- [ ] Mantener vista en tabla como fallback opcional (toggle Calendario/Tabla).
- [ ] Manejar errores y estados de carga (skeletons, toasts, recuperación de sesión).

## 4. Notificaciones y UX

- [ ] Definir copy y plantillas para correos de reprogramación/cancelación.
- [ ] Confirmar si se requiere notificación interna (Slack/email al equipo) cuando el panel edite una cita.
- [ ] Documentar el flujo para el equipo de soporte (cómo reprogramar/cancelar desde el panel).

## 5. QA y despliegue

- [ ] Agregar pruebas e2e/manuales que cubran creación, reprogramación y cancelación desde el panel.
- [ ] Validar que los correos llegan y los archivos ICS se adjuntan correctamente.
- [ ] Actualizar documentación (README, manual interno) con instrucciones de uso del calendario.
- [ ] Coordinar despliegue y monitoreo (logs, alertas) para las rutas nuevas.

> Actualiza este archivo conforme avances y anota cualquier decisión relevante para mantener el historial del proyecto.
