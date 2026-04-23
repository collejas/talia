# Plan de ejecucion: webhook unico Meta + routing por tenant

## Proposito

Convertir el piloto de Meta en una implementacion operativa real:

- un solo webhook para toda la app Meta;
- resolucion de tenant por `phone_number_id`;
- coexistencia con Twilio por tenant;
- sin webhook distinto por tenant.

## Contexto de partida

Ya esta validado que:

- un tenant Meta puede recibir mensajes;
- el backend puede responder por Meta;
- los secretos y la configuracion por tenant ya viven en BD;
- el piloto con callback por tenant funciono como prueba.

Lo que sigue ya es el diseno final, no la prueba.

## Fase 1. Unificar el punto de entrada Meta

### Objetivo

Reemplazar el callback por tenant por un callback unico global.

### Trabajo

- crear una sola ruta publica de webhook para Meta;
- recibir `GET` para verificacion y `POST` para mensajes;
- mantener la validacion de firma con `X-Hub-Signature-256`;
- mantener `verify_token` como secret de verificacion inicial.

### Archivos objetivo

- `backend/app/channels/whatsapp/router.py`
- `backend/app/channels/whatsapp/deps.py`
- `backend/app/channels/whatsapp/schemas.py`
- `backend/app/channels/whatsapp/service.py`

### Criterio de salida

- Meta ya no depende de una URL por tenant;
- el endpoint unico responde a verificaciones y eventos.

## Fase 2. Resolver tenant por `phone_number_id`

### Objetivo

Encontrar automaticamente a que tenant pertenece cada webhook entrante.

### Trabajo

- leer el `phone_number_id` del payload de Meta;
- buscar el tenant que tenga ese valor en `organizaciones.config.whatsapp.meta.phone_number_id`;
- cargar runtime y secretos de ese tenant;
- usar ese contexto para inbound, outbound y estados.

### Archivos objetivo

- `backend/app/services/tenant_runtime.py`
- `backend/app/channels/whatsapp/service.py`
- `backend/app/services/storage.py`
- `backend/app/repositories/crm.py`

### Criterio de salida

- un mismo webhook puede atender varios tenants Meta;
- cada evento se enruta al tenant correcto sin pasar por URL distinta.

## Fase 3. Ajustar la persistencia

### Objetivo

Registrar proveedor y mensajes de forma neutral.

### Trabajo

- conservar compatibilidad con campos historicos de Twilio;
- asegurar `provider = meta | twilio`;
- registrar `provider_message_id`;
- guardar errores y estados sin asumir Twilio.

### Archivos objetivo

- `backend/app/services/storage.py`
- `backend/app/repositories/crm.py`
- migraciones SQL relacionadas con mensajes y delivery

### Criterio de salida

- inbox y CRM muestran mensajes Meta y Twilio sin bifurcacion de codigo en UI;
- los estados quedan trazables por proveedor.

## Fase 4. Frontend de configuracion

### Objetivo

Dejar claro en el panel que el webhook de Meta es unico y que el tenant solo aporta configuracion.

### Trabajo

- mostrar el callback unico de Meta en la UI;
- dejar de presentar un webhook distinto por tenant como parte del flujo final;
- mantener campos de Meta por tenant:
  - `phone_number_id`
  - `page_access_token`
  - `verify_token`
  - `app_secret`
  - `graph_api_version`
- validar que `provider = meta` requiera `phone_number_id` y secretos.

### Archivos objetivo

- `frontend/panel/src/app/settings/tenants/[tenantId]/tenant-forms.tsx`
- `frontend/panel/src/app/settings/tenants/[tenantId]/actions.ts`
- `frontend/panel/src/app/settings/variables/page.tsx`
- `frontend/panel/src/app/settings/variables/actions.ts`

### Criterio de salida

- el admin entiende que el webhook es global;
- la UI solo administra datos por tenant.

## Fase 5. Pruebas

### Objetivo

Comprobar que el webhook unico funciona con al menos un tenant Meta y no rompe Twilio.

### Pruebas minimas

- inbound Meta para tenant A;
- inbound Meta para tenant B;
- outbound Meta por ambos tenants;
- estados read/sent/failed;
- Twilio sigue operativo en un tenant legado;
- mensajes repetidos no generan duplicados.

### Criterio de salida

- el webhook unico atiende multiples tenants;
- Twilio sigue funcionando donde corresponde;
- no hay regresiones en inbox ni CRM.

## Fase 6. Corte operativo

### Objetivo

Usar Meta como ruta final para tenants nuevos o migrados.

### Trabajo

- crear tenants nuevos con default `meta`;
- migrar tenants uno por uno;
- dejar Twilio solo como proveedor legado;
- documentar rollback por tenant.

### Criterio de salida

- la operacion normal ya no depende del webhook por tenant;
- la plataforma queda lista para crecer con Meta.

## Orden recomendado

1. Fase 1
2. Fase 2
3. Fase 3
4. Fase 4
5. Fase 5
6. Fase 6

## Riesgo principal

El riesgo mas grande es dejar un endpoint global sin resolver correctamente el `phone_number_id` del evento.

Por eso el orden correcto es:

1. unificar webhook;
2. resolver tenant;
3. probar con uno o mas tenants;
4. luego migrar.

