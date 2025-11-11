# Procedimiento para validar conexión CalDAV (staging / producción)

> Objetivo: comprobar que las credenciales `TALIA_CALENDARIO_*` permiten listar y crear eventos antes de reactivar las citas.

## 1. Preparar entorno
- Configura variables de entorno en la terminal:
  ```bash
  export CALDAV_USER="hola@talia.mx"
  export CALDAV_PASS="********"
  export CALDAV_BASE_URL="https://mail.talia.mx:2080"
  export CALDAV_CALENDAR_URL="$CALDAV_BASE_URL/calendars/hola@talia.mx/calendar/"
  ```
- Si trabajas desde staging, usa un usuario alterno para evitar tocar el calendario de producción.

## 2. Verificar autenticación básica (PROPFIND)
```bash
curl -u "$CALDAV_USER:$CALDAV_PASS" \
     -X PROPFIND \
     -H "Depth: 0" \
     "$CALDAV_CALENDAR_URL"
```
- Debes recibir respuesta `207 Multi-Status`.  
- Si obtienes `401 Unauthorized`, valida contraseña o bloqueo por IP/firewall.

## 3. Listar eventos existentes
```bash
curl -u "$CALDAV_USER:$CALDAV_PASS" \
     -X REPORT \
     -H "Depth: 1" \
     -H "Content-Type: application/xml" \
     --data '<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>' \
     "$CALDAV_CALENDAR_URL"
```
- Guarda la salida para comparar antes/después del mantenimiento.

## 4. Crear evento de prueba (OPCIONAL)
- Genera un UID y archivo ICS:
```bash
UUID=$(uuidgen)
cat > demo_event.ics <<EOF
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Talia//Calendario Demo//ES
BEGIN:VEVENT
UID:$UUID
DTSTAMP:$(date -u +"%Y%m%dT%H%M%SZ")
DTSTART:$(date -u -d "+1 hour" +"%Y%m%dT%H%M%SZ")
DTEND:$(date -u -d "+1 hour 45 minutes" +"%Y%m%dT%H%M%SZ")
SUMMARY:Validación CalDAV
DESCRIPTION:Evento de prueba previo a migración
END:VEVENT
END:VCALENDAR
EOF
```
- Sube el evento:
```bash
curl -u "$CALDAV_USER:$CALDAV_PASS" \
     -X PUT \
     -H "Content-Type: text/calendar; charset=utf-8" \
     --data-binary @demo_event.ics \
     "$CALDAV_CALENDAR_URL$UUID.ics"
```
- Confirma que responde `201 Created` o `204 No Content`.

## 5. Validar integración desde backend
- En staging, inicia un shell con las variables cargadas y ejecuta:
  ```bash
  poetry run python - <<'PYCODE'
  from app.services.calendar import calendar_service, build_event_from_cita
  import asyncio, uuid, datetime
  from zoneinfo import ZoneInfo

  async def main():
      event = build_event_from_cita({
          "id": str(uuid.uuid4()),
          "start_at": datetime.datetime.now(ZoneInfo("America/Mexico_City")) + datetime.timedelta(hours=2),
          "end_at": datetime.datetime.now(ZoneInfo("America/Mexico_City")) + datetime.timedelta(hours=3),
          "timezone": "America/Mexico_City",
          "provider": "caldav",
          "metadata": {}
      })
      result = await calendar_service.create_event("caldav", event)
      print("Created:", result.event_id)
      await calendar_service.delete_event("caldav", result.event_id)
      print("Deleted:", result.event_id)

  asyncio.run(main())
  PYCODE
  ```
- Verifica que `create_event` y `delete_event` no arrojen `CalendarProviderError`.

## 6. Limpieza
- Elimina el evento de prueba si fue creado:
```bash
curl -u "$CALDAV_USER:$CALDAV_PASS" \
     -X DELETE \
     "$CALDAV_CALENDAR_URL$UUID.ics"
```
- Borra archivos temporales:
```bash
rm -f demo_event.ics
unset CALDAV_USER CALDAV_PASS CALDAV_BASE_URL CALDAV_CALENDAR_URL UUID
```

## 7. Checklist final
- [ ] PROPFIND exitoso (`207`).
- [ ] REPORT devuelve eventos existentes.
- [ ] Evento de prueba creado y eliminado correctamente (opcional).
- [ ] Script Python confirma que el backend puede crear/eliminar eventos con las credenciales.
- [ ] Se registró evidencia (capturas/logs) para el acta del despliegue.

> Si alguno de los pasos falla, escalar antes de levantar la pausa del agendado. No reanudar `schedule_demo` hasta que CalDAV responda correctamente.
