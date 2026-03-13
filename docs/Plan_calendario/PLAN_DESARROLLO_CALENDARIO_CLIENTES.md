# Plan de desarrollo: Calendario para clientes (auto-agendado)

## 1. Objetivo
Habilitar que un prospecto reciba un correo de prospeccion en frio, haga clic en un enlace personal y agende una demo directamente en el calendario de Tal-IA, manteniendo trazabilidad completa de origen/campana/template/contacto.

Resultado esperado:
- Menos friccion para agendar demo.
- Atribucion completa en CRM y mapa de conversion.
- Sin dependencia obligatoria de Calendly/Cal.com.

## 2. Alcance funcional
Incluye:
- Vista publica de agenda para clientes (`/agenda` o `/demo`).
- URL unica de reserva por envio (`booking_url`) con tracking.
- Seleccion de horario + confirmacion de cita.
- Notificacion a vendedor/equipo y registro en pipeline.
- Reporte de conversion por campana/template/origen.

No incluye (fase futura):
- Pagos.
- Reagendado self-service avanzado (se deja endpoint preparado).

## 3. Estado actual (base existente)
Ya existe infraestructura utilizable:
- Config por tenant en `organizaciones.config.webchat.calendar.*` y `organizaciones.config.calendar.*`.
- Servicios de slots/hold/confirmacion en backend (`calendar.py`).
- Plantillas de prospeccion y tracking en `prospeccion_contact_sender.py`.
- Tablas de calendario (`calendar_resources`, `calendar_slot_holds`, `calendar_bookings`).

Riesgo detectado para corregir antes de salida:
- Validar `calendar.server_url` y puerto por tenant (consistencia URL/port).

## 4. Diseno propuesto
### 4.1 Flujo end-to-end
1. Se envia correo de prospeccion con `{{booking_url}}`.
2. El prospecto abre la landing de agenda.
3. Frontend consulta slots disponibles por tenant/recurso.
4. Cliente selecciona horario -> backend crea hold.
5. Cliente confirma -> backend confirma booking.
6. Se crea/actualiza contacto y oportunidad (si aplica).
7. Se registran eventos de atribucion para metricas.

### 4.2 Booking URL
Formato recomendado:
`https://talia.mx/demo?oid={organizacion_id}&cid={contacto_id}&camp={campana_id}&tid={template_id}&eid={envio_id}&src=prospeccion`

Reglas:
- Firmar el token (HMAC/JWT corto) para evitar manipulacion.
- Vencimiento configurable (ej. 30 dias).
- Mantener UTM y IDs para atribucion.

### 4.3 Datos minimos a capturar
- `organizacion_id`, `contacto_id`, `campana_id`, `template_id`, `envio_id`.
- `ip`, `user_agent`, `referer`, `accept_language`.
- Geo derivada de IP (pais/estado/municipio cuando aplique).
- `first_seen_at`, `booked_at`, `booking_id`.

## 5. Cambios por capa
## 5.1 Base de datos
1. Crear tabla `public.web_booking_sessions`:
- `id uuid pk`
- `organizacion_id uuid not null`
- `contacto_id uuid null`
- `campana_id uuid null`
- `template_id uuid null`
- `envio_id uuid null`
- `source text`
- `utm_source/utm_medium/utm_campaign text`
- `ip inet`, `user_agent text`, `referer text`
- `geo_country text`, `geo_state text`, `geo_municipio text`
- `opened_at timestamptz`, `booked_at timestamptz`
- `calendar_booking_id uuid null`

2. Indices:
- `(organizacion_id, opened_at desc)`
- `(campana_id, template_id, opened_at desc)`
- `(calendar_booking_id)`

3. RLS y grants:
- Politicas por `organizacion_id`.
- Service-role para escritura tecnica.

## 5.2 Backend
1. Endpoint publico `GET /calendar/public/slots`:
- Recibe token de `booking_url`.
- Resuelve tenant/resource/timezone.
- Devuelve slots disponibles.

2. Endpoint publico `POST /calendar/public/book`:
- Recibe token + slot.
- Crea hold y confirma booking.
- Registra `web_booking_sessions.booked_at`.

3. Servicio de tracking de visita de agenda:
- Registrar apertura de `booking_url` (evento `booking_page_opened`).
- Enriquecimiento geo IP.

4. Integracion con prospeccion:
- En `prospeccion_contact_sender`, agregar placeholder `{{booking_url}}`.
- Fallback: si no hay variable, no bloquear envio; registrar warning.

5. Integracion CRM:
- Opcional configurable: al agendar, mover etapa a `demo_agendada`.

## 5.3 Frontend
1. Nueva vista publica `/demo`:
- Header simple con branding tenant.
- Selector de fecha/hora.
- Confirmacion y mensaje final.

2. Estados UI:
- Link invalido/expirado.
- Sin disponibilidad.
- Error temporal de servicio.

3. Medicion:
- Evento de vista (open).
- Evento de intento de agendado.
- Evento de confirmacion exitosa.

## 6. Fases de implementacion
### Fase 1 (MVP funcional)
- `{{booking_url}}` en plantillas.
- Landing publica `/demo`.
- Slots + booking confirmado.
- Guardado de sesion en `web_booking_sessions`.

### Fase 2 (Atribucion y operaciones)
- Dashboard de conversion visita->agendado por campana/template.
- Alertas operativas si falla proveedor de calendario.
- Notificaciones internas (email/WA) al equipo.

### Fase 3 (Optimzacion)
- Reagendado/cancelacion self-service con token.
- Recordatorios automaticos.
- Scoring por calidad de agendado (show rate).

## 7. Criterios de aceptacion
- Un correo de prospeccion puede incluir `{{booking_url}}` valido.
- El usuario agenda sin autenticarse.
- Queda relacion entre envio (`eid`) y booking confirmado.
- El panel muestra conversion por campana/template.
- No se rompe flujo actual de webchat ni WhatsApp.

## 8. Riesgos y mitigaciones
1. Config por tenant incompleta.
- Mitigacion: endpoint de validacion previa + checklist en settings.

2. Fraude/manipulacion de enlaces.
- Mitigacion: token firmado, expiracion y rate-limit por IP.

3. Doble reserva por concurrencia.
- Mitigacion: usar hold transaccional + confirmacion idempotente.

4. Perdida de atribucion.
- Mitigacion: persistir IDs (`cid/tid/eid`) desde apertura hasta booking.

## 9. Plan de pruebas
- Unit tests backend: parsing token, slots, booking, errores.
- Integracion: correo enviado -> click -> booking -> etapa actualizada.
- QA manual multi-tenant (2 tenants con config distinta).
- Prueba timezone (America/Mexico_City, UTC).

## 10. Entregables
- Migracion SQL (nueva tabla + indices + RLS).
- Endpoints backend publicos de agenda.
- Vista frontend `/demo`.
- Soporte `{{booking_url}}` en prospeccion.
- Documento operativo para equipo comercial.

## 11. Decision tecnica recomendada
Implementar con calendario nativo Tal-IA.
Calendly/Cal.com quedan como opcion de contingencia o integracion futura, pero no son necesarios para el objetivo actual.

## 12. Checklist de arranque
- [ ] Validar config calendario por tenant en produccion.
- [ ] Definir dominio final de agenda (`/demo` o subdominio).
- [ ] Aprobar estructura de `web_booking_sessions`.
- [ ] Aprobar formato final de `booking_url`.
- [ ] Aprobar copy de plantilla de correo con CTA de agenda.
