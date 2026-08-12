# Inventario actual de correo y Brevo

## Resumen

La app tiene dos familias de correo que deben distinguirse durante la migración:

1. Correo transaccional: invitaciones, confirmaciones, cotizaciones, portal, propuestas, notificaciones y otros flujos de la aplicación.
2. Correo de prospección/campañas: plantillas, lotes, seguimiento de eventos, métricas, programación y cuota.

Brevo aparece directamente en ambos grupos, mientras que algunos flujos fuerzan SMTP del buzón del usuario. Por eso el objetivo de “cero Brevo” requiere revisar también los caminos que hoy no pasan por `provider_preference="brevo"`.

## Backend

### Capa común

- `backend/app/services/email.py`
  - Expone `send_email` y `send_email_detailed`.
  - Soporta `smtp`, `brevo` y `auto`.
  - Devuelve `local_message_id` y `provider_message_id`.
  - Tiene lógica de adjuntos, HTML/texto, Message-ID y copia IMAP en enviados.
- Se documenta como referencia del sistema anterior. La implementación Postmark no se agregará dentro de este módulo; tendrá servicios y contratos propios.

- `backend/app/services/tenant_runtime.py`
  - Resuelve `MailRuntimeSettings` desde buzones de usuario/tenant.
  - Resuelve `BrevoRuntimeSettings` desde configuración global/tenant y secretos.
  - Debe evolucionar hacia configuración explícita de Postmark y dominio remitente.

### Integración Brevo existente

- `backend/app/services/brevo.py`
  - Procesa eventos de Brevo.
  - Traduce estados a `enviado`, `entregado` y `fallido`.
  - Procesa inbound y sincroniza eventos con envíos y conversaciones.
  - Aplica supresiones ante bajas o eventos negativos.

- `backend/app/services/brevo_quota.py`
  - Consulta cuenta y reporte diario de Brevo.
  - Calcula enviados, límite, restantes y porcentaje.
  - Debe reemplazarse por el ledger de cuota propio de Talia; Postmark no será la fuente de autoridad de cuotas por tenant.

- `backend/app/services/brevo_templates.py`
  - Lista y obtiene plantillas SMTP remotas de Brevo.
  - Debe eliminarse después de crear y validar las plantillas nuevas de Postmark.

- `backend/app/services/prospeccion_contact_sender.py`
  - Renderiza plantillas locales y construye URLs de tracking.
  - En el envío de correo de prospección fuerza `provider_preference="brevo"`.
  - Debe reemplazarse por un servicio Postmark nuevo que conserve la funcionalidad de negocio, pero use sus propios contratos y tablas con columnas explícitas.

- `backend/app/services/prospeccion_email_inbound_reader.py`
  - Actualmente lee buzones por IMAP y reutiliza el procesamiento inbound asociado a Brevo.
  - El inbound Postmark se implementará en un flujo nuevo. Este lector no se reutilizará ni se convertirá en una capa compartida.

### Rutas identificadas

- `backend/app/api/routes/crm.py`
  - `GET /settings/email-template`
  - `PUT /settings/email-template`
  - `GET /prospeccion/contacto/templates`
  - `GET /prospeccion/contacto/templates/brevo-catalog`
  - `POST /prospeccion/contacto/templates/import-brevo`
  - `GET /prospeccion/contacto/brevo-quota`
  - `POST /prospeccion/contacto/brevo/webhook`
  - Rutas de envíos, programación, métricas y cotizaciones que llaman a servicios de correo.

Estas rutas pertenecen exclusivamente al sistema anterior y no serán reutilizadas por Postmark. Se retirarán después de migrar el último tenant y verificar que no existan dependencias.

## Panel

### Campañas y plantillas

- `frontend/panel/src/app/prospeccion/campanas/page.client.tsx`
  - Carga catálogo Brevo.
  - Importa plantillas Brevo.
  - Presenta métricas con nombres `brevo_aperturas` y `brevo_clicks`.
  - Muestra estados y errores específicos de Brevo.

- `frontend/panel/src/app/api/prospeccion/contacto/templates/brevo-catalog/route.ts`
- `frontend/panel/src/app/api/prospeccion/contacto/templates/import-brevo/route.ts`
- `frontend/panel/src/app/api/prospeccion/contacto/brevo-quota/route.ts`

La UI nueva tendrá endpoints y contratos propios de Postmark o neutrales, sin reutilizar estos adapters. La UI de operación debe hablar de “Correo”, “Cuota” y “Dominio de envío”, no de Brevo/Postmark.

### Cuota

- `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx`
- `frontend/panel/src/app/prospeccion/metricas/page.client.tsx`

Actualmente presentan cuota y errores de Brevo. Deben consumir el ledger de Talia con una respuesta neutral: `limite`, `usados`, `reservados`, `disponibles`, `periodo` y `estado`.

## Base de datos y métricas

Entidades existentes relevantes:

- `public.prospeccion_contacto_batch`
- `public.prospeccion_contacto_envio`
- `public.prospeccion_contactos_log`
- `public.prospeccion_contacto_templates`
- campañas de prospección y tablas de sesiones/atribución.

Estas entidades se documentan como referencias del negocio actual. No se usarán como tablas de almacenamiento de Postmark. El nuevo flujo tendrá tablas propias y solo podrá relacionarse con campañas, contactos y sesiones mediante referencias explícitas.

Puntos de acoplamiento detectados:

- `supabase/migrations/20260228_020000_prospeccion_brevo_eventos_resumen.sql`
- `supabase/migrations/20260301_193000_prospeccion_metricas_entregados_incluye_leidos.sql`
- `supabase/migrations/20260301_211000_prospeccion_metricas_campana_rango_sid.sql`
- `supabase/migrations/20260811_150000_prospeccion_log_tenant_envio_idx.sql`
- Las funciones de atribución calculan campos llamados `brevo_aperturas` y `brevo_clicks` a partir de `detalle`.

La migración debe separar el concepto de proveedor del concepto de negocio. Los nombres de salida recomendados son `aperturas`, `clics`, `entregados`, `rebotes` y `quejas`, reservando `provider`/`provider_message_id` para auditoría técnica.

## Configuración y secretos

La configuración actual incluye:

- API key/base URL/remitente de Brevo en runtime global o por tenant.
- Configuración SMTP de usuarios y tenant en `usuarios_correo_config`/runtime.
- `mail_habilitado` como gate de algunos envíos de buzón.

La nueva configuración global mínima será:

- `POSTMARK_ACCOUNT_TOKEN`, solo backend y tareas administrativas de dominios/servers.
- `POSTMARK_SERVER_TOKEN_TRANSACTIONAL`, solo backend.
- `POSTMARK_SERVER_TOKEN_BROADCAST`, solo backend.
- IDs de streams y configuración de webhooks.

La configuración de cada tenant deberá persistir como columnas explícitas: dominio, estado, dominio DKIM, Return-Path, remitente, Reply-To y fecha de verificación. No se debe esconder esta información estructural en `metadata` o `config` JSONB.
