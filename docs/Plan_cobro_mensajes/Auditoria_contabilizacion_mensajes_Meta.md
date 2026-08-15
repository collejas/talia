# Auditoría de contabilización de mensajes y cobro por tenant

**Fecha:** 2026-08-13  
**Alcance:** base de datos productiva, backend FastAPI y flujo WhatsApp/Meta.  
**Estado:** diagnóstico documentado; no se modificó código ni base de datos.

## 1. Conclusión ejecutiva

El sistema sí registra buena parte de las interacciones individuales y de sus conversaciones, pero todavía no existe una medición suficientemente confiable para cobrar a los tenants.

La base actual puede utilizarse como fuente de reconciliación, pero antes de facturar se necesita un ledger de consumo separado que distinga claramente:

- intento de envío;
- aceptación del mensaje por el proveedor;
- entrega, lectura o fallo;
- mensaje facturable;
- categoría tarifaria de Meta;
- periodo de facturación;
- precio y moneda aplicados.

Actualmente la categoría de Meta se conserva dentro del JSON original del webhook, pero no se normaliza como información de negocio consultable.

## 2. Flujo actual identificado

El flujo principal de WhatsApp es:

```text
Webhook o envío interno
        |
        v
registrar_mensaje_whatsapp(...)
        |
        +--> identidades_canal
        +--> conversaciones
        +--> mensajes
        +--> webhooks_entrantes
        |
        v
Meta/Twilio status callback
        |
        v
eventos_entrega
```

El registro de cada interacción utiliza `mensajes` como unidad individual y `conversaciones` como agrupador de ida y vuelta.

Las entregas se registran aparte en `eventos_entrega`. Por ello, los eventos de `enviado`, `entregado`, `leído` y `fallido` no deben contarse como mensajes adicionales.

## 3. Evidencia observada en la base

La revisión productiva encontró:

| Métrica | Resultado |
|---|---:|
| Mensajes totales | 2,600 |
| Mensajes entrantes | 1,213 |
| Mensajes salientes | 1,387 |
| Conversaciones | 402 |
| Eventos de entrega | 3,243 |
| Mensajes salientes sin evento de entrega | 129 |
| Mensajes salientes sin ID del proveedor | 83 |
| Eventos Meta que contienen `pricing` | 1,239 |
| Mensajes distintos Meta con pricing | 486 |
| Categoría observada `service` | 394 |
| Categoría observada `referral_conversion` | 192 |
| Categoría `marketing` observada | 0 |
| Categoría `utility` observada | 0 |
| Categoría `authentication` observada | 0 |
| Mensajes con `billable=true` observado | 0 |

Las categorías observadas corresponden al tráfico existente durante la revisión. La ausencia de `marketing`, `utility` y `authentication` no demuestra que el sistema pueda medirlas; demuestra que no aparecieron en la muestra analizada.

## 4. Qué se contabiliza correctamente

### 4.1 Mensajes individuales

La tabla `public.mensajes` contiene, entre otros, estos campos:

- `id`;
- `conversacion_id`;
- `direccion` (`entrante` o `saliente`);
- `tipo_contenido`;
- `texto`;
- `proveedor_mensaje_id`;
- `estado`;
- `creado_en`;
- `twilio_message_sid`;
- `organizacion_id`.

Esto permite contar interacciones individuales y separar entradas de salidas.

### 4.2 Hilos de conversación

`conversaciones` contiene el hilo operativo del CRM y permite relacionar varios mensajes:

- `organizacion_id`;
- `canal`;
- `iniciada_en`;
- `ultimo_mensaje_en`;
- `ultimo_entrante_en`;
- `ultimo_saliente_en`;
- `ultimo_mensaje_id`;
- `estado`.

Esto sirve para métricas de atención y seguimiento, pero no debe asumirse automáticamente como la misma unidad tarifaria que una conversación facturable de Meta.

### 4.3 Deduplicación de mensajes

Existe un índice único para `organizacion_id + proveedor_mensaje_id` cuando el ID del proveedor no es nulo:

```sql
CREATE UNIQUE INDEX mensajes_org_provider_message_uidx
ON public.mensajes (organizacion_id, proveedor_mensaje_id)
WHERE proveedor_mensaje_id IS NOT NULL;
```

También existen índices únicos sobre los identificadores de Twilio/Meta almacenados en `twilio_message_sid`.

Esto protege razonablemente contra registrar dos veces el mismo mensaje del proveedor, aunque deben revisarse los caminos que registran mensajes sin ID.

## 5. Qué no está listo para cobro

### 5.1 No hay ledger de consumo

No existe una tabla específica que represente una unidad facturable. Actualmente no hay una entidad con campos explícitos para:

- categoría Meta;
- indicador `billable`;
- tipo de pricing;
- proveedor;
- plantilla utilizada;
- fecha facturable;
- periodo de facturación;
- precio;
- moneda;
- versión de la tarifa;
- estado de conciliación.

### 5.2 Pricing solamente se conserva en JSON

`eventos_entrega.payload_crudo` conserva el webhook completo de Meta. Esto es útil como evidencia, pero no es suficiente como modelo de negocio porque la categoría no puede consultarse de forma segura y consistente sin interpretar JSON.

El schema del webhook normaliza solamente:

- ID del mensaje;
- estado;
- código de error;
- timestamp;
- payload original.

No normaliza `pricing.category`, `pricing.billable` ni `pricing.type`.

Archivo relacionado:

- `backend/app/channels/whatsapp/schemas.py`

### 5.3 Eventos de entrega no equivalen a mensajes facturables

Los eventos actuales están vinculados a un mensaje, pero la tabla permite múltiples eventos por mensaje. Por tanto:

```text
1 mensaje
  -> enviado
  -> entregado
  -> leído
```

debe representar un solo mensaje, no tres unidades de cobro.

Se encontraron 15 grupos duplicados de eventos Meta `entregado`. Esto no necesariamente genera un cobro duplicado en las métricas actuales, pero demuestra que se necesita una deduplicación más fuerte para los eventos.

### 5.4 Mensajes sin resultado suficiente del proveedor

Se encontraron 129 mensajes salientes sin evento de entrega y 83 sin ID del proveedor.

Esto puede mezclar:

- intentos que fallaron antes de recibir un ID;
- registros internos del CRM;
- envíos aceptados cuyo webhook de estado no llegó;
- datos históricos o de prueba.

Para cobrar, estos casos deben quedar como `no_conciliados` y no como facturables automáticamente.

## 6. Categorías de Meta

La implementación construye envíos de plantilla y envíos de texto/media en:

- `backend/app/channels/whatsapp/service.py`.

El envío conoce el nombre e idioma de la plantilla, pero no persiste una categoría tarifaria explícita. La categoría correcta debe provenir de Meta, no inferirse solamente por el nombre de la plantilla.

En la muestra analizada se encontró:

- `service`;
- `referral_conversion`;
- ningún `marketing`;
- ningún `utility`;
- ningún `authentication`;
- ningún `billable=true`.

La categoría `referral_conversion` debe tratarse como una categoría de entrada gratuita o promocional según el payload recibido, no como marketing automáticamente.

## 7. Problemas de atribución por tenant

El tenant maestro:

```text
00000000-0000-0000-0000-000000000001
GEOACTIV / TAL-IA
```

concentra 1,268 mensajes salientes, 1,045 entrantes y 350 conversaciones.

Antes de emitir cargos se debe confirmar si ese tráfico pertenece realmente a GEOACTIV/TAL-IA o si incluye:

- pruebas;
- tráfico histórico;
- configuraciones antiguas;
- mensajes que debieron asignarse a otros tenants.

Una atribución incorrecta de `organizacion_id` produciría cargos incorrectos aunque el conteo de mensajes sea técnicamente exacto.

## 8. Concurrencia e hilos duplicados

Existe una migración destinada a serializar la resolución de identidad y conversación por tenant y teléfono:

- `supabase/migrations/20260813_091500_whatsapp_identity_conversation_race_fix.sql`

La verificación posterior confirmó que la migración ya está aplicada en la base activa. La función contiene:

- `pg_advisory_xact_lock`;
- la clave `whatsapp_identity_lock`;
- bloqueo por tenant y teléfono/WhatsApp ID;
- filtro de `organizacion_id` al buscar mensajes existentes;
- reutilización de conversaciones abiertas aunque haya pasado la ventana de inactividad;
- creación de una nueva conversación únicamente cuando la anterior está cerrada.

Por tanto, este riesgo queda mitigado a nivel de base de datos. La observación inicial sobre la migración no aplicada queda resuelta y debe conservarse solamente como antecedente del diagnóstico.

## 9. Riesgo de seguridad

La función `registrar_mensaje_whatsapp` es `SECURITY DEFINER` y tiene permisos de ejecución para roles amplios, incluidos `anon` y `authenticated`.

La función recibe `p_organizacion_id`, por lo que debe comprobarse que un usuario o cliente no pueda invocar el RPC con el tenant de otra organización.

Recomendación:

- revocar ejecución pública si no es necesaria;
- dejar el acceso al backend mediante `service_role` o un rol controlado;
- validar que el tenant recibido corresponda al contexto autenticado;
- mantener la validación de ownership de `conversation_id`, `persona_id` y `organizacion_id`.

## 10. Modelo recomendado para facturación

Se recomienda crear un ledger separado, por ejemplo:

### `whatsapp_message_usage`

Columnas mínimas:

```text
id
organizacion_id
mensaje_id
conversacion_id
provider
provider_message_id
direction
template_id
template_name
meta_category
pricing_type
billable
provider_status
billable_at
billing_period
unit_price
currency
source
reconciliation_status
created_at
```

### Reglas de integridad

- Un `provider_message_id` no puede producir dos consumos facturables para el mismo tenant.
- Los eventos de entrega nunca generan filas adicionales de consumo.
- Un mensaje sin proveedor o sin estado suficiente queda `no_conciliado`.
- La categoría se toma del payload oficial de Meta.
- El precio aplicado se guarda como fotografía histórica.
- Los registros deben quedar aislados por `organizacion_id`.
- La facturación se calcula por periodo cerrado, no directamente sobre consultas en tiempo real.

## 11. Consultas operativas que se necesitarán

Como mínimo, el sistema deberá poder responder:

1. ¿Cuántos mensajes envió cada tenant en el periodo?
2. ¿Cuántos fueron aceptados por Meta?
3. ¿Cuántos fueron facturables?
4. ¿Cuántos fueron `marketing`, `utility`, `authentication` o `service`?
5. ¿Cuántos fueron gratuitos por `referral_conversion`?
6. ¿Cuántos mensajes quedaron sin conciliar?
7. ¿Qué plantillas generaron el consumo?
8. ¿Qué conversaciones iniciadas por el cliente habilitaron una ventana de servicio?
9. ¿Cuánto se cobró y con qué tarifa histórica?
10. ¿Se puede reproducir el importe desde los datos originales de Meta?

## 12. Orden recomendado de implementación

1. Conciliar y corregir la atribución histórica de `organizacion_id`.
2. Normalizar los campos `pricing` de Meta.
3. Crear el ledger de uso con constraints e índices por tenant, proveedor y periodo.
4. Fortalecer la deduplicación de eventos.
5. Separar intento, aceptación, entrega y facturación.
6. Crear reportes de discrepancias.
7. Ejecutar un periodo de prueba sin cobro.
8. Comparar el ledger interno contra los datos de Meta.
9. Activar cobro únicamente después de cerrar las discrepancias.

## 13. Archivos revisados

- `backend/app/channels/whatsapp/schemas.py`
- `backend/app/channels/whatsapp/router.py`
- `backend/app/channels/whatsapp/service.py`
- `backend/app/services/storage.py`
- `backend/app/repositories/crm.py`
- `supabase/migrations/20260717_043500_inbox_message_provider_dedupe.sql`
- `supabase/migrations/20260813_091500_whatsapp_identity_conversation_race_fix.sql`
- migraciones de aislamiento multitenant de `conversaciones`, `mensajes` y `eventos_entrega`.

## Estado final del diagnóstico

**No aprobado todavía para cobro automático.**

La trazabilidad operativa existe parcialmente, pero faltan normalización tarifaria, conciliación de tenant, separación entre intento y mensaje facturable, control de duplicados y un ledger inmutable de consumo.

## Addendum — 2026-08-15

El diagnóstico anterior queda actualizado por la implementación del ledger y las verificaciones realizadas en producción:

- Los callbacks Meta huérfanos se conservan en `eventos_entrega` y ahora tienen `conciliacion_estado` explícito: `pendiente`, `vinculado` o `no_conciliado`.
- Los 103 callbacks antiguos sin mensaje local fueron marcados `no_conciliado` con motivo `mensaje_local_no_encontrado`; no se generaron cargos.
- Los callbacks que llegan antes que el mensaje se vinculan automáticamente cuando aparece la fila local.
- Los 160 mensajes históricos sin fila en `cobro_mensajes` son correos entrantes identificados por `datos.channel = correo`; no son faltantes de WhatsApp.
- Se verificó que no hay mensajes de correo dentro del ledger y que el ledger usa `canal = whatsapp`.

Por lo tanto, el hallazgo de los 160 registros debe interpretarse como una diferencia entre el historial general de `mensajes` y el alcance del cobro WhatsApp, no como mezcla de canales ni como deuda pendiente.
