# Diagnóstico BD/API para Cita + Contacto + Oportunidad (sin sobre-ingeniería)

## Resumen ejecutivo
No necesitamos crear tablas nuevas.
La base actual ya tiene todo para implementar el flujo desde Agenda:
- `contactos`
- `oportunidades`
- `etapas_pipeline`
- `calendar_bookings` (+ `calendar_slot_holds`, `calendar_resources`)
- vista `panel_calendar_bookings`
- endpoints CRM para crear contacto, crear oportunidad y crear booking.

## Lo que ya existe y debemos reutilizar

### Agenda
- Tabla `calendar_bookings` con:
  - `contact_id` (contacto)
  - `tarjeta_id` (oportunidad)
  - `conversacion_id`
  - `status` (`confirmed`/`cancelled`)
- Índices clave:
  - `calendar_bookings_tarjeta_idx`
  - `calendar_bookings_conversation_idx`
  - unique slot por `resource_id,start_at` cuando `status='confirmed'`.
- Funciones SQL listas:
  - `fn_calendar_hold_slot`
  - `fn_calendar_confirm_slot`
  - `fn_calendar_cancel_booking`
  - `fn_calendar_reschedule_booking`
- Endpoint backend existente:
  - `POST /crm/agenda/bookings`
  - Ya acepta: `start_at`, `notes`, `contacto_id`, `oportunidad_id`, `conversation_id`, `canal`.

### Contactos
- Endpoint existente:
  - `GET /crm/contacts/search`
  - `POST /crm/contacts`
- Tabla `contactos` (campos útiles para alta rápida):
  - `nombre_completo`, `correo`, `telefono_e164`, `company_name`, `notes`, `origen`, `estado`.

### Oportunidades
- Endpoint existente:
  - `POST /crm/oportunidades`
  - `GET /crm/oportunidades` (filtrable por `contacto_id`, `estado`)
- Requisito importante:
  - `CRMOpportunityCreate` exige `etapa_id` (obligatorio).
- Helpers existentes en repo:
  - `get_default_stage_id(...)`
  - `get_stage_by_code(...)`

### Vista para UI
- `panel_calendar_bookings` ya une booking + oportunidad + contacto + conversación.
- Usa `COALESCE(cb.contact_id, o.contacto_principal_id)` para contacto visible.

## Restricciones reales a respetar

1. Crear oportunidad requiere `etapa_id`.
2. Permisos:
- agenda: `agenda.view`
- contactos: `contacts.read` / `contacts.write`
- oportunidades: `pipeline.view`
3. No hay unicidad por `correo` o `telefono_e164` en `contactos`.
- Se pueden duplicar contactos si no controlamos en UX/backend.

## Hallazgo importante
`CRMContactCreate` en API permite campo `metadata`, pero tabla `contactos` usa `contacto_datos`.
Para el flujo nuevo:
- evitar mandar `metadata` al crear contacto rápido,
- o mapear explícitamente `metadata -> contacto_datos` en backend.

## Recomendación de implementación acoplada

### Sin tablas nuevas
- Reusar `POST /crm/agenda/bookings`.
- Reusar `POST /crm/contacts` para alta rápida.
- Reusar `POST /crm/oportunidades` cuando switch `crear oportunidad` esté activo.

### Lógica recomendada
1. Selección/creación de contacto.
2. Consultar oportunidades abiertas del contacto:
   - `GET /crm/oportunidades?contacto_id=<id>&estado=abierta&limit=10`
3. Decisión:
   - vincular oportunidad existente, o
   - crear nueva (resolver `etapa_id` por `get_default_stage_id` o `prospeccion_primer_contacto`).
4. Crear booking pasando `contacto_id` + `oportunidad_id` (si aplica).

## Conclusión
La arquitectura actual ya soporta el flujo objetivo. El trabajo es de orquestación UX + backend ligero, no de rediseño de datos.
