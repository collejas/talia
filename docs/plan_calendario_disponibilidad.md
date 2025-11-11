## Fase 0 · Descubrimiento y congelamiento
- [ ] Confirmar con stakeholders la ventana de mantenimiento y comunicar el congelamiento temporal de agendado en `talia.mx`.
- [ ] Registrar estado actual del sistema: exportar copias de `public.citas`, `panel_agenda_calendario`, `panel_agenda_demos` y métricas relevantes antes de cualquier cambio.
- [ ] Documentar dependencias externas (integraciones con Google/Zoom, Zapier, cron jobs) que interactúan con citas para coordinar el corte.
- [ ] Respaldar y validar las variables de entorno vigentes (`variables.md`), anotando servicios activos: OpenAI, Supabase, correo y calendario CalDAV (`TALIA_CALENDARIO_*`).

## Fase 1 · Inventario y limpieza del flujo existente
- [ ] Revisar el respaldo `backups/postgres_20251110_204636_schema.sql` y confirmar la estructura real en la base productiva (tipos `public.cita_estado`, triggers, constraints).
- [ ] Mapear cada punto que crea o modifica citas:
  - `public.fn_cita_upsert` y `public.fn_cita_cancel` (`supabase/migrations/20251202_093000_citas_functions.sql`).
  - Triggers relacionados (`tg_citas_sync_stage`, `citas_touch_updated_at`).
  - Endpoints o RPC en Supabase/Edge Functions que consumen estas funciones.
  - Automatizaciones externas (webhooks, bots internos).
- [ ] Identificar y documentar en qué rutas del frontend (`talia.mx`) se invocan las APIs de agendado.
- [ ] Generar reporte de citas activas (estados `pendiente`, `confirmada`, `reprogramada`) e identificar duplicados/empalmes manualmente.
- [ ] Definir estrategia de limpieza:
  - [ ] Cancelar o reprogramar manualmente las citas con empalmes.
  - [ ] Acordar qué registros históricos permanecerán y cuáles se archivarán.
  - [ ] Preparar script SQL para consolidar las citas existentes (estatus finales, notas de auditoría).
- [ ] Actualizar temporalmente el prompt y el front para pausar nuevas agendas mientras se completa la migración (mensaje informativo al usuario).

## Fase 2 · Diseño de disponibilidad y modelo de datos
- [ ] Definir responsables (asesores) y fuentes de disponibilidad: horario fijo, sincronización con el servicio CalDAV existente (`mail.talia.mx`), y bloques manuales.
- [ ] Diseñar tablas nuevas:
  - [ ] `agenda_disponibilidad` (usuario/asesor, día de la semana, hora inicio/fin, capacidad, proveedor).
  - [ ] `agenda_bloqueos` (usuario/asesor, `tstzrange`, motivo, origen).
  - [ ] `agenda_excepciones` o calendario laboral (días festivos, cierres especiales).
- [ ] Evaluar reutilización de campos existentes en `public.citas` (ej. `provider_calendar_id`, `scheduled_via`) y definir columnas adicionales necesarias (capacidad, tipo de demo, canal); mantener compatibilidad con `TALIA_CALENDARIO_DEFAULT_PROVIDER=caldav`.
- [ ] Planear constraints e índices:
  - [ ] `EXCLUDE USING gist` en `public.citas` por `(provider_calendar_id, tstzrange(start_at, end_at))` para evitar traslapes.
  - [ ] Índices por `start_at`, `estado`, `scheduled_via`.
  - [ ] Validaciones de zona horaria (`timezone`) y duración estándar.
- [ ] Preparar migración SQL con creación de tablas, seeds de disponibilidad base y grants/RLS compatibles.

## Fase 3 · Funciones y lógica de negocio en base de datos
- [ ] Diseñar `public.fn_agenda_slots_disponibles(asesor_id, fecha_inicio, fecha_fin, duracion, timezone, max_slots)`:
  - [ ] Implementar generación de slots con `generate_series`.
  - [ ] Filtrar contra `agenda_disponibilidad`, `agenda_bloqueos` y `public.citas` activas.
  - [ ] Normalizar respuesta (ISO 8601, etiquetas de día, canal, capacidad).
- [ ] Actualizar/crear funciones para reservar:
  - [ ] `public.fn_cita_schedule` (envoltura de `fn_cita_upsert` con validación de choque de horarios, `scheduled_via = 'ia'` por defecto, metadatos de invitaciones).
  - [ ] `public.fn_cita_reschedule` y `public.fn_cita_cancel` revisadas para usar la nueva validación y limpiar `provider_event_id` cuando sea necesario.
- [ ] Crear vistas de soporte para el panel (ej. `public.v_agenda_slots` para auditoría).
- [ ] Escribir pruebas manuales SQL (scripts) que demuestren:
  - [ ] Que un slot ocupado no aparece como disponible.
  - [ ] Que se respetan las excepciones y bloqueos.
  - [ ] Que las nuevas funciones fallan con mensajes claros cuando el slot ya fue tomado.

## Fase 4 · Backend Supabase/Edge Functions
- [ ] Actualizar o crear RPC/REST:
  - [ ] Endpoint `list_demo_slots` → llama `fn_agenda_slots_disponibles`, parametriza rango por mes, traduce zonas horarias.
  - [ ] Endpoint `schedule_demo` → se ajusta para usar `fn_cita_schedule`, manejar errores de concurrencia y devolver `cita_id`, `start_at`, `end_at`, `timezone`, `meeting_url`.
- [ ] Reutilizar el servicio externo de agenda (CalDAV) ya configurado:
  - [ ] Confirmar conexión con `TALIA_CALENDARIO_*` (usuario `hola@talia.mx`, servidor `mail.talia.mx:2080`).
  - [ ] Implementar sincronización/bloqueo contra CalDAV en los nuevos endpoints (lectura y escritura).
  - [ ] Mantener actualizaciones bidireccionales si la agenda externa cambia (webhooks o polling).
- [ ] Revisar RLS para nuevas tablas y funciones (asegurar acceso solo a roles `service_role` y asistentes IA).
- [ ] Añadir logging/telemetría para identificar rechazos por doble booking.
- [ ] Documentar payloads y ejemplos en `docs/api` o colección Postman/Bruno.

## Fase 5 · Frontend Webchat (`talia.mx`)
- [ ] Diseñar UI de calendario mensual:
  - [ ] Consulta inicial por mes → agrupar slots por día.
  - [ ] Indicadores visuales de disponibilidad (colores, badges).
  - [ ] Vista detallada por día con horarios específicos.
- [ ] Implementar flujo:
  - [ ] Selección de día → petición a `list_demo_slots` filtrada.
  - [ ] Confirmación del slot → llamada a `schedule_demo`.
  - [ ] Manejo de conflictos (si la API rechaza el slot, refrescar y mostrar mensaje).
- [ ] Agregar loader y mensajes de estado (“consultando disponibilidad real”, “horario ya ocupado”).
- [ ] Ajustar pruebas end-to-end/UI (si existen) para cubrir el nuevo calendario.

## Fase 6 · Actualización de prompts y funciones OpenAI
- [ ] Modificar `docs/funciones_prompt_openai.md`:
  - [ ] Simplificar requisitos obligatorios en `list_demo_slots` (permitir defaults para `earliest_start_at`, `preferred_start_at`, `days`, `slot_minutes`).
  - [ ] Agregar documentación de campos de respuesta esperados (lista de días con slots).
- [ ] Actualizar `docs/prompt_landing.md`:
  - [ ] Explicar que el asistente mostrará un calendario y pedirá seleccionar día/hora concreta.
  - [ ] Añadir instrucciones para avisar al usuario cuando un slot se ocupe antes de confirmar.
  - [ ] Recordar que tras agendar debe confirmar detalles y enviar seguimiento.
- [ ] Probar la conversación completa en staging/sandbox con los nuevos endpoints para asegurar que la IA interpreta bien la disponibilidad.

## Fase 7 · Migración de datos y despliegue
- [ ] Ejecutar migraciones SQL en staging, validar que `fn_agenda_slots_disponibles` responde correctamente con datos de prueba.
- [ ] Importar disponibilidad inicial (horarios laborales, bloqueos recurrentes).
- [ ] Sincronizar citas heredadas:
  - [ ] Reasignar `provider_calendar_id` si se integra con calendarios externos.
  - [ ] Asegurar que todos los registros históricos tienen `scheduled_via` correcto.
- [ ] Rehabilitar progresivamente:
  - [ ] Actualizar backend (RPC).
  - [ ] Desplegar frontend con nueva UI.
  - [ ] Publicar nuevos prompts y funciones.
- [ ] Monitorizar logs y panel (`public.panel_agenda_calendario`) para confirmar que no se generan empalmes.

## Fase 8 · QA y validación final
- [ ] Casos de prueba manuales:
  - [ ] Reserva simple desde webchat con invitación de calendario.
  - [ ] Reprogramación con bloqueo previo.
  - [ ] Cancelación liberando el slot.
- [ ] Stress test: intentar agendar el mismo slot desde dos sesiones para verificar rechazo de la segunda.
- [ ] Validar métricas internas (tiempo de respuesta, tasa de conversión).
- [ ] Recolectar feedback del equipo comercial y ajustar disponibilidad si es necesario.

## Fase 9 · Documentación y seguimiento
- [ ] Actualizar wiki interna con diagrama de flujo completo y enlaces a nuevas funciones/migraciones.
- [ ] Registrar checklist de mantenimiento periódico (actualizar excepciones, revisar bloqueos).
- [ ] Definir KPIs para medir impacto (reducción de empalmes, incremento de citas confirmadas).
- [ ] Programar retrospectiva y próximos incrementos (sincronización bidireccional con calendarios externos, recordatorios automáticos, etc.).
