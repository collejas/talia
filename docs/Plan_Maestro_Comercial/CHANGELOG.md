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

### Backend
- Se definió el flujo Stripe -> webhook -> backend -> provisioning -> acceso.
- Se dejó claro que la activación no debe depender del frontend.
- Se establecieron reglas de idempotencia y validación de firma para webhooks.

### Frontend
- Se definió que `settings/tenants` sigue siendo consola de administración interna, no fuente única de alta comercial.
- Se recomendó mostrar datos generales, plan, billing status y access status en la ficha de tenant.

### Operación/Notas
- El plan queda listo para pasar de documentación a migraciones reales y endpoints de provisioning.
- El siguiente paso natural es implementar primero el esquema de BD y después el webhook de Stripe.

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
