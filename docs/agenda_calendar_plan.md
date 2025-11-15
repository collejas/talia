# Plan · Agenda con Calendario Interactivo

Documento de trabajo para seguir el avance de la nueva vista de agenda en el panel (`frontend/panel/src/app/agenda`). Marca cada casilla cuando se complete la tarea correspondiente.

## 1. Alcances generales

- [ ] Validar con el equipo los requisitos funcionales: vista calendario (mes/semana), edición inline, filtros y disparo de notificaciones por correo.
- [ ] Confirmar dependencias externas (librería de calendario, endpoints necesarios, permisos/Supabase).

## 2. Backend / API panel

- [ ] Diseñar contrato REST para la agenda del panel (lectura, disponibilidad, edición, cancelación).
- [ ] Implementar endpoint de lectura que encapsule `panel_calendar_bookings` evitando exponer `service_role` al frontend.
- [ ] Implementar endpoint para disponibilidad (`fn_calendar_list_slots`) con filtros de recurso, rango y zona horaria.
- [ ] Implementar endpoints para reprogramar (`fn_calendar_reschedule_booking`) y cancelar citas (`fn_calendar_cancel_booking`), registrando metadata y motivos.
- [ ] Añadir envío de correos para reprogramaciones/cancelaciones y marcar estado en `calendar_bookings.metadata`.
- [ ] Cubrir rutas nuevas con pruebas unitarias/integración.

## 3. Frontend / Panel

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

