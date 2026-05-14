# Checklist de tareas: Metodos WhatsApp

## Base de datos

- [ ] Definir el esquema canonico de configuracion por tenant para WhatsApp.
- [ ] Agregar `provider` en la configuracion del tenant.
- [ ] Crear seccion `whatsapp.twilio` y `whatsapp.meta` en la configuracion del tenant.
- [ ] Definir como se almacenan secretos: referencias a secrets o valores en JSON no secreto.
- [ ] Agregar campos genericos para trazabilidad de mensajes:
  - [ ] `provider`
  - [ ] `provider_message_id`
  - [ ] `provider_status`
  - [ ] `provider_error`
- [ ] Revisar tablas y funciones que hoy dependan de `twilio_message_sid`.
- [ ] Preparar migraciones de compatibilidad o views de apoyo si hace falta.
- [ ] Validar indices y constraints para no romper consultas del inbox.

## Backend

- [ ] Crear resolvedor de provider por tenant.
- [ ] Separar el flujo de WhatsApp en adapters por proveedor.
- [ ] Mantener Twilio funcionando para tenants existentes.
- [ ] Implementar adapter de Meta Cloud API para:
  - [ ] webhook entrante
  - [ ] envio saliente
  - [ ] estados de mensajes
  - [ ] validacion de firma
- [ ] Ajustar router de WhatsApp para despachar por provider.
- [ ] Ajustar `tenant_runtime` para leer configuracion Twilio y Meta.
- [ ] Revisar `storage.register_whatsapp_message` para guardar provider.
- [ ] Revisar `record_delivery_event` para no depender solo de Twilio.
- [ ] Revisar deduplicacion de mensajes entrantes.
- [ ] Revisar logica de indicadores de leido/escribiendo.
- [ ] Agregar logs estructurados con provider y tenant.
- [ ] Agregar tests unitarios para ambos providers.

## Frontend

- [ ] Abrir la vista `settings/tenants`.
- [ ] Agregar selector de metodo de WhatsApp.
- [ ] Mostrar campos de configuracion segun provider.
- [ ] Mostrar estado actual de la integracion.
- [ ] Permitir crear tenant nuevo con default `meta`.
- [ ] Mantener tenants existentes con default `twilio`.
- [ ] Validar campos requeridos antes de guardar.
- [ ] Mostrar ayuda breve sobre coexistencia y corte gradual.

## QA funcional

- [ ] Probar tenant existente con Twilio sin cambios.
- [ ] Probar tenant nuevo con Meta en paralelo.
- [ ] Probar recepcion de mensajes en ambos providers.
- [ ] Probar envio saliente en ambos providers.
- [ ] Probar estados delivered/read/failed.
- [ ] Probar adjuntos y mensajes de texto.
- [ ] Probar deduplicacion de mensajes repetidos.
- [ ] Probar reinicio de conversacion y persistencia en CRM.
- [ ] Probar el inbox y la vista de conversaciones.

## Operacion y despliegue

- [ ] Definir variables y secretos por ambiente.
- [ ] Documentar pasos de alta de tenant con Twilio.
- [ ] Documentar pasos de alta de tenant con Meta.
- [ ] Documentar el flujo de adjuntos WhatsApp:
  - bucket privado `whatsapp`
  - proxy interno del inbox en `/api/crm/inbox/attachments/{id}`
  - firma temporal desde backend con service role
- [ ] Definir tenant piloto para pruebas.
- [ ] Establecer criterio para mover un tenant de Twilio a Meta.
- [ ] Definir criterio para suspender Twilio por configuracion.
- [ ] Preparar rollback por tenant.

## Cierre

- [ ] Confirmar que Twilio queda suspendido, no eliminado, para tenants migrados.
- [ ] Confirmar que los tenants no migrados siguen operando igual.
- [ ] Actualizar la documentacion operativa final.
