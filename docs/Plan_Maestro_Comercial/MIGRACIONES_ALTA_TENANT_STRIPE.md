# Migraciones Exactas Para Alta de Tenant por Stripe

## Objetivo

Definir las migraciones de base de datos para soportar el alta de tenants desde Stripe con:

- datos generales completos;
- estado comercial y de acceso;
- plan comercial asignado;
- auditoria de billing;
- idempotencia;
- aprovisionamiento inicial.

Este documento complementa:

- [Plan Maestro Comercial](./PLAN_MAESTRO_COMERCIAL.md)
- [Alta de Tenant Desde Stripe](./ALTA_TENANT_DESDE_STRIPE.md)
- [Implementacion de Alta de Tenant por Stripe](./IMPLEMENTACION_ALTA_TENANT_STRIPE.md)

---

## Criterio de diseño

Todo dato importante para la logica comercial debe vivir en columnas explicitas.

No usar `metadata`, `payload` o `jsonb` como fuente principal para:

- billing;
- acceso;
- plan activo;
- limites;
- provisioning;
- permisos base.

---

## Estado actual de `organizaciones`

La tabla actual ya existe y contiene, entre otros:

- `nombre`
- `razon_social`
- `rfc`
- `pais`
- `estado`
- `ciudad`
- `dominio_principal`
- `telefono`
- `sitio_web`
- `config`
- `estado_onboarding`
- `activo`
- `fecha_alta`
- `fecha_pausa`
- `fecha_cancelacion`
- `creado_en`
- `actualizado_en`

Eso es suficiente para identidad base, pero no para provisioning comercial completo.

---

## Migracion 1: extender `organizaciones`

### Objetivo

Agregar datos generales del tenant que si se usan en acceso, facturacion, reporting o contacto operativo.

### Columnas a agregar

- `nombre_comercial text`
- `correo_contacto_principal text`
- `correo_facturacion text`
- `contacto_nombre text`
- `contacto_telefono text`
- `timezone text`
- `idioma text`
- `moneda text`
- `logo_url text`
- `direccion_fiscal text`
- `codigo_postal text`
- `regimen_fiscal text`

### SQL sugerido

```sql
ALTER TABLE public.organizaciones
    ADD COLUMN IF NOT EXISTS nombre_comercial text,
    ADD COLUMN IF NOT EXISTS correo_contacto_principal text,
    ADD COLUMN IF NOT EXISTS correo_facturacion text,
    ADD COLUMN IF NOT EXISTS contacto_nombre text,
    ADD COLUMN IF NOT EXISTS contacto_telefono text,
    ADD COLUMN IF NOT EXISTS timezone text,
    ADD COLUMN IF NOT EXISTS idioma text,
    ADD COLUMN IF NOT EXISTS moneda text,
    ADD COLUMN IF NOT EXISTS logo_url text,
    ADD COLUMN IF NOT EXISTS direccion_fiscal text,
    ADD COLUMN IF NOT EXISTS codigo_postal text,
    ADD COLUMN IF NOT EXISTS regimen_fiscal text;
```

### Recomendaciones

- `timezone` deberia quedar poblado por defecto cuando sea posible.
- `moneda` debe ser obligatoria a nivel de provisioning comercial, aunque a nivel de columna puede iniciar nullable para migracion.
- `correo_facturacion` no debe mezclarse con `correo_contacto_principal`.

---

## Migracion 2: crear `commercial_plans`

### Objetivo

Definir lo que se vende.

### Campos

- `id uuid primary key`
- `code text not null unique`
- `name text not null`
- `description text`
- `active boolean not null default true`
- `sort_order integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### SQL sugerido

```sql
CREATE TABLE IF NOT EXISTS public.commercial_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_plans_code_uidx UNIQUE (code)
);
```

---

## Migracion 3: crear `commercial_plan_prices`

### Objetivo

Separar la descripcion comercial del plan de su forma de cobro.

### Campos

- `id uuid primary key`
- `plan_id uuid not null`
- `billing_provider text not null`
- `provider_product_id text not null`
- `provider_price_id text not null`
- `currency text not null`
- `billing_interval text not null`
- `amount_cents integer not null`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Constraints

- `plan_id` como FK a `commercial_plans(id)`.
- `provider_price_id` unico.
- `provider_product_id` indexado.
- `billing_interval` con check si se quiere limitar a `month`, `year`, `one_time`.

### SQL sugerido

```sql
CREATE TABLE IF NOT EXISTS public.commercial_plan_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL,
    billing_provider text NOT NULL,
    provider_product_id text NOT NULL,
    provider_price_id text NOT NULL,
    currency text NOT NULL,
    billing_interval text NOT NULL,
    amount_cents integer NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_plan_prices_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.commercial_plans(id) ON DELETE CASCADE,
    CONSTRAINT commercial_plan_prices_provider_price_uidx UNIQUE (provider_price_id)
);

CREATE INDEX IF NOT EXISTS commercial_plan_prices_plan_id_idx
    ON public.commercial_plan_prices (plan_id, active);

CREATE INDEX IF NOT EXISTS commercial_plan_prices_provider_product_id_idx
    ON public.commercial_plan_prices (provider_product_id);
```

---

## Migracion 4: crear `commercial_plan_entitlements`

### Objetivo

Definir funciones, vistas, limites y features del plan con columnas explicitas.

### Campos

- `id uuid primary key`
- `plan_id uuid not null`
- `entitlement_key text not null`
- `value_type text not null`
- `enabled boolean not null default true`
- `limit_value numeric`
- `value_text text`
- `value_json jsonb`
- `limit_unit text`
- `scope text`
- `created_at timestamptz not null default now()`

### SQL sugerido

```sql
CREATE TABLE IF NOT EXISTS public.commercial_plan_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL,
    entitlement_key text NOT NULL,
    value_type text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    limit_value numeric,
    value_text text,
    value_json jsonb,
    limit_unit text,
    scope text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_plan_entitlements_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.commercial_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS commercial_plan_entitlements_plan_id_idx
    ON public.commercial_plan_entitlements (plan_id, entitlement_key);
```

### Nota

Aunque `value_json` existe para casos complejos, la logica principal no debe depender de JSON.

---

## Migracion 5: crear `commercial_plan_defaults`

### Objetivo

Definir valores iniciales que se aplican al aprovisionar un tenant.

### Campos

- `id uuid primary key`
- `plan_id uuid not null`
- `default_key text not null`
- `default_value text not null`
- `scope text`
- `created_at timestamptz not null default now()`

### SQL sugerido

```sql
CREATE TABLE IF NOT EXISTS public.commercial_plan_defaults (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL,
    default_key text NOT NULL,
    default_value text NOT NULL,
    scope text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_plan_defaults_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.commercial_plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS commercial_plan_defaults_plan_id_idx
    ON public.commercial_plan_defaults (plan_id, default_key);
```

---

## Migracion 6: crear `tenant_billing_accounts`

### Objetivo

Guardar estado comercial, vigencia y acceso del tenant.

### Campos

- `id uuid primary key`
- `tenant_id uuid not null`
- `plan_id uuid not null`
- `billing_provider text not null`
- `stripe_customer_id text not null`
- `stripe_subscription_id text`
- `stripe_price_id text`
- `billing_status text not null`
- `access_status text not null`
- `trial_ends_at timestamptz`
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `grace_until timestamptz`
- `cancel_at_period_end boolean not null default false`
- `activated_at timestamptz`
- `deactivated_at timestamptz`
- `last_stripe_event_id text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Constraints

- FK real a `organizaciones(id)`.
- FK real a `commercial_plans(id)`.
- `stripe_customer_id` unico.
- `stripe_subscription_id` unico cuando exista.
- index compuesto por `tenant_id`, `billing_status`, `access_status`.

### SQL sugerido

```sql
CREATE TABLE IF NOT EXISTS public.tenant_billing_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    billing_provider text NOT NULL,
    stripe_customer_id text NOT NULL,
    stripe_subscription_id text,
    stripe_price_id text,
    billing_status text NOT NULL,
    access_status text NOT NULL,
    trial_ends_at timestamptz,
    current_period_start timestamptz,
    current_period_end timestamptz,
    grace_until timestamptz,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    activated_at timestamptz,
    deactivated_at timestamptz,
    last_stripe_event_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_billing_accounts_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_billing_accounts_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.commercial_plans(id),
    CONSTRAINT tenant_billing_accounts_stripe_customer_uidx UNIQUE (stripe_customer_id),
    CONSTRAINT tenant_billing_accounts_stripe_subscription_uidx UNIQUE (stripe_subscription_id)
);

CREATE INDEX IF NOT EXISTS tenant_billing_accounts_tenant_id_idx
    ON public.tenant_billing_accounts (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_billing_accounts_status_idx
    ON public.tenant_billing_accounts (tenant_id, billing_status, access_status);
```

### Recomendaciones

- `billing_status` = estado del proveedor.
- `access_status` = decision de la app.
- `plan_id` siempre debe resolverse por backend, no por frontend.

---

## Migracion 7: crear `tenant_billing_events`

### Objetivo

Guardar eventos Stripe con trazabilidad e idempotencia.

### Campos

- `id uuid primary key`
- `tenant_id uuid not null`
- `stripe_event_id text not null`
- `stripe_event_type text not null`
- `stripe_customer_id text`
- `stripe_subscription_id text`
- `event_created_at timestamptz`
- `processed_at timestamptz`
- `processing_error text`
- `created_at timestamptz not null default now()`

### Constraints

- `stripe_event_id` unico.
- FK real a `organizaciones(id)`.
- Indice por `tenant_id` y `stripe_event_type`.

### SQL sugerido

```sql
CREATE TABLE IF NOT EXISTS public.tenant_billing_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    stripe_event_id text NOT NULL,
    stripe_event_type text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    event_created_at timestamptz,
    processed_at timestamptz,
    processing_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_billing_events_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_billing_events_stripe_event_uidx UNIQUE (stripe_event_id)
);

CREATE INDEX IF NOT EXISTS tenant_billing_events_tenant_id_idx
    ON public.tenant_billing_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_billing_events_type_idx
    ON public.tenant_billing_events (stripe_event_type, created_at DESC);
```

---

## Migracion 8: crear `tenant_plan_overrides`

### Objetivo

Permitir excepciones por tenant con vigencia.

### Campos

- `id uuid primary key`
- `tenant_id uuid not null`
- `override_key text not null`
- `override_value text not null`
- `value_type text not null`
- `reason text`
- `starts_at timestamptz`
- `ends_at timestamptz`
- `created_by uuid`
- `approved_by uuid`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### SQL sugerido

```sql
CREATE TABLE IF NOT EXISTS public.tenant_plan_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    override_key text NOT NULL,
    override_value text NOT NULL,
    value_type text NOT NULL,
    reason text,
    starts_at timestamptz,
    ends_at timestamptz,
    created_by uuid,
    approved_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_plan_overrides_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_plan_overrides_tenant_id_idx
    ON public.tenant_plan_overrides (tenant_id, override_key, starts_at, ends_at);
```

---

## Migracion 9: opcional `tenant_provisioning_jobs`

### Objetivo

Separar provisioning async y reintentos del webhook principal.

### Cuando conviene

Si el alta de tenant puede tardar por:

- creacion de usuarios;
- creacion de roles;
- aplicacion de defaults;
- generacion de rutas;
- integraciones externas.

### Campos

- `id uuid primary key`
- `tenant_id uuid`
- `source text not null`
- `status text not null`
- `step text not null`
- `attempts integer not null default 0`
- `last_error text`
- `started_at timestamptz`
- `finished_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### SQL sugerido

```sql
CREATE TABLE IF NOT EXISTS public.tenant_provisioning_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid,
    source text NOT NULL,
    status text NOT NULL,
    step text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_provisioning_jobs_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_provisioning_jobs_tenant_id_idx
    ON public.tenant_provisioning_jobs (tenant_id, status, created_at DESC);
```

---

## Orden recomendado de aplicacion

1. Extender `organizaciones`.
2. Crear `commercial_plans`.
3. Crear `commercial_plan_prices`.
4. Crear `commercial_plan_entitlements`.
5. Crear `commercial_plan_defaults`.
6. Crear `tenant_billing_accounts`.
7. Crear `tenant_billing_events`.
8. Crear `tenant_plan_overrides`.
9. Crear `tenant_provisioning_jobs` si se requiere asincronia.

---

## Reglas de integridad

- Todo `tenant_id` debe apuntar a `organizaciones`.
- Todo `plan_id` debe apuntar a `commercial_plans`.
- `stripe_event_id` debe ser unico.
- `stripe_customer_id` debe ser unico.
- `stripe_subscription_id` debe ser unico cuando exista.
- `access_status` no debe derivarse solo del proveedor.
- Ninguna decision de acceso debe depender del frontend.

---

## Resultado esperado

Despues de estas migraciones:

- el tenant nace con datos generales completos;
- el plan se resuelve de forma explicita;
- billing y acceso quedan separados;
- Stripe queda auditado;
- el provisioning es repetible e idempotente;
- el esquema comercial no depende de metadata.
