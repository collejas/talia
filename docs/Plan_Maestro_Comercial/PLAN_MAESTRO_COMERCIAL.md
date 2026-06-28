# Plan Maestro Comercial y de Entitlements

## Objetivo
Definir la capa comercial maestra de TalIA para vender la plataforma por planes, activar tenants automáticamente al pagar y controlar qué funciones, vistas, permisos, límites y módulos incluye cada versión comercial.

Este plan separa claramente:

- **Plan comercial**: lo que se vende.
- **Billing**: lo que está pagado, vigente o bloqueado.
- **Tenant**: la instancia real del cliente.
- **Tenant config**: excepciones y personalizaciones por cliente.
- **Runtime**: la decisión efectiva de acceso en la app.

---

## Principios

1. No duplicar la app por plan.
2. No mezclar billing con configuración operativa.
3. No usar `config` del tenant como única fuente para todo.
4. No confiar en el frontend para decidir acceso.
5. El backend es la fuente de verdad.
6. Cada capa debe tener una responsabilidad clara.
7. El esquema debe diseñarse 100% con tablas y columnas explícitas, sin depender de `metadata` para la lógica comercial principal.

---

## Capas

### 1) Capa comercial
Describe los planes que se venden.

Define:

- funciones incluidas
- módulos visibles
- vistas habilitadas
- permisos base
- límites de usuarios
- límites de procesos
- límites de uso
- canales incluidos
- defaults iniciales
- reglas de activación

### 2) Capa de billing
Describe el estado de pago y vigencia.

Define:

- si el tenant puede usar la app
- si está en prueba
- si está vencido
- si está cancelado
- si está en gracia
- si se puede renovar o reactivar

Importante:

- `billing_status` describe lo que viene del proveedor, por ejemplo Stripe.
- `access_status` describe lo que decide la app, por ejemplo `active`, `grace`, `blocked`, `manual_review`, `internal_free`.
- La app no debe depender solo de `billing_status` para decidir acceso final.

### 3) Capa tenant
Describe la organización concreta.

Define:

- datos de la organización
- usuarios
- rutas por canal
- secretos
- configuración operativa
- personalizaciones

### 4) Capa runtime
Resuelve lo que el sistema permite hacer en ese momento.

Define:

- si el usuario entra o no
- qué módulos ve
- qué rutas puede abrir
- qué acciones puede ejecutar
- qué límites aplican

---

## Problema que resuelve

Hoy TalIA centraliza demasiada lógica en el tenant y en `organizaciones.config`.

Eso sirve para operación, pero no para:

- vender varias versiones comerciales
- aplicar límites por plan
- activar automáticamente al pagar
- manejar excepciones comerciales
- bloquear acceso por billing
- escalar la oferta sin duplicar lógica

---

## Estructura recomendada

### A. Planes comerciales
Tabla sugerida:

- `commercial_plans`

Campos sugeridos:

- `id`
- `code`
- `name`
- `description`
- `active`
- `sort_order`
- `created_at`
- `updated_at`

### B. Precios del plan
Tabla sugerida:

- `commercial_plan_prices`

Campos sugeridos:

- `id`
- `plan_id`
- `billing_provider`
- `provider_product_id`
- `provider_price_id`
- `currency`
- `billing_interval`
- `amount_cents`
- `active`
- `created_at`
- `updated_at`

### C. Entitlements del plan
Tabla sugerida:

- `commercial_plan_entitlements`

Campos sugeridos:

- `id`
- `plan_id`
- `entitlement_key`
- `value_type`
- `enabled`
- `limit_value`
- `value_text`
- `value_json`
- `limit_unit`
- `scope`
- `created_at`

Tipos sugeridos para `value_type`:

- `boolean`
- `integer`
- `decimal`
- `text`
- `json`

`value_json` permite estructuras más expresivas como:

- modelos permitidos
- canales permitidos
- formatos de exportación
- listas de reglas avanzadas

Ejemplos de `entitlement_key`:

- `feature.webchat`
- `feature.whatsapp`
- `feature.voice`
- `feature.messenger`
- `feature.scoring`
- `feature.crm`
- `feature.billing_portal`
- `limit.users`
- `limit.processes`
- `limit.messages_month`
- `limit.tenants`
- `limit.channels`

### D. Defaults del plan
Tabla sugerida:

- `commercial_plan_defaults`

Campos sugeridos:

- `id`
- `plan_id`
- `default_key`
- `default_value`
- `scope`
- `created_at`

Aquí se guardan configuraciones iniciales del tenant cuando se aprovisiona.

### E. Tenant billing
Tabla sugerida:

- `tenant_billing_accounts`

Campos sugeridos:

- `id`
- `tenant_id`
- `plan_id`
- `billing_provider`
- `stripe_customer_id`
- `stripe_subscription_id`
- `stripe_price_id`
- `billing_status`
- `access_status`
- `trial_ends_at`
- `current_period_start`
- `current_period_end`
- `grace_until`
- `cancel_at_period_end`
- `activated_at`
- `deactivated_at`
- `last_stripe_event_id`
- `created_at`
- `updated_at`

Estados recomendados:

- `active`
- `trialing`
- `past_due`
- `inactive`
- `canceled`
- `unpaid`
- `incomplete`

Estados sugeridos para `access_status`:

- `active`
- `grace`
- `blocked`
- `manual_review`
- `internal_free`

### F. Eventos de billing
Tabla sugerida:

- `tenant_billing_events`

Campos sugeridos:

- `id`
- `tenant_id`
- `stripe_event_id`
- `stripe_event_type`
- `stripe_customer_id`
- `stripe_subscription_id`
- `event_created_at`
- `processed_at`
- `processing_error`
- `raw_payload` o resumen explícito mínimo
- `created_at`

### G. Overrides por tenant
Tabla o estructura sugerida:

- `tenant_plan_overrides`

Campos sugeridos:

- `id`
- `tenant_id`
- `override_key`
- `override_value`
- `value_type`
- `reason`
- `starts_at`
- `ends_at`
- `created_by`
- `approved_by`
- `created_at`
- `updated_at`

Esto permite excepciones por cliente sin crear un plan nuevo y con vigencia controlada.

---

## Reglas de idempotencia y seguridad

Estas reglas son obligatorias antes de activar la implementación.

### Idempotencia

- Todo evento Stripe debe procesarse una sola vez.
- `stripe_event_id` debe ser único.
- Si un webhook se reintenta, no debe duplicar tenants, suscripciones ni permisos.
- El procesamiento debe soportar reintentos sin efectos secundarios duplicados.

### Seguridad

- Nunca activar acceso desde el frontend.
- Nunca confiar en `plan_id`, `price_id` o `tenant_id` enviados por el cliente sin validarlos contra Stripe y contra el backend.
- El webhook debe usar raw body.
- El webhook debe validar `Stripe-Signature`.
- El backend debe ser la fuente de verdad para el estado de acceso.
- El frontend solo refleja el estado resuelto por backend.

---

## Relación entre capas

### Precedencia recomendada

1. Plan comercial
2. Overrides del tenant
3. Estado de billing
4. Permisos reales del usuario

### Regla de negocio

- El plan define lo que se vende.
- El tenant override define excepciones.
- Billing define si la plataforma puede usarse.
- Entitlements definen si una función concreta puede usarse.
- Permissions definen si un usuario puede ejecutar una acción.
- Runtime define lo que efectivamente puede usar el usuario.

### Guards recomendados

- **Billing guard**: decide si el tenant puede entrar a la plataforma.
- **Entitlement guard**: decide si puede usar una función o módulo específico.
- **Permission guard**: decide si el usuario puede ejecutar una acción concreta.

### Resolución recomendada

No hacer que toda la app consulte directamente todas las tablas.
Crear un servicio o vista de resultado final, por ejemplo:

- `effective_entitlements`
- `tenant_access_state`

Ese resultado debe combinar:

- plan base
- precios vigentes
- overrides con vigencia
- billing status
- access status
- permisos del usuario

### Componentes lógicos recomendados

- `Billing::WebhookProcessor`
- `Billing::AccessResolver`
- `Entitlements::Resolver`
- `BillingGuard`
- `EntitlementGuard`
- `PermissionGuard`

---

## Flujo comercial objetivo

```txt
Usuario elige un plan
  ↓
Stripe Checkout
  ↓
Webhook firmado
  ↓
Backend valida firma
  ↓
Backend resuelve plan comercial
  ↓
Backend crea o actualiza tenant
  ↓
Backend aplica defaults del plan
  ↓
Backend guarda billing account
  ↓
Backend activa acceso y módulos
  ↓
Frontend refleja el estado
```

---

## Flujo de aprovisionamiento

### Al pagar

1. Crear tenant si no existe.
2. Asignar plan comercial.
3. Crear billing account.
4. Aplicar defaults del plan.
5. Crear rutas base.
6. Crear secretos base si aplican.
7. Aplicar roles/permisos base.
8. Activar módulos incluidos.
9. Registrar evento de billing.
10. Marcar tenant como activo o trialing.

### Al fallar pago

1. Registrar evento Stripe.
2. Cambiar estado a `past_due` o `unpaid`.
3. Calcular gracia si aplica.
4. Bloquear módulos operativos si se vence la gracia.
5. Mantener libres rutas de billing y soporte.

### Al cancelar

1. Registrar evento Stripe.
2. Marcar `canceled`.
3. Bloquear acceso operativo.
4. Permitir solo reactivación o pago.

---

## Capa de tenant config

La configuración del tenant sigue siendo útil, pero con otro rol:

- excepciones por cliente
- ajustes especiales
- módulos extra negociados
- límites personalizados
- branding específico
- integraciones específicas

No debe usarse para reemplazar el plan comercial.

### Uso correcto

- `plan` = base estándar vendible
- `tenant config` = variación puntual del cliente

---

## Qué debe vivir en el plan

Ejemplos:

- módulos visibles
- rutas permitidas
- permisos base
- límites de usuarios
- límites de procesos
- límites de canales
- features de IA
- features de CRM
- features de prospección
- features de automatización
- features de billing portal

---

## Qué debe vivir en tenant config

Ejemplos:

- asistente por canal
- branding
- horarios
- calendarios
- rutas específicas
- secrets por cliente
- límites especiales
- módulos extra negociados
- defaults de operación

---

## Qué debe vivir en billing

Ejemplos:

- stripe customer
- stripe subscription
- estado de suscripción
- fecha de corte
- fecha de gracia
- activación
- cancelación
- eventos recibidos
- deduplicación

---

## Rutas que no deben bloquearse

Siempre libres:

- `/login`
- `/logout`
- `/billing`
- `/billing/checkout`
- `/billing/portal`
- `/webhooks/stripe`
- `/account`

También deben quedar libres sus equivalentes API si existen:

- `/api/webhooks/stripe`
- `/api/billing/*`
- `/api/auth/*`

---

## Rutas que sí deben bloquearse si el tenant no está activo

Ejemplos:

- `/dashboard`
- `/proyectos`
- `/activos`
- `/reportes`
- `/incidencias`
- `/settings/*` excepto billing, account y soporte mínimo
- `/api/*` operativo, salvo excepciones de billing/auth/webhooks

---

## Estados de acceso recomendados

- `active` = acceso total
- `trialing` = acceso total
- `past_due` = acceso con gracia
- `inactive` = bloqueado
- `canceled` = bloqueado
- `unpaid` = bloqueado
- `incomplete` = bloqueado o pendiente de pago

---

## Webhooks Stripe

Eventos recomendados para capturar:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Reglas:

- validar `Stripe-Signature`
- usar raw body
- deduplicar por `stripe_event_id`
- registrar evento antes o junto con el procesamiento
- nunca confiar en el frontend para activar un tenant

---

## Entitlements esperados

Un plan debe poder expresar:

- qué módulos ve el usuario
- cuántos usuarios incluye
- cuántos procesos puede correr
- cuántos canales tiene
- qué vistas están habilitadas
- qué permisos base recibe
- qué límites financieros u operativos tiene

---

## Estrategia de implementación

### Fase 1

- definir planes comerciales
- definir precios por plan y moneda
- definir entitlements
- definir defaults
- definir billing accounts
- definir eventos Stripe
- definir overrides con vigencia
- definir el servicio de effective entitlements
- sembrar planes base

### Fase 2

- implementar webhook Stripe
- crear/actualizar tenant al pagar
- aplicar defaults del plan
- guardar billing status

### Fase 3

- implementar guard central de acceso
- separar billing guard, entitlement guard y permission guard
- ocultar módulos según entitlement
- bloquear rutas si no hay billing activo

### Fase 4

- agregar excepciones por tenant
- agregar portal de cliente
- agregar administración de upgrades/downgrades

### Fase 5

- pantalla de billing
- portal de cliente
- upgrades/downgrades
- auditoría comercial

---

## Criterio de éxito

El sistema queda bien cuando:

- un usuario compra un plan
- Stripe confirma el pago
- el tenant se crea o se activa solo
- el plan correcto se aplica
- las vistas correctas aparecen
- los límites correctos se respetan
- el acceso se bloquea si no paga
- las excepciones por tenant siguen funcionando

---

## Documentos complementarios

- [Alta de Tenant Desde Stripe](./ALTA_TENANT_DESDE_STRIPE.md)

---

## Decisión final

La plataforma debe operar con tres capas distintas:

1. **Plan comercial** para vender.
2. **Tenant config** para personalizar.
3. **Billing** para habilitar o bloquear la plataforma.

Y además:

- **Entitlements** para funciones, módulos y límites.
- **Permissions** para acciones de usuario.

Eso evita mezclar la lógica comercial con la lógica operativa y hace viable vender versiones distintas de la app con Stripe.
