## Estado actual del sistema de agenda (2025-11-10 snapshot)

### 1. Base de datos Supabase
- **Tabla principal**: `public.citas` (ver `backups/postgres_20251110_204636_schema.sql:1180`).
  - Campos clave: `start_at`, `end_at`, `timezone`, `estado` (`public.cita_estado`), `provider_calendar_id`, `provider_event_id`, `scheduled_via`, `metadata`.
  - Constraints relevantes:
    - `citas_time_check`: asegura `end_at >= start_at`.
    - `citas_provider_check`: valores válidos `hosting`, `google`, `caldav`.
    - `citas_scheduled_via_check`: `humano`, `ia`, `api`.
    - **No existe** constraint a nivel base de datos que impida traslapes entre citas del mismo calendario.
  - Índices: `citas_estado_idx`, `citas_start_idx`, `citas_active_unique` (evita múltiples citas activas por `tarjeta_id`, pero no por calendario).
- **Vistas actuales**:
  - `public.panel_agenda_calendario` y `public.panel_agenda_demos`: agregan datos de leads/usuarios para reporteo (migraciones `20251202_100500_citas_extra_columns.sql` y `20251202_090000_rename_citas.sql`).
- **Funciones PL/pgSQL activas** (migraciones `20251202_093000_citas_functions.sql`):
  - `public.fn_cita_upsert`: crea/actualiza citas, fija duración por defecto de 45 minutos, no valida traslapes.
  - `public.fn_cita_cancel`: marca cita `cancelada`, opcionalmente limpia `provider_event_id`.
  - Triggers: `tg_citas_sync_stage` (mueve tarjeta de lead a etapa “demo”), `citas_touch_updated_at` (actualiza `actualizado_en`).
- **Ausencias**:
  - No hay tablas de disponibilidad (`agenda_disponibilidad`), bloqueos ni rangos laborales.
  - No existe función `list_demo_slots` en la base; actualmente el asistente regresa horarios prefijados.

### 2. Servicios y variables de entorno vigentes (`variables.md`)
- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_DATABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_PASSWORD`.
- **OpenAI**: `OPENAI_API_KEY`, `OPENAI_ASSISTANT_ID`, `OPENAI_PROMPT_VERSION`, `OPENAI_PROJECT_ID`.
- **Mensajería/SMS**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
- **Agenda externa (CalDAV)**:
  - `TALIA_CALENDARIO_DEFAULT_PROVIDER=caldav`
  - `TALIA_CALENDARIO_USERNAME=hola@talia.mx`
  - `TALIA_CALENDARIO_SERVER_URL=https://mail.talia.mx:2080`
  - `TALIA_CALENDARIO_FULL_CALENDAR_URL=https://mail.talia.mx:2080/calendars/hola@talia.mx/calendar`
  - Servicio actualmente operativo; se seguirá utilizando como fuente de disponibilidad real.
- **Parámetros de disponibilidad** (ver `backend/app/core/config.py:70`):
  - Zona horaria por defecto `demo_availability_timezone` (alias `CALENDARIO_DEMO_TIMEZONE`).
  - Horarios laborales `demo_availability_work_hours` (por defecto `09:00-18:00`) y días hábiles `demo_availability_work_days` (lunes-viernes).
  - Duración estándar (`demo_availability_slot_minutes=45`), colchón (`demo_availability_buffer_minutes=15`) y lookahead (`demo_availability_lookahead_days=21`).

### 3. Flujo actual de agendado
- El webchat ofrece horarios sin consultar la base (opciones repetidas). El prompt (`docs/prompt_landing.md:65`) instruye llamar `list_demo_slots`, pero esa función no está implementada en Supabase ni en el backend.
- Al confirmar un horario, presumiblemente se usa `schedule_demo` en OpenAI → backend, que termina en `fn_cita_upsert`, registrando la cita sin validar empalmes.
- El sistema externo CalDAV se mantiene sincronizado manualmente o mediante integraciones actuales (por confirmar mecanismo exacto); no hay validación de disponibilidad previa en el flujo Tal-IA.

### 4. Objetivo de la migración
- Implementar un flujo que consulte disponibilidad real (CalDAV + ocupación en `public.citas`), presente calendario mensual en el webchat y registre la cita garantizando que no se genere doble booking.
- Reutilizar variables y credenciales existentes, complementando con nuevas tablas/funciones para disponibilidad y validaciones transaccionales.

### 5. Dependencias de código identificadas
- **Webchat / Orquestador IA**:
  - `list_demo_slots`, `schedule_demo`, `reschedule_demo`, `cancel_demo` se manejan en `backend/app/channels/webchat/service.py:1839` en adelante.
  - `schedule_demo` ahora llama `storage.schedule_demo_cita` (RPC `fn_cita_schedule_v2`) tras asegurar la tarjeta. `reschedule_demo` delega en `storage.reschedule_demo_cita` (`fn_cita_reschedule`).
  - La validación de horarios (`compute_demo_availability`) delega en `storage.fetch_agenda_slots`, que invoca `fn_agenda_slots_disponibles` para considerar disponibilidad real.
  - Las respuestas del asistente que incluyen `metadata.availability` se renderizan como calendario interactivo en el widget (`landing/src/assets/js/modules/chat.js#L430`).
- **Servicio de calendario**:
  - `compute_demo_availability` genera slots usando configuración estática (horarios laborales, buffer) y citas existentes (`backend/app/services/calendar.py:853`).
  - Interacción con providers externos (`CalDAV`, `Google`) administrada por `CalendarService` (`backend/app/services/calendar.py:203` y `backend/app/services/calendar.py:446`).
- **Capa de almacenamiento Supabase**:
  - `storage.upsert_demo_cita` encapsula la RPC `fn_cita_upsert` (`backend/app/services/storage.py:1226`).
  - `storage.fetch_agenda_slots` llama al RPC `fn_agenda_slots_disponibles` para obtener disponibilidad consolidada (`backend/app/services/storage.py:1377`).
  - `storage.get_demo_cita` lee citas individuales para reprogramaciones/cancelaciones (`backend/app/services/storage.py:1240`).
- **API Panel / Integraciones internas**:
  - Rutas REST para crear/actualizar citas también consumen `fn_cita_upsert` (`backend/app/api/routes/panel.py:2859` y `backend/app/api/routes/panel.py:2897`).
- **Prompts y tools OpenAI**:
  - Definiciones de herramientas `list_demo_slots`, `schedule_demo`, etc., en `docs/funciones_prompt_openai.md:136`.
  - Instrucciones del flujo conversacional en `docs/prompt_landing.md:65`.

### 6. Flujo operativo actual (Tal-IA → Supabase → CalDAV)
1. **Consulta de horarios**  
   - Al solicitar disponibilidad, Tal-IA invoca `list_demo_slots`; el backend delega en `compute_demo_availability` (`backend/app/services/calendar.py:853`).  
- La función delega en `fn_agenda_slots_disponibles`, que considera disponibilidad declarada (`agenda_*`), citas activas y bloqueos sincronizados del proveedor CalDAV.
2. **Agendado**  
   - Tras elegir horario, `schedule_demo` valida fecha futura, proveedor (`hosting/google/caldav`), datos del lead y arma el payload (`backend/app/channels/webchat/service.py:1850`).  
   - `storage.upsert_demo_cita` ejecuta la RPC `fn_cita_upsert`, creando la cita en `public.citas` (`backend/app/services/storage.py:1226`).  
   - Si el metadata incluye `send_calendar_invite`, el sistema usa `CalendarService` para crear/actualizar evento en el proveedor externo (CalDAV) y adjuntar UID/ETag (`backend/app/services/calendar.py:220` y `backend/app/services/calendar.py:348`).
3. **Reprogramación / cancelación**  
   - `reschedule_demo` y `cancel_demo` siguen rutas similares, actualizando la cita mediante `fn_cita_upsert` o `fn_cita_cancel`, y luego sincronizan cambios con el proveedor externo (`backend/app/channels/webchat/service.py:1937` y `backend/app/services/calendar.py:306`).
4. **Limitaciones detectadas**  
- La disponibilidad ahora se obtiene desde `fn_agenda_slots_disponibles`, que combina `agenda_*`, `citas` y `bloqueos` CalDAV.  
- `fn_cita_schedule_v2`/`fn_cita_reschedule` delegan en `fn_cita_upsert`, pero la constraint `citas_calendario_range_excl` evita empalmes para calendarios con capacidad 1.
