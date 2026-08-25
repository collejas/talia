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

### Implementacion de alineacion tenant, usuario y correo
- Se implemento el flujo que separa verificacion de correo e invitacion de acceso para tenants.
- Se agrego la tabla `tenant_access_invitations` para auditar el estado de confirmacion, invitacion y expiracion del acceso.
- Se aplico la migracion `supabase/migrations/20260701_090000_tenant_access_invitations.sql` en la base remota.
- Se confirmo en la base real que existen 5 organizaciones en total: 1 tenant maestro y 4 tenants adicionales.
- Se verifico que los 4 tenants distintos del maestro ya tienen `owner`, por lo que no se requirio backfill historico.

### Base de datos
- Tablas creadas o modificadas:
  - `tenant_access_invitations`
- Columnas agregadas:
  - `tenant_id`
  - `email`
  - `flow_kind`
  - `status`
  - `verification_token_hash`
  - `verification_sent_at`
  - `expires_at`
  - `verified_at`
  - `invited_at`
  - `invited_user_id`
  - `last_error`
- Constraints y FKs:
  - FK a `organizaciones(id)` con `ON DELETE CASCADE`
  - unique sobre `verification_token_hash`
  - checks para `flow_kind`, `status`, `email` y `verification_token_hash`
- Indices:
  - `(tenant_id, status, created_at desc)`
  - `(email)`
- Migracion aplicada:
  - `supabase/migrations/20260701_090000_tenant_access_invitations.sql`
- Notas operativas:
  - La tabla queda como registro intermedio para el flujo Stripe y para altas manuales futuras.
  - El tenant maestro de referencia sigue siendo `00000000-0000-0000-0000-000000000001`.

### Backend
- Servicios nuevos:
  - `backend/app/services/tenant_access_onboarding.py`
  - `backend/app/api/routes/public_auth.py`
- Reglas de validacion:
  - el correo primero se confirma;
  - despues se envia la invitacion o activacion;
  - el usuario inicial se consolida con rol `owner`.
- Reglas de idempotencia:
  - el token se guarda con hash;
  - el estado pasa por `pending_verification`, `email_verified`, `completed`, `failed` o `expired`.
- Integracion Stripe:
  - el provisioning de Stripe ahora dispara la confirmacion de correo como paso previo a la invitacion.
- Notas operativas:
  - la confirmacion de correo usa un endpoint publico y luego el backend ejecuta la invitacion de Supabase.

### Frontend
- Vistas creadas o modificadas:
  - `/auth/confirm-email`
- Formularios ajustados:
  - componente de confirmacion de correo con autoenvio del token.
- Estados mostrados:
  - confirmando, exito y error de verificacion.
- Acciones de administracion:
  - el alta manual ahora usa invitacion directa, no flujo de recovery.
- Cambios UX/UI:
  - el mensaje de correo quedó alineado a activacion/invitacion, no a cambio de contrasena.
- Notas operativas:
  - la pagina de confirmacion reenvia el token al backend sin exponer la logica comercial en el frontend.

### Operacion/Notas
- Se reviso la base real con Supabase MCP.
- Existen 5 organizaciones en total y 4 tenants adicionales al maestro.
- No se detectaron tenants sin `owner`.
- No se ejecuto backfill porque no era necesario.

### Documentación
- Se creó el directorio formal del plan maestro comercial.
- Se documentó la capa comercial, de billing, tenant config y runtime en `PLAN_MAESTRO_COMERCIAL.md`.
- Se agregó `ALINEACION_FLUJO_TENANT_USUARIO_CORREO.md` como bloque previo obligatorio para alinear alta de tenant, usuario admin y correo antes de continuar con Stripe.
- Se agregó el documento funcional `ALTA_TENANT_DESDE_STRIPE.md` para definir el alta comercial desde Stripe.
- Se agregó `IMPLEMENTACION_ALTA_TENANT_STRIPE.md` para separar la implementación por base de datos, backend y frontend.
- Se agregó `MIGRACIONES_ALTA_TENANT_STRIPE.md` con migraciones exactas sugeridas para PostgreSQL/Supabase.
- Se agregó este `README.md` como índice operativo del plan.
- Se incorporó al plan maestro la regla de acceso inicial por correo verificado antes de enviar la invitación o activación del usuario `owner`.
- Se alineó `IMPLEMENTACION_ALTA_TENANT_STRIPE.md` con la secuencia final de acceso: pago, verificación de correo, invitación, usuario `owner` y provisioning.

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

---

## v0.4 - Webhook Stripe de sincronización comercial

### Backend
- Se agregó `POST /webhooks/stripe` como webhook público firmado.
- Se valida `Stripe-Signature` con HMAC y ventana de tolerancia.
- Se persisten eventos en `tenant_billing_events` para auditoría e idempotencia.
- Se resuelve el tenant por:
  - cuenta Stripe existente,
  - suscripción existente,
  - referencia comercial del evento cuando aplica.
- Se actualiza `tenant_billing_accounts` con estado de cobro, acceso, customer, subscription y price.

### Seguridad / operación
- Los eventos duplicados se ignoran si ya fueron procesados.
- Los eventos fallidos se registran con error para reintento controlado.
- Si el webhook no tiene secreto configurado, responde `503`.

### Resultado
- Stripe ya puede empujar el estado comercial a la base y al backend sin depender del frontend.

---

## v0.5 - Checkout y portal Stripe desde el detalle del tenant

### Backend
- Se agregaron endpoints administrativos para billing:
  - `POST /admin/tenants/{organizacion_id}/billing/checkout-session`
  - `POST /admin/tenants/{organizacion_id}/billing/portal-session`
- Se añadió la creación automática de cliente Stripe cuando el tenant aún no tiene `stripe_customer_id` real.
- Se resolvió el precio activo de Stripe desde `commercial_plan_prices` para el plan del tenant antes de generar checkout.
- Se mantuvo la separación entre:
  - `billing_status`
  - `commercial_access_status`
  - `commercial_plan_id`

### Frontend
- Se agregó el bloque `Stripe` en el detalle de `settings/tenants/{tenantId}`.
- Se añadieron acciones para:
  - abrir checkout,
  - abrir el portal de cliente.
- Se deshabilitan las acciones si el tenant no tiene plan comercial o no tiene customer Stripe válido.

### Operación/Notas
- Esta iteración deja al `platform_admin` con un flujo controlado para generar cobro y administrar billing sin salir del panel.
- El alta manual de tenants sigue siendo posible sin Stripe, pero ahora también existe la ruta comercial para activar el cobro cuando corresponda.

---

## v0.6 - Aprovisionamiento automático del tenant desde billing

### Backend
- Se agregó el servicio `Billing::ProvisioningService` para aprovisionar el tenant de forma idempotente cuando Stripe ya dejó el billing en estado activo o trialing.
- Se integró la cola de aprovisionamiento con `tenant_provisioning_jobs` para registrar inicio, cierre y errores del proceso.
- Se aplican defaults comerciales del plan al tenant antes de completar el aprovisionamiento.
- Se crean o aseguran:
  - recursos de calendario,
  - etapas de pipeline,
  - permisos base,
  - rol `owner`,
  - catálogos iniciales de departamentos y puestos.

### Seguridad / operación
- El aprovisionamiento sigue sin depender del frontend.
- El proceso sigue siendo idempotente por evento y deja rastro si falla.
- Si el provisioning falla, el webhook marca el evento como fallido para permitir reintento controlado.

### Resultado
- Un pago válido ya puede dejar al tenant no solo cobrado, sino también listo a nivel operativo inicial para entrar a la plataforma.

---

## v0.7 - Alta pública de tenant con checkout Stripe

### Backend
- Se agregó la ruta pública `GET /public/billing/commercial-plans` para listar planes activos y sus precios activos de Stripe.
- Se agregó la ruta pública `POST /public/billing/checkout` para crear un tenant nuevo, crear su customer Stripe y abrir el checkout.
- El alta pública usa columnas explícitas de `organizaciones` para datos generales del cliente.
- El tenant se crea en estado inactivo hasta que el webhook Stripe confirme el cobro.
- Se deja creada la cuenta de billing con estado `incomplete` para mantener trazabilidad desde el primer paso.

### Seguridad / operación
- El flujo público no depende del frontend para decidir precios ni estado comercial.
- El price de Stripe se valida desde la tabla comercial antes de generar checkout.
- Si falla la creación del checkout, el tenant creado se elimina como rollback best-effort.

### Resultado
- Ya existe el flujo base para que un usuario elija un plan, pague en Stripe y deje al sistema listo para activar el tenant automáticamente cuando el webhook confirme la compra.

---

## v0.8 - Checkout público en la página de precios

### Frontend
- Se agregó la sección de alta comercial en `/precios` para cargar planes activos desde `GET /public/billing/commercial-plans`.
- Se agregó el formulario público para capturar datos mínimos del tenant y preparar el checkout de Stripe.
- Se añadieron tarjetas dinámicas por plan y por precio, con selección directa de la modalidad a contratar.
- Se agregó manejo visual para retorno de Stripe en la misma página mediante `?checkout=success` y `?checkout=cancel`.

### Backend / contrato
- El frontend ahora consume `POST /public/billing/checkout` como punto de entrada para crear el tenant y abrir Stripe.
- El flujo conserva la regla de que el tenant se crea inactivo y solo se activa por webhook confirmado.

### Operación/Notas
- La página comercial ya no depende solo de WhatsApp o demo para iniciar un alta.
- Para producción, `STRIPE_CHECKOUT_SUCCESS_URL` y `STRIPE_CHECKOUT_CANCEL_URL` deben apuntar a la página de precios con el query param correspondiente.
- El checkout queda acoplado a precios activos de Stripe publicados desde la base de datos comercial.

---

## 2026-08-25

### Frontend
- Se documentó la propuesta de navegación para separar la administración comercial de la operación de cobro.
- Se definió una sección lateral propia **Comercial** para perfiles de plataforma.
- Se mantuvo `/settings/commercial-plans` como entrada del catálogo de planes.
- Se propuso abrir el detalle de cada plan en `/settings/commercial-plans/{plan_id}` con pestañas para `General`, `Precios y Stripe`, `Entitlements`, `Defaults` y `Límites de prospección`.
- Se propuso reservar `Billing / Stripe` para customers, suscripciones, webhooks, estados de cobro y errores de sincronización.

### Operación/Notas
- La configuración del catálogo comercial y la operación de billing son dominios relacionados, pero no deben vivir en una sola vista larga.
- `tenant_billing_accounts` y `tenant_billing_events` no deben exponerse como CRUD libre en el catálogo.
- Esta entrada documenta la arquitectura objetivo; la implementación frontend queda pendiente.

### Corrección de arquitectura de navegación
- Se descartó `/settings/commercial-plans` como entrada del módulo.
- La sección lateral **Comercial** tendrá como entrada única `/settings/commercial`.
- Las vistas objetivo quedan bajo `/settings/commercial/plans` y `/settings/commercial/billing`.
- La ruta anterior debe considerarse heredada y no debe usarse en la nueva implementación.

### Corrección de autorización
- Se definió que la sección **Comercial** solo será visible y operable para el usuario `owner` del tenant maestro dueño de la aplicación.
- Los `owner` y administradores de tenants clientes no podrán consultar ni modificar planes, precios, entitlements, defaults o Billing/Stripe global.
- La autorización deberá validarse en backend por endpoint; el ocultamiento del menú en frontend será únicamente una mejora de UX.
