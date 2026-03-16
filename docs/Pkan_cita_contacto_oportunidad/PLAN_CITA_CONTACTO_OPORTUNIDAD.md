# Plan: Crear cita desde Agenda con búsqueda/creación de contacto y vínculo de oportunidad

## 1) Objetivo
Permitir que en la vista `Agenda` se pueda:
- crear una cita nueva,
- buscar y seleccionar contacto existente,
- crear contacto rápido sin salir del modal,
- decidir si se crea una oportunidad nueva o se vincula a una existente.

## 1.1) Hallazgos de auditoría BD/API (16-mar-2026)
- No se requieren tablas nuevas. El modelo actual cubre el caso.
- Reutilizar entidades existentes:
  - `contactos`
  - `oportunidades`
  - `etapas_pipeline`
  - `calendar_bookings` (+ `calendar_slot_holds`, `calendar_resources`)
  - vista `panel_calendar_bookings`
- Reutilizar endpoints existentes:
  - `GET /crm/contacts/search`
  - `POST /crm/contacts`
  - `GET /crm/oportunidades` (filtrando por `contacto_id`, `estado=abierta`)
  - `POST /crm/oportunidades`
  - `POST /crm/agenda/bookings`
- Restricciones reales detectadas:
  - Crear oportunidad exige `etapa_id`.
  - Permisos involucrados: `agenda.view`, `contacts.read`, `contacts.write`, `pipeline.view`.
  - No hay unicidad por `correo`/`telefono_e164` en `contactos` (riesgo de duplicados).
- Nota técnica:
  - `CRMContactCreate` expone `metadata`, pero tabla base usa `contacto_datos`; en alta rápida evitar `metadata` o mapear explícitamente.

## 2) Decisión recomendada (producto)
Implementar una pregunta explícita con default inteligente:
- `Crear oportunidad`: switch visible en el modal.
- Default:
  - `ON` si el contacto no tiene oportunidad abierta.
  - `OFF` si ya tiene oportunidad abierta y mostrar opción `Vincular a oportunidad existente`.

Razonamiento:
- evita duplicados de oportunidades,
- mantiene embudo limpio,
- conserva flexibilidad para casos manuales de agenda.

## 3) Alcance MVP
Incluye:
- UI modal `Nueva cita` en `Agenda`.
- Buscador de contacto (nombre/correo/teléfono).
- Alta rápida de contacto (nombre + teléfono/correo mínimo).
- Selector de oportunidad:
  - ninguna,
  - crear nueva,
  - vincular existente.
- Creación de booking y persistencia en `calendar_bookings`.

No incluye en MVP:
- deduplicación avanzada por fuzzy matching,
- wizard largo de calificación,
- edición completa de oportunidad desde el modal.

## 3.1) Acoplamiento confirmado (sin rediseño de datos)
- `calendar_bookings.contact_id` y `calendar_bookings.tarjeta_id` ya cubren el vínculo cita-contacto-oportunidad.
- `panel_calendar_bookings` ya expone datos combinados para la UI (contacto/oportunidad/conversación).
- Para crear oportunidad nueva, resolver `etapa_id` con etapa inicial existente (`get_default_stage_id`) y opcionalmente preferir código `prospeccion_primer_contacto` si está disponible.

## 4) Flujo UX propuesto
1. Usuario abre `Agenda` y da clic en `Nueva cita`.
2. Selecciona fecha/hora/recurso.
3. Busca contacto:
   - si existe: lo selecciona.
   - si no existe: `Crear contacto` inline.
4. Sistema evalúa oportunidades abiertas del contacto:
   - si hay una: sugiere vincular.
   - si no hay: sugiere crear nueva.
5. Usuario confirma y se crea la cita.
6. Respuesta muestra:
   - `booking_id`,
   - contacto vinculado,
   - oportunidad vinculada/creada (si aplica).

## 5) Reglas de negocio
- Una cita siempre debe tener `contact_id`.
- Una cita puede tener o no `tarjeta_id/oportunidad_id`.
- Si `crear_oportunidad=true` y ya existe oportunidad abierta:
  - pedir confirmación para crear otra o reutilizar existente.
- Si el contacto fue creado en el modal, usarlo inmediatamente en el booking.
- No crear endpoints/tablas nuevas si el flujo se puede resolver orquestando los endpoints actuales.

## 6) Diseño técnico
### Frontend (panel)
- Agregar CTA `Nueva cita` en `frontend/panel/src/components/agenda/agenda-view.tsx`.
- Crear modal `agenda-create-booking-modal.tsx`.
- Reusar servicios:
  - búsqueda contacto: `/crm/contacts/search`,
  - agenda create booking: `/crm/agenda/bookings`.
- Nuevo endpoint Next (si se requiere agregación):
  - `/api/agenda/bookings/create`.

### Backend (CRM)
- Reusar endpoint existente `POST /crm/agenda/bookings`.
- Extender payload para soportar explícitamente:
  - `contacto_id` (obligatorio),
  - `oportunidad_id` (opcional),
  - `crear_oportunidad` (bool opcional),
  - `datos_oportunidad` (opcional para crear nueva).
- Si `crear_oportunidad=true` y `oportunidad_id` vacío:
  - crear oportunidad y usar su id como `tarjeta_id` al confirmar booking.
- Para crear oportunidad:
  - usar `POST /crm/oportunidades` con `etapa_id` válido.
  - fuente de `etapa_id`: primera etapa del pipeline o `prospeccion_primer_contacto`.
- Para contacto rápido:
  - usar `POST /crm/contacts` con campos base (`nombre_completo`, `telefono_e164`, `correo`, `company_name`, `origen`).
  - evitar enviar `metadata` en MVP.

### Datos
- `calendar_bookings` ya soporta `contact_id` y `tarjeta_id`.
- Guardar en `metadata`:
  - `source=panel_agenda`,
  - `created_from=agenda_create_modal`,
  - flags de decisión (`crear_oportunidad`, `oportunidad_resuelta_por`).

## 7) API contrato sugerido
`POST /crm/agenda/bookings`

Payload ejemplo:
```json
{
  "contacto_id": "uuid",
  "oportunidad_id": "uuid-opcional",
  "crear_oportunidad": true,
  "datos_oportunidad": {
    "titulo": "Interesado en Tal-IA",
    "etapa_id": "uuid-etapa-inicial"
  },
  "start_at": "2026-03-16T16:00:00Z",
  "notes": "Demo inicial",
  "canal": "manual"
}
```

## 8) Validaciones
- `contacto_id` requerido.
- `start_at` requerido y válido.
- `oportunidad_id` debe pertenecer a la misma organización del contacto.
- bloquear bookings en pasado (según regla actual).

## 9) Riesgos y mitigación
- Duplicado de oportunidades: resolver con default inteligente + confirmación.
- Contactos incompletos: mínimo requerido en alta rápida.
- Contactos duplicados: búsqueda obligatoria previa por nombre/teléfono/correo antes de crear.
- Latencia en modal: debounce en búsqueda (300ms) + loader.

## 10) Fases de implementación
### Fase 1 (MVP)
- Modal UI + búsqueda contacto + alta rápida + crear cita con contacto.

### Fase 2
- Vincular/crear oportunidad desde el mismo modal.

### Fase 3
- Reglas anti-duplicado y recomendaciones automáticas más avanzadas.

## 11) Criterios de aceptación
- Desde Agenda puedo crear cita con contacto existente.
- Desde Agenda puedo crear contacto y luego crear cita sin recargar.
- Puedo decidir crear o no oportunidad.
- Si hay oportunidad abierta, el sistema la sugiere.
- La cita aparece en agenda con contacto y oportunidad correctos.

## 12) Checklist técnico
- [ ] UI modal nueva cita.
- [ ] Hook de búsqueda de contactos con debounce.
- [ ] Form de alta rápida de contacto.
- [ ] Endpoint/create action para crear cita con decisión de oportunidad.
- [ ] Pruebas manuales E2E (3 escenarios: con oportunidad, sin oportunidad, creando contacto).
- [ ] Telemetría/logs de decisión (`crear_oportunidad`).
