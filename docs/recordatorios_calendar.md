# Recordatorios automáticos de demos

## Objetivo
Garantizar que cada demo confirmada reciba un recordatorio antes del horario agendado, sin intervención manual, y que el estado quede registrado en `calendar_bookings` para monitoreo desde el panel.

## Estructura de datos
- `calendar_bookings.reminder_status`: `pending | queued | sent | failed`.
- `calendar_bookings.reminder_scheduled_at`: fecha/hora objetivo para disparar el recordatorio (por defecto, 2 horas antes del `start_at`).
- `calendar_bookings.reminder_sent_at`: timestamp del correo de recordatorio exitoso.
- `calendar_bookings.reminder_error`: texto con el último error si la notificación falla.
- Además, `metadata` almacena `invite_status`, `invite_message_id`, y ahora también `reminder_status` / `reminder_scheduled_at` para el consumo del panel.

## Flujo propuesto
1. **Confirmación de booking**
   - `backend/app/channels/webchat/service.py` ejecuta `_send_booking_confirmation_email`.
   - Además de enviar el ICS, la función escribe en metadata:
     ```json
     {
       "invite_status": "sent",
       "invite_message_id": "<id>",
       "invite_sent_at": "2025-11-14T22:15:40Z",
       "invite_email": "arturo@example.com",
       "reminder_status": "pending",
       "reminder_scheduled_at": "2025-11-17T15:00:00Z"
     }
     ```
   - El trigger `fn_calendar_schedule_reminder` rellena también las columnas dedicadas (`reminder_status`, `reminder_scheduled_at`).

2. **Job de recordatorios**
   - Un cron (por ejemplo, cada 5 minutos) invoca `fn_calendar_due_reminders(p_now := now(), p_limit := 100)`.
   - El job recorre los bookings devueltos y envía el correo/SMS de recordatorio (puede reutilizar `_send_booking_confirmation_email` con un template distinto o un helper específico).
   - Tras cada envío, llamar `fn_calendar_mark_reminder_sent(booking_id)` para marcar `sent`. Si falla, invocar `fn_calendar_mark_reminder_sent(booking_id, 'error_message')` para dejar evidencia y permitir reintentos manuales.

3. **Monitoreo**
   - El panel puede leer `metadata.reminder_status` o las columnas directas para mostrar si el recordatorio está programado, enviado o falló.
   - Logs (`calendar.invite_sent`, `calendar.invite_send_failed`) ya registran los envíos del correo inicial; se recomienda agregar logs similares para los recordatorios cuando se implemente el job.

## Próximos pasos
- Implementar el job (puede ser un script de cron en backend o un edge function en Supabase) que ejecute los pasos descritos en el punto 2.
- Exponer en el panel un indicador visual del estado del recordatorio usando `metadata` o las columnas nuevas.
- Añadir alertas si `reminder_status = 'failed'` por más de N minutos antes del evento.
