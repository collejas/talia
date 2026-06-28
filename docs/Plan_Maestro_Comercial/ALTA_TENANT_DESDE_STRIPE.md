# Alta de Tenant Desde Stripe

## Propósito

Este documento define cómo debe crearse y aprovisionarse un tenant cuando el alta comercial viene desde Stripe.

Forma parte del [Plan Maestro Comercial](./PLAN_MAESTRO_COMERCIAL.md) y complementa la capa comercial, de billing y de tenant config.

La regla base es esta:

- Stripe confirma el pago.
- El backend crea o actualiza el tenant.
- La base de datos guarda datos generales y estado de acceso.
- La app consume el estado resuelto por backend.

No se debe depender de la vista `settings/tenants` como única fuente de alta comercial.

---

## Estado actual

Hoy la alta de tenant desde la vista global de administración es funcional pero mínima:

- se registra el tenant con datos básicos;
- se puede crear estructura inicial de roles, permisos y rutas;
- se puede crear usuario administrador en el flujo extendido;
- parte de la configuración operativa se guarda en `organizaciones.config`.

Esto sirve para administración interna, pero no es suficiente para un alta comercial completa desde Stripe.

---

## Problema a resolver

Cuando un usuario compra un plan, el sistema debe dejar listo el tenant con:

- datos generales mínimos del cliente;
- estado comercial y de acceso;
- plan asignado;
- defaults del plan aplicados;
- usuario inicial o contacto de acceso si aplica;
- rutas y recursos base;
- auditoría de billing.

Si esto no se modela bien, el tenant queda "a medias" y luego hay que corregirlo manualmente.

---

## Principio de diseño

La información importante del negocio debe vivir en columnas explícitas.

Por tanto:

- no usar `config` como fuente principal de datos comerciales;
- no usar metadata para decidir acceso;
- no guardar lógica de negocio crítica en JSON;
- no mezclar billing con personalización operativa.

---

## Qué debe guardar `organizaciones`

La tabla `organizaciones` debe seguir siendo la identidad base del tenant.

Además de los campos actuales, conviene agregar columnas explícitas para datos generales que sí se consultan o reportan con frecuencia.

### Campos recomendados

- `nombre_comercial`
- `correo_contacto_principal`
- `correo_facturacion`
- `contacto_nombre`
- `contacto_telefono`
- `timezone`
- `idioma`
- `moneda`
- `logo_url`
- `direccion_fiscal`
- `codigo_postal`
- `regimen_fiscal`
- `dominio_principal`
- `sitio_web`
- `estado_onboarding`
- `activo`

### Campos que pueden quedarse en tenant config

- branding secundario
- horarios operativos
- calendarios
- rutas específicas de operación
- integraciones puntuales
- ajustes no comerciales

---

## Qué no debe guardar `organizaciones`

No se recomienda guardar aquí:

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

Eso pertenece a billing, no a identidad del tenant.

---

## Tablas mínimas para alta comercial

### 1. `tenant_billing_accounts`

Guarda el estado comercial y de acceso del tenant.

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

### 2. `tenant_billing_events`

Guarda auditoría e idempotencia de Stripe.

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
- `created_at`

### 3. `commercial_plans`

Define lo que se vende.

### 4. `commercial_plan_prices`

Define cómo se cobra cada plan.

### 5. `commercial_plan_entitlements`

Define qué incluye cada plan.

### 6. `commercial_plan_defaults`

Define defaults iniciales del tenant al activarse.

### 7. `tenant_plan_overrides`

Define excepciones por tenant con vigencia.

---

## Flujo recomendado de alta desde Stripe

### Paso 1: compra

El usuario elige plan y paga en Stripe.

### Paso 2: webhook

Stripe envía un webhook firmado al backend.

### Paso 3: validación

El backend valida:

- firma Stripe;
- idempotencia por `stripe_event_id`;
- correspondencia del customer/subscription con el tenant o con la intención de alta;
- plan correcto.

### Paso 4: creación o actualización

El backend:

- crea `organizaciones` si el tenant no existe;
- llena campos generales explícitos;
- crea `tenant_billing_accounts`;
- asigna `plan_id`;
- aplica `commercial_plan_defaults`;
- registra evento en `tenant_billing_events`;
- crea usuario inicial si el flujo lo requiere;
- crea roles, permisos y rutas base;
- activa `access_status`.

### Paso 5: acceso

La app consulta el estado resuelto por backend y decide:

- si entra;
- qué ve;
- qué puede usar;
- qué límites aplican.

---

## Rol de `settings/tenants`

La vista `settings/tenants` debe seguir existiendo, pero su rol principal es administración interna.

Sirve para:

- ver tenants;
- crear tenants manualmente;
- depurar altas;
- revisar estado;
- administrar excepciones.

No debe ser la única puerta de entrada del provisioning comercial.

---

## Reglas obligatorias

- No activar acceso desde frontend.
- No confiar en `plan_id`, `price_id` o `tenant_id` enviados por el cliente sin validación backend.
- No usar `config` como sustituto del plan.
- No guardar lógica comercial central en JSON.
- No procesar un webhook más de una vez.
- No bloquear rutas de billing ni de soporte básico cuando el tenant esté vencido.

---

## Recomendación práctica

Para la implementación, yo lo haría en este orden:

1. Completar columnas explícitas en `organizaciones`.
2. Crear `tenant_billing_accounts`.
3. Crear `tenant_billing_events`.
4. Conectar Stripe webhook al backend.
5. Crear el flujo de aprovisionamiento de tenant.
6. Aplicar defaults y entitlements.
7. Exponer el estado en panel y billing.

---

## Resultado esperado

Con este esquema:

- Stripe activa el tenant de forma confiable;
- el tenant nace con datos generales correctos;
- el acceso de app queda controlado por backend;
- la configuración operativa sigue separada;
- las excepciones por cliente siguen siendo posibles;
- el modelo comercial se mantiene explícito y escalable.
