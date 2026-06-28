# Changelog · Plan Maestro Comercial

Formato recomendado por entrada:

- `Base de datos`
- `Backend`
- `Frontend`
- `Operación/Notas`

## Plantilla por fases

### Fase 1: Base de datos

- Tablas creadas o modificadas:
- Columnas agregadas:
- Constraints y FKs:
- Índices:
- Migración aplicada:
- Notas operativas:

### Fase 2: Backend

- Endpoints creados o modificados:
- Servicios nuevos:
- Reglas de validación:
- Reglas de idempotencia:
- Integración Stripe:
- Notas operativas:

### Fase 3: Frontend

- Vistas creadas o modificadas:
- Formularios ajustados:
- Estados mostrados:
- Acciones de administración:
- Cambios UX/UI:
- Notas operativas:

### Fase 4: Stripe y Webhooks

- Eventos procesados:
- Validación de firma:
- Mapeo de estados:
- Reintentos e idempotencia:
- Provisioning disparado:
- Notas operativas:

### Fase 5: Producción y operación

- Despliegue realizado:
- Variables o secretos:
- Verificaciones post-deploy:
- Rollback o contingencia:
- Observaciones:

---

## 2026-06-28

### Documentación
- Se creó el directorio formal del plan maestro comercial.
- Se documentó la capa comercial, de billing, tenant config y runtime en `PLAN_MAESTRO_COMERCIAL.md`.
- Se agregó el documento funcional `ALTA_TENANT_DESDE_STRIPE.md` para definir el alta comercial desde Stripe.
- Se agregó `IMPLEMENTACION_ALTA_TENANT_STRIPE.md` para separar la implementación por base de datos, backend y frontend.
- Se agregó `MIGRACIONES_ALTA_TENANT_STRIPE.md` con migraciones exactas sugeridas para PostgreSQL/Supabase.
- Se agregó este `README.md` como índice operativo del plan.

### Base de datos
- Se formalizó la regla de que la lógica comercial principal debe modelarse con tablas y columnas explícitas.
- Se definieron tablas base para:
  - `commercial_plans`
  - `commercial_plan_prices`
  - `commercial_plan_entitlements`
  - `commercial_plan_defaults`
  - `tenant_billing_accounts`
  - `tenant_billing_events`
  - `tenant_plan_overrides`
  - `tenant_provisioning_jobs` opcional
- Se propuso extender `organizaciones` con columnas explícitas para datos generales del tenant.
- Se creó la migración real `supabase/migrations/20280630_131500_commercial_billing_stripe.sql` con:
  - extensión de `organizaciones`,
  - tablas comerciales,
  - tablas de billing,
  - tablas de overrides,
  - tabla opcional de provisioning,
  - RLS y grants para `service_role`.
- La migración quedó aplicada en la base remota.
- Se sembraron 5 planes base y 5 precios mensuales en MXN:
  - `starter` = $1
  - `growth` = $2
  - `pro` = $3
  - `business` = $4
  - `enterprise` = $5
- Se definió que sí habrá CRUD de administración para la capa comercial, pero:
  - solo para `platform admin`,
  - sin borrado destructivo de planes en uso,
  - con edición controlada de precios, entitlements y defaults,
  - y con `tenant_billing_accounts`/`tenant_billing_events` fuera de CRUD libre.

### Backend
- Se definió el flujo Stripe -> webhook -> backend -> provisioning -> acceso.
- Se dejó claro que la activación no debe depender del frontend.
- Se establecieron reglas de idempotencia y validación de firma para webhooks.
- Se expusieron endpoints administrativos para CRUD de `commercial_plans` y `commercial_plan_prices` con protección de `platform admin`.

### Frontend
- Se definió que `settings/tenants` sigue siendo consola de administración interna, no fuente única de alta comercial.
- Se recomendó mostrar datos generales, plan, billing status y access status en la ficha de tenant.
- Se agregó el módulo de `Planes comerciales` en `settings/commercial-plans` para administrar planes, precios, entitlements y defaults comerciales desde el panel.
- Se extendió el alta manual de tenants para seleccionar plan comercial y acceso inicial sin pasar por Stripe.

### Operación/Notas
- El plan queda listo para pasar de documentación a migraciones reales y endpoints de provisioning.
- El siguiente paso natural es implementar primero el esquema de BD y después el webhook de Stripe.
- El CRUD de planes, precios, entitlements y defaults ya quedó disponible para `platform admin` con alta, edición y desactivación lógica.
- El alta de tenant manual ya puede crear el tenant con plan comercial interno, dejando Stripe como ruta comercial opcional.

---

## v0.1 - Base del plan comercial

### Base de datos
- Se definió que `organizaciones` seguirá siendo la tabla base del tenant.
- Se acordó extender `organizaciones` con columnas explícitas para datos generales del cliente.
- Se definieron tablas nuevas para:
  - `commercial_plans`
  - `commercial_plan_prices`
  - `commercial_plan_entitlements`
  - `commercial_plan_defaults`
  - `tenant_billing_accounts`
  - `tenant_billing_events`
  - `tenant_plan_overrides`
  - `tenant_provisioning_jobs` opcional
- Se estableció que la lógica comercial principal no debe depender de `config`, `metadata` ni JSON.

### Backend
- Se definió el flujo Stripe -> webhook -> backend -> provisioning -> acceso.
- Se estableció que el backend es la fuente de verdad para activar o bloquear tenants.
- Se acordó procesar eventos Stripe con validación de firma e idempotencia.
- Se separó billing de configuración operativa y de permisos de usuario.

### Frontend
- Se definió que `settings/tenants` funciona como consola de administración interna.
- Se acordó que la vista del tenant debe mostrar plan, billing status y access status.
- Se estableció que el frontend no decide el acceso comercial del tenant.

### Operación/Notas
- Esta versión deja la arquitectura comercial base lista para implementación.
- El siguiente paso es convertir la documentación en migraciones y endpoints reales.

---

## Uso recomendado

Cuando cierres un cambio real, agrega una entrada nueva con la fecha exacta y llena solo la fase que corresponda.

Si un cambio toca varias capas, registra cada una por separado en la misma fecha.

---

## v0.2 - Visibilidad comercial en tenants

### Base de datos / backend
- Se expuso la capa comercial asociada al tenant para lectura operativa:
  - `commercial_plan_id`
  - `commercial_plan_code`
  - `commercial_plan_name`
  - `billing_provider`
  - `billing_status`
  - `commercial_access_status`
- Se corrigió el alta interna de tenants para que la cuenta comercial use un `stripe_customer_id` explícito y válido.
- Se añadió el cruce de `tenant_billing_accounts` con `commercial_plans` para listar el plan y el estado de acceso.

### Frontend
- Se agregó la visualización de `plan` y `access` en `settings/tenants`.
- Se agregó un bloque de estado comercial en el detalle del tenant.

### Resultado
- La consola interna ya puede ver qué plan tiene cada tenant y si su acceso está activo, en gracia, bloqueado o en revisión.

---

## v0.3 - Edición comercial desde el detalle del tenant

### Backend
- Se agregó el endpoint `PATCH /admin/tenants/{organizacion_id}/commercial-state`.
- El endpoint permite:
  - asignar o cambiar `commercial_plan_id`,
  - modificar `commercial_access_status`,
  - modificar `billing_status`,
  - eliminar la cuenta comercial si el tenant se deja sin plan.

### Frontend
- Se agregó el formulario `Estado comercial` en el detalle de `settings/tenants/{tenantId}`.
- Se reutiliza la misma capa de control para administrar plan, acceso y estado de cobro.

### Resultado
- Un `platform_admin` ya puede crear, ver y ajustar el estado comercial de un tenant desde la consola interna sin tocar Stripe para la operación manual.
