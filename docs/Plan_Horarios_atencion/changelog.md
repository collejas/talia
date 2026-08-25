# Changelog — Plan de horarios de atención WhatsApp

Este archivo registra los avances, decisiones y pendientes del plan documentado en [`PLAN_HORARIOS_ATENCION_WHATSAPP.md`](./PLAN_HORARIOS_ATENCION_WHATSAPP.md).

## Estado actual

**Fase:** análisis y diseño

**Implementación:** no iniciada

**Última actualización:** 2026-08-25

## 2026-08-25 — Análisis inicial y propuesta técnica

### Completado

- Revisado el flujo de entrada de WhatsApp por Twilio.
- Revisado el flujo de entrada de WhatsApp por Meta Cloud API.
- Confirmado que ambos proveedores terminan en el procesador común `handle_incoming_message`.
- Revisada la resolución de tenant por número de teléfono y `phone_number_id`.
- Revisado el registro de mensajes, conversaciones y personas.
- Revisada la asignación automática de vendedor antes de notificar el Inbox.
- Revisada la auditoría de asignaciones de vendedores.
- Revisadas las notificaciones persistentes del Inbox.
- Revisados los eventos realtime del Inbox.
- Revisado el stream SSE de notificaciones por usuario.
- Revisado el comportamiento de `manual_override`.
- Revisada la selección separada del asistente normal y del asistente de prospección.
- Revisados los prompts, versiones, Assistant ID y configuración tenant-aware.
- Revisadas las funciones disponibles del asistente.
- Revisados los reenganches, seguimientos, escalamiento y cierre de oportunidades.
- Revisada la configuración existente en `settings/variables`.
- Documentada la necesidad de aplicar el horario también a jobs automáticos que envíen mensajes.
- Documentada la prioridad de asignar y notificar antes de decidir si se ejecuta la IA.
- Propuesta una configuración semanal por tenant.
- Propuesta el uso de la zona horaria del tenant.
- Propuesta mantener la funcionalidad desactivada por defecto para tenants existentes.
- Propuesto modelar el horario en una tabla explícita y tenant-scoped.
- Propuestos contratos de runtime, API, UI y pruebas.

### Decisiones documentadas

- Dentro del horario humano no se debe ejecutar OpenAI ni enviar una respuesta automática.
- Fuera del horario humano debe ejecutarse la IA, salvo que la conversación esté en `manual_override`.
- La asignación del vendedor y la notificación del frontend deben suceder en ambos casos.
- La regla debe aplicar a WhatsApp normal y prospección.
- `manual_override` tiene prioridad sobre el horario.
- La validación debe ejecutarse en backend y no depender de un flag del frontend.
- La configuración debe utilizar una zona horaria IANA del tenant.
- Los horarios que cruzan medianoche deben ser soportados explícitamente.
- Las notificaciones actuales del Inbox y SSE deben reutilizarse.
- No se deben exponer secretos ni payloads sensibles en la configuración o logs.

### Evidencia revisada

- `backend/app/channels/whatsapp/router.py`
- `backend/app/channels/whatsapp/deps.py`
- `backend/app/channels/whatsapp/routing.py`
- `backend/app/channels/whatsapp/service.py`
- `backend/app/channels/whatsapp/tools.py`
- `backend/app/assistants/manager.py`
- `backend/app/assistants/runtime.py`
- `backend/app/services/tenant_runtime.py`
- `backend/app/services/storage.py`
- `backend/app/services/user_notifications.py`
- `backend/app/services/sales_notification_jobs.py`
- `backend/app/api/routes/crm.py`
- `frontend/panel/src/app/settings/variables/page.tsx`
- `frontend/panel/src/app/settings/variables/actions.ts`
- `frontend/panel/src/app/settings/variables/components/tenant-variables-sections-panel.tsx`
- `frontend/panel/src/components/notifications/global-notifications-provider.tsx`
- `frontend/panel/src/components/inbox/split-view.tsx`
- Migraciones locales relacionadas con asignaciones, notificaciones y jobs.

### Validaciones realizadas

- Se confirmó que el documento principal quedó guardado en la carpeta del plan.
- Se ejecutó `git diff --check` sobre el documento principal.
- No se modificó código de aplicación.
- No se aplicaron migraciones.
- No se modificaron datos de tenants.

### Limitaciones

- La consulta MCP de Supabase no pudo devolver el esquema remoto debido a un fallo de renovación OAuth.
- El estado de producción y las migraciones realmente aplicadas deben confirmarse antes de implementar.
- Todavía no existe la tabla, API, runtime ni UI del horario.
- Todavía no existen pruebas específicas para horarios, medianoche o zonas horarias.

## Pendientes para la siguiente fase

- Confirmar esquema y migraciones remotas de Supabase.
- Confirmar permisos aplicables para editar configuración tenant.
- Confirmar todos los jobs que pueden enviar WhatsApp automáticamente.
- Definir nombre final de la tabla y columnas.
- Diseñar y aplicar migración.
- Crear runtime tenant-aware con caché e invalidación.
- Crear evaluador de ventanas horarias.
- Integrar el gate en el flujo entrante de WhatsApp.
- Integrar la regla en reenganches y seguimientos automáticos.
- Crear endpoint y schemas de configuración.
- Crear la UI dentro de `settings/variables`.
- Agregar pruebas unitarias, integración y tenant isolation.
- Desplegar y validar un tenant real en horario humano y fuera de horario.

