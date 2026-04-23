# Checklist final de implementacion

Este checklist convierte el diseno final en tareas ejecutables.

## Antes de empezar

- [ ] Confirmar que el piloto Meta ya quedo documentado.
- [ ] Confirmar que el webhook unico es el diseno final.
- [ ] Confirmar que Twilio se conserva como proveedor legado.
- [ ] Confirmar que no se va a seguir usando webhook por tenant para Meta.

## PR 1. Backend: resolver tenant por `phone_number_id`

### Objetivo

Hacer que el webhook unico de Meta pueda identificar a que tenant pertenece cada evento.

### Tareas

- [ ] Revisar `backend/app/channels/whatsapp/router.py`.
- [ ] Revisar `backend/app/channels/whatsapp/deps.py`.
- [ ] Revisar `backend/app/services/tenant_runtime.py`.
- [ ] Crear la logica de resolucion por `phone_number_id`.
- [ ] Asegurar que el payload de Meta se pueda leer sin depender de `tenant_id` en la URL.
- [ ] Mantener la validacion de firma con `app_secret`.
- [ ] Mantener `verify_token` para la verificacion inicial del webhook.

### Criterio de aceptacion

- [ ] Un webhook unico puede identificar el tenant correcto usando `phone_number_id`.
- [ ] No depende de una URL distinta por tenant.

## PR 2. Backend: adaptar el envio y los estados

### Objetivo

Hacer que el envio saliente y los estados trabajen con Meta y Twilio desde el mismo flujo de negocio.

### Tareas

- [ ] Revisar `backend/app/channels/whatsapp/service.py`.
- [ ] Separar la logica de envio por provider.
- [ ] Mantener Twilio intacto para tenants legados.
- [ ] Usar Meta para tenants con `whatsapp.provider = meta`.
- [ ] Revisar el manejo de `read` y otros estados.
- [ ] Registrar `provider_message_id` para Meta.
- [ ] Evitar retornar `meta_not_configured` cuando la config ya exista.

### Criterio de aceptacion

- [ ] Un tenant Meta puede enviar mensajes.
- [ ] Un tenant Twilio sigue enviando como antes.
- [ ] Los estados quedan trazados por provider.

## PR 3. Backend: persistencia neutral de mensajes

### Objetivo

Guardar trazabilidad de WhatsApp sin amarrarla a Twilio.

### Tareas

- [ ] Revisar `backend/app/services/storage.py`.
- [ ] Revisar `backend/app/repositories/crm.py`.
- [ ] Verificar que `provider`, `provider_message_id`, `provider_status` y `provider_error` se persistan.
- [ ] Revisar cualquier uso de `twilio_message_sid`.
- [ ] Mantener compatibilidad historica.

### Criterio de aceptacion

- [ ] Los mensajes Meta y Twilio se pueden consultar con el mismo flujo.
- [ ] No se rompe el inbox ni el CRM.

## PR 4. Base de datos / migracion

### Objetivo

Dejar la estructura lista para operar con varios providers.

### Tareas

- [ ] Revisar migraciones relacionadas con mensajes y delivery.
- [ ] Confirmar campos genericos para trazabilidad.
- [ ] Confirmar que `whatsapp.meta.phone_number_id` exista por tenant.
- [ ] Confirmar que `provider = meta` requiera `phone_number_id` y secretos.
- [ ] Mantener `twilio_message_sid` mientras haya tenants Twilio.

### Criterio de aceptacion

- [ ] La base soporta coexistencia Twilio + Meta.
- [ ] No hace falta reventar datos historicos.

## PR 5. Frontend: configuracion de tenants

### Objetivo

Dejar el provider configurable desde la UI de tenants.

### Tareas

- [ ] Revisar `frontend/panel/src/app/settings/tenants/[tenantId]/tenant-forms.tsx`.
- [ ] Revisar `frontend/panel/src/app/settings/tenants/[tenantId]/actions.ts`.
- [ ] Mostrar selector de provider.
- [ ] Mostrar campos condicionales segun provider.
- [ ] Hacer que tenants nuevos puedan nacer con `meta`.
- [ ] Mantener tenants actuales con `twilio`.
- [ ] Mostrar el webhook unico de Meta como referencia.

### Criterio de aceptacion

- [ ] Un admin puede elegir Twilio o Meta desde la UI.
- [ ] El guardado persiste config y secretos en el lugar correcto.

## PR 6. Frontend: variables de tenant

### Objetivo

Sincronizar la pantalla de variables con el flujo final del provider.

### Tareas

- [ ] Revisar `frontend/panel/src/app/settings/variables/page.tsx`.
- [ ] Revisar `frontend/panel/src/app/settings/variables/actions.ts`.
- [ ] Confirmar que la validacion de WhatsApp Meta pide los campos correctos.
- [ ] Confirmar que el panel deja claro que el webhook final es unico.

### Criterio de aceptacion

- [ ] La validacion no marca faltantes falsos.
- [ ] La UI refleja la configuracion real del tenant.

## PR 7. Documentacion de operacion

### Objetivo

Dejar claro como operar el nuevo esquema sin depender de memoria.

### Tareas

- [ ] Confirmar que el piloto ya esta documentado.
- [ ] Confirmar que el webhook unico ya esta documentado.
- [ ] Confirmar que el plan de ejecucion ya esta documentado.
- [ ] Añadir notas operativas para alta de tenant Meta.
- [ ] Añadir notas operativas para corte gradual desde Twilio.

### Criterio de aceptacion

- [ ] Se puede explicar el proceso completo leyendo la carpeta `docs/Plan_metodos_whatsapp`.

## Orden recomendado

1. PR 1
2. PR 2
3. PR 3
4. PR 4
5. PR 5
6. PR 6
7. PR 7

## Definition of done

- [ ] Un webhook unico recibe eventos de Meta.
- [ ] El backend enruta por `phone_number_id`.
- [ ] Twilio sigue funcionando como legado.
- [ ] La UI permite administrar ambos metodos.
- [ ] Los tenants piloto y legado conviven sin romperse.

