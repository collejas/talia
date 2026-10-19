# Creación de plantillas WhatsApp Meta desde campañas de prospección

**Estado:** Implementación inicial realizada; pendiente de despliegue y prueba controlada con Meta

**Módulo:** `/prospeccion/campanas`

**Canal:** WhatsApp mediante Meta Cloud API

**Fecha:** 2026-10-19

## 1. Objetivo

Permitir que un tenant cree una plantilla de WhatsApp desde la vista de
campañas de prospección y que dicha plantilla se registre realmente en el WABA
de Meta perteneciente a ese tenant.

El flujo debe eliminar la necesidad de crear manualmente la plantilla en
WhatsApp Manager, sin exponer credenciales Meta al frontend y manteniendo la
trazabilidad local en Supabase.

## 2. Diagnóstico del estado actual

La aplicación ya cuenta con:

- Vista `/prospeccion/campanas`.
- Centro de plantillas en `/prospeccion/campanas/plantillas`.
- Editor para plantillas WhatsApp.
- Endpoints tenant-aware para listar, crear, actualizar y eliminar plantillas.
- Tabla `public.prospeccion_contacto_templates`.
- Columnas explícitas para `provider`, `usage_scope`, `template_name`,
  `language_code`, `meta_category` y `template_status`.
- Relación de plantillas con campañas, batches y envíos.
- Tabla `public.whatsapp_meta_connections` con `waba_id` y `phone_number_id`.

Antes de esta implementación, el endpoint:

```text
POST /crm/prospeccion/whatsapp/templates
```

guardaba la plantilla en Supabase, pero no ejecutaba la creación remota en Meta.
Ahora ejecuta la creación remota en el WABA conectado del tenant mediante:

```text
POST https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/message_templates
```

El estado `approved` ahora solo puede proceder del webhook de Meta o de una
sincronización manual; el frontend ya no puede marcarlo directamente.

## 3. Flujo funcional propuesto

```text
Tenant entra a /prospeccion/campanas
        |
        v
Selecciona una campaña WhatsApp
        |
        v
Abre Plantillas > Nueva plantilla
        |
        v
Captura nombre, idioma, categoría, contenido y variables
        |
        v
Backend valida tenant, campaña, conexión Meta y payload
        |
        v
Backend crea la plantilla en el WABA del tenant
        |
        v
Meta devuelve ID y estado inicial
        |
        v
Backend guarda la plantilla y la respuesta operativa en Supabase
        |
        v
La UI muestra pendiente, aprobada o rechazada
```

La creación en Meta es asíncrona desde el punto de vista de aprobación: Meta
puede aceptar el registro y dejar la plantilla pendiente de revisión.

## 4. Reglas de tenant y seguridad

El tenant debe resolverse exclusivamente desde la sesión autenticada y el
contexto de organización. El frontend no debe controlar ni enviar como fuente
de verdad:

- `organizacion_id`.
- `waba_id`.
- `phone_number_id`.
- Access tokens.
- App secrets.

El backend debe:

1. Resolver la organización autenticada.
2. Validar que `campana_id` pertenezca a esa organización.
3. Resolver el WABA desde `whatsapp_meta_connections`.
4. Resolver el token Meta seguro del tenant.
5. Rechazar la operación si la conexión no está `conectado`.
6. No registrar tokens ni payloads sensibles completos en logs.
7. Traducir los errores de Meta a códigos seguros para la UI.

## 5. Contrato local de plantilla

La fuente de verdad operativa local seguirá siendo:

```text
public.prospeccion_contacto_templates
```

Filtrada por:

```text
organizacion_id = tenant autenticado
canal = whatsapp
provider = meta
usage_scope = whats_prosp
```

Campos principales:

| Campo | Uso |
|---|---|
| `nombre` | Nombre visible en GEOACTIV |
| `slug` | Identificador local tenant-scoped |
| `template_name` | Nombre técnico oficial de Meta |
| `language_code` | Idioma oficial, por ejemplo `es_MX` |
| `meta_category` | `marketing`, `utility` o `authentication` |
| `template_status` | Estado local sincronizado con Meta |
| `campana_id` | Campaña WhatsApp propietaria |
| `cuerpo_texto` | Contenido fuente de la plantilla |
| `activo` | Disponibilidad para campañas |

## 6. Columnas recomendadas para sincronización Meta

Se recomienda agregar columnas explícitas, en lugar de guardar estos datos en
`metadata`:

```text
meta_template_id
meta_status
meta_rejected_reason
meta_created_at
meta_synced_at
meta_last_error_code
```

La función de cada estado sería:

| Estado | Significado |
|---|---|
| `draft` | Solo existe como borrador local |
| `pending` | Meta aceptó el registro y está revisándolo |
| `approved` | Meta confirmó aprobación |
| `rejected` | Meta rechazó la plantilla |
| `archived` | Ya no debe usarse |

La plantilla solo debe poder utilizarse en envíos cuando esté `approved`, activa
y asociada al tenant correcto.

## 7. Integración Meta

El backend debe crear un cliente separado, por ejemplo:

```text
backend/app/services/meta_whatsapp_templates.py
```

Responsabilidades:

- Construir el payload de Meta.
- Ejecutar `POST /{waba_id}/message_templates`.
- Consultar plantillas y estados.
- Eliminar o archivar cuando aplique.
- Normalizar errores y códigos de Meta.
- Aplicar timeout y manejo de rate limits.

El endpoint de aplicación debe conservar responsabilidad de:

- Autenticación.
- Permisos.
- Validación de campaña.
- Validación de tenant.
- Persistencia local.

No se debe mezclar toda la lógica de Meta dentro de `crm.py`.

## 8. Endpoints propuestos

### Crear en Meta y guardar localmente

```text
POST /crm/prospeccion/whatsapp/templates
```

El endpoint debe:

1. Validar el payload.
2. Validar la campaña.
3. Validar la conexión Meta.
4. Crear la plantilla en Meta.
5. Persistir el ID y estado devuelto.
6. Devolver una respuesta segura al frontend.

### Sincronizar estado

```text
POST /crm/prospeccion/whatsapp/templates/{template_id}/sync
```

Debe consultar Meta y actualizar el estado local.

### Listar

```text
GET /crm/prospeccion/whatsapp/templates
```

Debe poder filtrar por:

- Estado.
- Categoría.
- Campaña.
- Activo.
- Texto de búsqueda.

### Archivar localmente y en Meta

```text
POST /crm/prospeccion/whatsapp/templates/{template_id}/archive
```

La eliminación física debe evitarse si la plantilla ya fue utilizada en
envíos, métricas o auditoría.

## 9. Payload Meta inicial

Para una plantilla básica de texto, el cliente deberá construir una estructura
equivalente a:

```json
{
  "name": "prospeccion_demo_v1",
  "language": "es_MX",
  "category": "MARKETING",
  "components": [
    {
      "type": "BODY",
      "text": "Hola {{1}}, tenemos información para ti."
    }
  ]
}
```

El payload real debe validarse contra la versión vigente de Meta y contemplar
headers, footers, botones, imágenes y variables cuando se habiliten en el
editor.

## 10. Corrección del readiness

El endpoint actual:

```text
GET /crm/prospeccion/whatsapp/readiness
```

todavía revisa credenciales y plantillas de Twilio. Debe migrarse a checks
Meta:

- WABA configurado.
- `phone_number_id` configurado.
- Token Meta disponible.
- Conexión tenant en estado `conectado`.
- Permiso para administrar plantillas.
- Plantilla aprobada disponible para enviar.
- Prompt de prospección configurado cuando aplique.

## 11. UI propuesta

La vista debe distinguir claramente:

- Borrador local.
- Enviada a Meta.
- Pendiente de aprobación.
- Aprobada.
- Rechazada con motivo.
- Archivada.

Después de guardar, la UI debe mostrar el resultado de Meta y no únicamente
“plantilla guardada”. En caso de rechazo debe mostrar un mensaje funcional sin
exponer la respuesta técnica completa.

La acción principal será **Crear plantilla en WhatsApp**. El botón debe quedar
bloqueado mientras se procesa la solicitud para evitar duplicados.

## 12. Idempotencia y duplicados

La unicidad local debe conservarse por:

```text
organizacion_id + canal + usage_scope + template_name + language_code
```

Además, el backend debe manejar:

- Doble clic del usuario.
- Reintentos por timeout.
- Respuesta de Meta recibida después de un error de red.
- Plantillas ya existentes en Meta.
- Conflicto entre slug local y nombre técnico Meta.

No debe asumirse que un error `409` siempre es un conflicto de slug; debe
identificarse si corresponde al índice local o al nombre/idioma de Meta.

## 13. Fases de implementación

### Fase 1: Integración básica — realizada

- Cliente Meta aislado en `backend/app/services/meta_whatsapp_templates.py`.
- Creación de plantilla de texto con componente `BODY`.
- Persistencia de `meta_template_id`, `meta_status` y errores normalizados.
- UI con estado pendiente y acción de sincronización manual.
- `readiness` todavía requiere migrarse de Twilio a Meta; queda pendiente.

### Fase 2: Sincronización — realizada en modalidad webhook/manual

- Webhook `message_template_status_update` procesado por la cola durable existente.
- Consulta manual desde `POST .../{template_id}/sync`.
- Persistencia del motivo de rechazo y del último código de error.
- La resolución del tenant usa el `WABA ID` conectado, no datos del frontend.

La implementación actual no ejecuta creación real en Meta durante las pruebas
automáticas. La validación de proveedor queda para una prueba controlada con
un tenant de staging.

### Fase 3: Componentes avanzados — pendiente

- Header de imagen.
- Footer.
- Botones.
- Variables estructuradas.
- Validación previa compatible con Meta.

### Fase 4: Operación y auditoría — pendiente parcial

- Historial de cambios.
- Registro de solicitudes y respuestas sanitizadas.
- Reintentos controlados.
- Métricas de aprobación y rechazo.
- Archivado protegido por historial de envíos.

Mientras no exista el endpoint explícito de archivado remoto, una plantilla que
ya tiene `meta_template_id` no se puede editar en sus campos remotos ni borrar
localmente. Esto evita que GEOACTIV quede desincronizado con Meta.

## 14. Criterios de aceptación

La funcionalidad se considerará terminada cuando:

1. Un usuario autorizado pueda crear una plantilla desde la vista de campañas.
2. La plantilla se cree en el WABA correcto del tenant.
3. El frontend nunca reciba tokens Meta.
4. La plantilla quede persistida con su ID y estado real de Meta.
5. Una plantilla pendiente no pueda utilizarse para envíos.
6. Una plantilla aprobada sí pueda seleccionarse en una campaña.
7. Un tenant no pueda consultar o modificar plantillas de otro tenant.
8. Los errores de Meta sean claros y seguros.
9. Los batches y envíos conserven snapshots históricos.
10. Se pruebe un flujo real con un tenant de staging y una plantilla de prueba.

## 15. Referencias internas

- `docs/META/Plantillas.md`
- `docs/Plan_envios_whats_marketing/02_DISENO_SQL_WHATS_PROSP_META_BD.md`
- `docs/Plan_envios_whats_marketing/04_BACKEND_CONTRACTS.md`
- `docs/Prospeccion/frontend_vistas.md`
- `docs/Prospeccion/backend_endpoints.md`
- `supabase/migrations/20261019_120000_whatsapp_meta_template_sync.sql`
- `backend/app/api/routes/crm.py`
- `backend/app/repositories/crm.py`
- `frontend/panel/src/app/prospeccion/campanas/plantillas`

## 16. Automatización del estado de aprobación en Meta

### 16.1 Objetivo

Actualizar automáticamente el estado local de una plantilla cuando Meta la
apruebe, rechace, pause, deshabilite o archive, sin consultar periódicamente a
Meta por cada plantilla.

La fuente principal debe ser el webhook de Meta:

```text
message_template_status_update
```

Meta utiliza este evento para notificar cambios en el ciclo de vida de una
plantilla. El sistema no debe depender de polling continuo para conocer si una
plantilla cambió.

### 16.2 Flujo orientado a eventos

```text
Crear plantilla en Meta
        |
        v
Guardar estado local: pending
        |
        v
Meta revisa la plantilla
        |
        v
Meta envía message_template_status_update
        |
        v
Webhook responde rápidamente y encola el evento
        |
        v
Worker procesa el evento una sola vez
        |
        v
Actualizar únicamente la plantilla afectada
        |
        v
La UI muestra el nuevo estado
```

El webhook debe responder `200` rápidamente. La actualización de Supabase y
la lógica adicional deben ejecutarse en un worker para evitar timeouts y
reintentos innecesarios de Meta.

### 16.3 Reutilización de infraestructura existente

La aplicación ya cuenta con piezas reutilizables:

- `backend/app/channels/whatsapp/router.py` para recibir el webhook.
- `backend/app/channels/whatsapp/schemas.py` para interpretar eventos Meta.
- `public.whatsapp_webhook_jobs` como cola durable.
- `backend/app/workers/whatsapp_worker.py` para procesar eventos.

La primera implementación debe extender esta infraestructura para reconocer
eventos de estado de plantillas. No se debe crear un proceso permanente que
consulte Meta en intervalos cortos.

### 16.4 Identificación segura de la plantilla

El worker debe localizar la plantilla usando esta prioridad:

1. `meta_template_id`, si Meta lo proporciona.
2. `WABA ID` del evento.
3. `template_name + language_code`.
4. Validación final contra `organizacion_id`.

Nunca se debe buscar únicamente por `template_name`, porque distintos tenants
pueden utilizar el mismo nombre técnico.

La organización debe resolverse por la conexión registrada en:

```text
public.whatsapp_meta_connections
```

El evento recibido no debe permitir que el cliente seleccione manualmente el
tenant que se actualizará.

### 16.5 Estados locales

El catálogo de estados debe contemplar el ciclo real de Meta:

```text
draft
pending
approved
rejected
paused
disabled
archived
```

Reglas operativas:

- `draft`: no se envía a Meta o todavía no está lista para revisión.
- `pending`: Meta recibió la solicitud y está revisándola.
- `approved`: puede utilizarse en campañas.
- `rejected`: no puede utilizarse y debe mostrar el motivo.
- `paused`: no debe utilizarse temporalmente.
- `disabled`: debe bloquearse permanentemente hasta una acción correctiva.
- `archived`: queda fuera de la operación, preservando el historial.

Solo una plantilla `approved`, activa y perteneciente al tenant correcto debe
ser elegible para envíos.

### 16.6 Idempotencia del webhook

El mismo evento puede llegar más de una vez. El procesamiento debe ser
idempotente. La implementación reutiliza la cola durable y el worker existentes;
antes de ampliar el esquema de deduplicación de eventos se debe verificar el
identificador disponible en cada payload de Meta. El diseño objetivo contempla:

- Identificador único del evento Meta cuando esté disponible.
- Hash estable del payload sanitizado cuando no exista un ID suficiente.
- Restricción única para impedir duplicados en la cola.
- Estados de job como `queued`, `processing`, `completed` y `failed`.
- Reintentos con lease y límite de intentos.

Si el evento ya fue procesado, el worker debe marcarlo como completado sin
volver a modificar la plantilla ni generar efectos secundarios.

### 16.7 Columnas de sincronización recomendadas

Los datos estructurales deben quedar en columnas explícitas de
`prospeccion_contacto_templates`:

```text
meta_template_id
meta_status
meta_rejected_reason
meta_created_at
meta_synced_at
meta_last_error_code
```

`metadata` puede conservar información técnica variable del evento, pero no
debe ser la fuente de verdad del estado, del ID Meta ni del motivo de rechazo.

### 16.8 Fallback con backoff

El webhook será la fuente principal. El polling se utilizará únicamente como
respaldo controlado:

1. Después de crear una plantilla, guardar `pending`.
2. Programar una reconciliación única después de 15 o 30 minutos.
3. Si continúa pendiente, reintentar después de 1 hora.
4. Permitir un último reintento después de 6 o 24 horas.
5. Detener los reintentos automáticos y mostrar una acción manual.

La reconciliación nocturna, si se habilita, debe procesar únicamente plantillas
`pending` antiguas, agrupar por tenant/WABA y limitar el número de WABA por
ciclo. No debe ejecutar una consulta por cada plantilla.

También debe existir una acción manual:

```text
POST /crm/prospeccion/whatsapp/templates/{template_id}/sync
```

Esta acción debe respetar permisos, tenant, rate limits e idempotencia.

### 16.9 Requisitos de configuración en Meta

La aplicación debe tener suscrito el campo:

```text
message_template_status_update
```

en el webhook de WhatsApp Business Account correspondiente. La configuración
debe verificarse por WABA y no asumirse únicamente porque el webhook de
`messages` ya esté funcionando.

### 16.10 Impacto esperado

Con este diseño:

- La creación produce una llamada a Meta.
- Cada cambio real produce un webhook.
- El worker actualiza una sola plantilla.
- No se recorren continuamente todas las plantillas.
- Supabase solo recibe lecturas y escrituras asociadas a eventos o fallbacks
  limitados.
- La carga de CPU, memoria y base de datos queda acotada y observable.

### 16.11 Criterios de aceptación adicionales

La automatización se considerará terminada cuando:

1. Meta envíe un webhook al aprobar una plantilla.
2. La plantilla cambie automáticamente a `approved`.
3. Un rechazo conserve el motivo sanitizado.
4. Un evento duplicado no produzca dos actualizaciones.
5. El webhook responda sin esperar una consulta lenta a Supabase.
6. Una plantilla `pending`, `paused` o `disabled` no pueda utilizarse para
   nuevos envíos.
7. El fallback no consulte Meta de forma constante.
8. Exista una sincronización manual para recuperación operativa.

### 16.12 Referencias externas

- [Meta WhatsApp Business Platform: webhook payload reference](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference)

