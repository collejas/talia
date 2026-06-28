# Implementacion de Alta de Tenant por Stripe

## Objetivo

Definir la implementacion tecnica para que un tenant se cree o se active correctamente cuando el pago llega desde Stripe.

Este documento complementa:

- [Plan Maestro Comercial](./PLAN_MAESTRO_COMERCIAL.md)
- [Alta de Tenant Desde Stripe](./ALTA_TENANT_DESDE_STRIPE.md)
- [Migraciones Exactas Para Alta de Tenant por Stripe](./MIGRACIONES_ALTA_TENANT_STRIPE.md)

El objetivo no es solo "crear un tenant", sino dejarlo listo con:

- datos generales completos;
- estado comercial y de acceso;
- plan asignado;
- defaults aplicados;
- usuario inicial o contacto de acceso;
- rutas y permisos base;
- trazabilidad de billing.

Antes de ejecutar esta implementacion, debe quedar cerrada la regla de acceso inicial:

- Stripe confirma la compra, pero no valida por si solo la propiedad del correo.
- Si el correo se va a usar para acceso, primero debe verificarse.
- Solo despues de esa verificacion se manda la invitacion o activacion.
- El usuario inicial debe nacer con rol `owner` dentro del mismo provisioning.

---

## 1. Base de datos

### 1.1 Principio

Todo dato importante para negocio debe vivir en columnas explicitas.

No se debe depender de `config`, `metadata` o `jsonb` para:

- acceso comercial;
- estado de billing;
- plan activo;
- limites;
- permisos base;
- provisioning inicial.

### 1.2 Tabla `organizaciones`

La tabla `organizaciones` debe seguir siendo la identidad principal del tenant.

Campos que ya existen y se usan bien:

- `nombre`
- `razon_social`
- `rfc`
- `pais`
- `estado`
- `ciudad`
- `dominio_principal`
- `telefono`
- `sitio_web`
- `estado_onboarding`
- `activo`
- `fecha_alta`
- `fecha_pausa`
- `fecha_cancelacion`

Campos recomendados para agregar:

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

### 1.3 Tabla `tenant_billing_accounts`

Esta tabla debe guardar el estado comercial del tenant.

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

### 1.4 Tabla `tenant_billing_events`

Debe existir para auditoria e idempotencia.

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

### 1.5 Tablas comerciales

Se mantienen las tablas maestras ya planteadas:

- `commercial_plans`
- `commercial_plan_prices`
- `commercial_plan_entitlements`
- `commercial_plan_defaults`
- `tenant_plan_overrides`

### 1.6 Reglas de persistencia

- `stripe_event_id` debe ser unico.
- `tenant_id` debe ser FK real.
- Las tablas de billing deben tener indices para `tenant_id`, `stripe_customer_id` y `stripe_subscription_id`.
- Las tablas de plan deben poder consultarse sin JSON para la logica principal.
- No duplicar estado de acceso en varias tablas sin una fuente clara de verdad.

---

## 2. Backend

### 2.1 Punto de entrada

El backend debe ser la unica capa que:

- valide eventos Stripe;
- resuelva el plan;
- cree o actualice el tenant;
- asigne billing y acceso;
- aplique defaults;
- registre auditoria;
- habilite o bloquee acceso.

### 2.2 Flujo de Stripe

Orden recomendado:

1. Stripe genera el evento.
2. El webhook llega al backend.
3. El backend valida `Stripe-Signature`.
4. El backend verifica idempotencia.
5. El backend identifica customer, subscription y plan.
6. El backend verifica el correo que recibira acceso si el alta comercial lo incluye.
7. El backend crea o actualiza `organizaciones`.
8. El backend crea o actualiza `tenant_billing_accounts`.
9. El backend registra `tenant_billing_events`.
10. El backend aplica defaults del plan.
11. El backend crea o asocia el usuario inicial solo despues de la verificacion de correo.
12. El backend crea roles, permisos y rutas base.
13. El backend asigna o consolida el rol `owner`.
14. El backend deja `access_status` resuelto.

### 2.3 Servicios recomendados

Separar la logica en servicios claros:

- `Billing::WebhookProcessor`
- `Billing::AccessResolver`
- `Billing::ProvisioningService`
- `Entitlements::Resolver`
- `Tenant::ProvisioningService`
- `BillingGuard`
- `EntitlementGuard`
- `PermissionGuard`

### 2.4 Reglas de backend

- No activar tenant desde el frontend.
- No confiar en datos enviados por el cliente para `plan_id` o `tenant_id`.
- No procesar un mismo webhook dos veces.
- No mezclar provisioning comercial con configuracion operativa.
- No usar `config` como fuente principal para decidir acceso.

### 2.5 Relacion con la implementacion actual

Hoy la ruta de alta en admin ya crea tenant, roles, permisos y usuario en ciertos casos.

Lo que falta es formalizar la capa comercial:

- crear billing account;
- resolver plan;
- guardar estado de Stripe;
- aplicar defaults del plan;
- producir un estado de acceso unico y confiable.

### 2.6 Estados de acceso

El backend debe resolver al menos:

- `active`
- `trialing`
- `grace`
- `blocked`
- `manual_review`
- `internal_free`

### 2.7 Flujo de correo e invitacion

Este flujo debe compartir la misma logica tanto para Stripe como para alta interna, con las diferencias de origen adecuadas:

- **Alta interna administrada por plataforma**: invitacion directa cuando el correo ya esta validado por el operador.
- **Autoregistro publico**: confirmacion de correo primero, luego invitacion o activacion.
- **Alta por Stripe o plataforma de cobro**: pago confirmado, correo de acceso verificado, luego invitacion o activacion.

El correo de recuperacion de contrasena solo se usa para cuentas ya existentes.

Y mapearlos desde `billing_status` y reglas de negocio propias.

---

## 3. Frontend

### 3.1 Rol del frontend

El frontend no decide acceso.

Solo debe:

- mostrar el estado resuelto;
- permitir alta manual para administracion interna;
- mostrar plan, billing y acceso;
- guiar el onboarding;
- ofrecer acciones de pago o reactivacion;
- reflejar errores o pendientes.

### 3.2 Vista `settings/tenants`

La vista actual puede seguir existiendo como consola de administracion global.

Pero debe evolucionar para:

- mostrar datos generales del tenant;
- mostrar estado comercial;
- mostrar plan activo;
- mostrar billing status;
- mostrar access status;
- permitir alta manual completa;
- permitir disparar aprovisionamiento si el flujo Stripe no termino bien.

### 3.3 Formulario de alta

Si el tenant se crea manualmente desde la vista admin, el formulario debe pedir como minimo:

- nombre del tenant;
- razon social;
- dominio principal;
- pais/estado/ciudad;
- telefono;
- sitio web;
- correo de contacto;
- correo de facturacion;
- timezone;
- idioma;
- moneda;
- plan comercial;
- estado inicial;
- contacto administrativo inicial;
- alias o rutas iniciales si aplica.

Si el alta manual crea el usuario inicial, ese usuario debe quedar asociado al tenant como `owner` desde el provisioning, no como ajuste posterior.

### 3.4 Vista de detalle del tenant

La ficha del tenant debe mostrar:

- datos generales;
- plan actual;
- billing status;
- access status;
- fechas clave;
- rutas activas;
- usuario inicial o admin;
- overrides;
- eventos relevantes.

### 3.5 UX recomendada

La UI debe distinguir claramente:

- datos de empresa;
- datos comerciales;
- datos de acceso;
- datos operativos.

No mezclar todo en un solo bloque de formulario.

---

## 4. Secuencia de implementacion

### Fase 1

- agregar columnas explicitas en `organizaciones`;
- crear `tenant_billing_accounts`;
- crear `tenant_billing_events`;
- definir claves y indices.

### Fase 2

- crear servicios de billing y provisioning en backend;
- integrar webhook Stripe;
- hacer idempotente el procesamiento;
- guardar estado de acceso.

### Fase 3

- ajustar `settings/tenants`;
- mostrar plan y billing;
- ampliar formulario de alta manual;
- crear vista de detalle del tenant.

### Fase 4

- agregar guards de billing y entitlement;
- bloquear rutas operativas si no hay acceso;
- dejar libres rutas de billing y soporte.

---

## 5. Criterio de terminado

La implementacion queda lista cuando:

- Stripe crea o activa el tenant sin intervencion manual;
- el tenant recibe datos generales completos;
- el billing queda guardado en tablas propias;
- el acceso lo decide backend;
- el frontend solo refleja estado;
- la administracion manual sigue disponible;
- las excepciones por tenant siguen funcionando.

---

## Estado de implementacion

Este documento ya quedo materializado en parte importante del sistema.

Implementado:

- alta manual de usuarios/tenants con invitacion directa;
- flujo de confirmacion de correo previo a la invitacion;
- creacion de `tenant_access_invitations` como registro intermedio;
- endpoint publico de confirmacion de correo;
- pantalla de confirmacion en el panel;
- provisioning Stripe alineado a confirmacion de correo + invitacion + rol `owner`.

Pendiente si se desea ampliar:

- unificar el mismo esquema para autoregistro publico;
- agregar mas estados visuales en el panel;
- extender observabilidad del flujo de onboarding comercial.
