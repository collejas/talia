# Hoja de ruta · Integración de agenda y calendario de citas demo

## Objetivo general

Lograr que Tal-IA pueda **agendar, actualizar y cancelar citas de demostración** de forma automática, sincronizando la información entre la base de datos (`citas`), el calendario externo (Google Calendar u otro proveedor) y las interfaces internas (paneles, frontend, flujos conversacionales).

## Estado actual resumido

- Actualmente la tabla se llama `public.lead_citas_demo`; debe renombrarse a `public.citas` para estandarizar la nomenclatura.
- El disparador `tg_lead_citas_demo_sync_stage` mueve la tarjeta del pipeline a la etapa `demo`; debe renombrarse a `tg_citas_sync_stage` tras el cambio de tabla.
- Las vistas `panel_agenda_demos` y `panel_agenda_calendario` consumen la tabla actual y deberán actualizarse al nuevo nombre.
- El prompt de Tal-IA solo captura datos de lead y lo cierra; aún no existe herramienta para crear o gestionar citas.

## Fase 0 · Descubrimiento y diseño funcional

1. Documentar casos de uso: agendar desde Tal-IA, reprogramar manualmente, cancelar, crear cita desde el panel interno, sincronizar cambios provenientes del proveedor externo.
2. Definir reglas de negocio: duración estándar, buffers, políticas de reprogramación/cancelación, validaciones de disponibilidad, calendario predeterminado por equipo o usuario.
3. Mapear requerimientos de cumplimiento (consentimiento para invitaciones, localización de datos, manejo de zonas horarias).
4. Identificar actores y permisos (agentes, vendedores, administradores) y cómo interactúan con la agenda.

## Fase 1 · Arquitectura técnica y decisiones clave

1. Elegir proveedor de calendario inicial (Google Workspace), alcance de OAuth y forma de almacenar tokens (Supabase Vault / extensiones seguras).
2. Definir si la sincronización será **API-first** (backend orquesta todo) o **Supabase functions** (RPC directa).
3. Diseñar modelo de colas/webhooks para escuchar actualizaciones externas (ej. Google push notifications) y reflejarlas en `citas`.
4. Acordar formato estándar para `metadata` (payload del evento, IDs de asistentes, referencias de zoom/meet) para soportar múltiples proveedores en el futuro.

## Fase 2 · Supabase y capa de datos

0. ✅ (completado) Renombrar `public.lead_citas_demo` → `public.citas`, el enum `cita_demo_estado` → `cita_estado`, los triggers, índices y claves foráneas asociadas (por ejemplo `lead_citas_demo_active_unique` → `citas_active_unique`), y actualizar las vistas dependientes.
1. ✅ (completado) Función RPC `fn_cita_upsert` con validaciones de permisos (`public.puede_ver_lead`), manejo de estado y retorno del registro completo.
   - Define duración estándar (45 min) cuando no se envía `end_at`, normaliza provider/timezone, soporta merge opcional de metadatos y control de concurrencia con `expected_updated_at`.
2. ✅ (completado) Función `fn_cita_cancel` que marca `estado = 'cancelada'`, permite limpiar `provider_event_id` y actualiza `updated_by`.
3. Añadir columnas requeridas (si aplica): `reminder_sent_at`, `external_join_url`, indicadores de origen (IA vs humano) dentro de `metadata`.
4. Revisar políticas RLS para permitir a integraciones de servicio (por ejemplo, `service_role`) modificar citas tras recibir webhooks externos.
5. Extender índices si se necesitarán consultas adicionales (ej. `provider_event_id`, `created_by`, `estado`).

## Fase 3 · Backend (FastAPI / servicios internos)

1. Implementar en `backend/app/services` un servicio `CalendarioService` que encapsule llamadas a Supabase y al proveedor externo.
2. Exponer endpoints REST/gRPC según necesidad:
   - `POST /leads/{tarjeta_id}/citas` para crear.
   - `PATCH /leads/{tarjeta_id}/citas/{cita_id}` para reprogramar o confirmar.
   - `DELETE /leads/{tarjeta_id}/citas/{cita_id}` para cancelar.
3. Manejar conversión de zonas horarias y normalizar a `timestamptz`.
4. Integrar logs estructurados y métricas (tiempo de respuesta, errores de API externa).
5. Añadir pruebas unitarias y contract tests que simulen respuestas de Calendario (usar mocks).

## Fase 4 · Integración con proveedores de calendario

1. Configurar proyecto en Google Cloud (OAuth consent, scopes `Calendar.events`, `Calendar.readonly`, `Calendar.settings.readonly`).
2. Guardar credenciales en infraestructura segura (`supabase/config vars`, Vault, o secretos del backend).
3. Implementar flujo OAuth por usuario/calendario:
   - Endpoint para iniciar autenticación.
   - Callback que almacena `access_token`, `refresh_token`, `expiry`.
4. Desarrollar capa de sincronización:
   - Crear eventos: `provider_event_id`, `hangoutLink`, asistentes.
   - Actualizar y cancelar eventos.
   - Manejar reintentos y backoff ante rate limits.
5. Configurar notificaciones push o tareas programadas para reconciliación (`sync_events` que compara eventos externos con `citas`).
6. Registrar tiempo de respuesta y errores para monitorear SLA con Google.

## Fase 5 · Aplicación conversacional (Tal-IA)

1. Diseñar nueva herramienta `schedule_demo` (y opcionalmente `reschedule_demo`, `cancel_demo`) en `docs/funciones_prompt_openai.md`.
2. Actualizar prompt `docs/prompt_landing.md` incorporando:
   - Detección de interés en demo.
   - Preguntas para disponibilidad (fecha/hora preferida, zona horaria).
   - Confirmación de cita y comunicación del resultado (incluyendo URL del meeting).
3. Implementar lógica en el orquestador que traduzca la function call a invocaciones del backend:
   - Solicitar disponibilidad.
   - Validar conflictos con `citas_active_unique`.
4. Manejar mensajes de reintento/reprogramación cuando proveedor rechaza la creación.
5. Ajustar guardrails para limitar promesas no confirmadas (“te agendo” solo tras respuesta exitosa).

## Fase 6 · Frontend y paneles internos

1. Revisar `frontend/` para agregar vistas:
   - Calendario diario/semanal usando datos de `panel_agenda_calendario`.
   - Formulario para crear o editar citas, conectando al backend.
2. Permitir búsqueda por contacto, estado, vendedor asignado.
3. Mostrar `cancel_reason`, URL de la reunión y notas internas.
4. Incluir alertas visuales para citas sin `provider_event_id` (pendientes de sincronizar).
5. Añadir acciones rápidas (confirmar asistencia, marcar como realizada) que actualicen la columna `estado`.

## Fase 7 · Notificaciones y automatización

1. Configurar envío de correos/WhatsApp automáticos con recordatorios, usando plantillas que consuman datos de `citas`.
2. Implementar worker (Celery/Temporal/cron Supabase) que revise citas próximas y dispare recordatorios según `start_at`, marcando `metadata.reminder_status`.
3. Integrar confirmaciones de clientes: link de “Confirmar/Cancelar” que pegue a endpoints públicos y actualice la cita.
4. Registrar todas las acciones en `eventos_auditoria` para trazabilidad.

## Fase 8 · QA y pruebas integral

1. Generar escenarios de prueba end-to-end: creación por IA, reprogramación manual, cancelación externa.
2. Mockear API de Google para pruebas determinísticas y usar sandbox para pruebas reales.
3. Validar políticas RLS mediante roles de Supabase (admin, vendedor, invitado).
4. Asegurar consistencia de zonas horarias (mostrar en local, guardar en UTC).
5. Preparar checklist de regresión para pipeline Kanban (verificar actualización de etapa `demo`).

## Fase 9 · Preparación para producción

1. Escribir runbooks: cómo regenerar tokens, manejar errores de sincronización, checklist de despliegue.
2. Configurar monitoreo y alertas (Grafana/Prometheus, logs en Supabase/Stackdriver).
3. Planificar despliegue gradual (feature flag en prompt y frontend).
4. Capacitar al equipo comercial sobre uso del panel y flujo de Tal-IA.

## Fase 10 · Iteraciones posteriores

1. Integrar analítica: tendencias de asistencia, tiempo entre lead y demo, tasa de cancelación.
2. Explorar sincronización bidireccional con otros proveedores (Microsoft 365, Calendly).
3. Automatizar asignación de vendedor según disponibilidad (round robin + calendarios personales).
4. Agregar feedback post-demo (encuesta automática) para cerrar el loop comercial.
