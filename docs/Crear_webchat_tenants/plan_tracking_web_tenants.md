# Tracking de sitios web por tenant

## Estado del documento

- **Estado:** propuesta técnica para implementación.
- **Alcance:** seguimiento first-party de sitios web externos de los tenants, atribución UTM/referrer y visualización en `mapa-de-conversion`.
- **Fecha:** 2026-08-15.
- **Dependencias existentes:** `web_sessions`, `POST /api/crm/web/visit`, `site-tracking.js`, `modules/visit-tracking.js` y `mapa-de-conversion`.

## 1. Objetivo

Permitir que un tenant copie un único fragmento de código en su sitio web y pueda consultar en Talia:

- sesiones y visitas web;
- páginas de entrada y páginas visitadas;
- referrers y dominios de origen;
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` y `utm_content`;
- identificadores de campañas (`cid`, `tid`, `eid`) cuando estén presentes;
- dispositivos y ubicación disponible;
- relación posterior con contactos, conversaciones y oportunidades.

La información debe continuar alimentando `mapa-de-conversion` sin crear una segunda taxonomía de atribución.

## 2. Regla obligatoria de modelado de datos

### Prohibición para tablas nuevas

Todas las tablas nuevas de esta funcionalidad deben usar columnas explícitas. Queda prohibido guardar información estructural o consultable del tracking en:

- `metadata`;
- `json` o `jsonb`;
- `payload`;
- `data`;
- `extras`;
- `config`;
- `settings`;
- cualquier columna equivalente que esconda campos de negocio.

Si un dato se consulta, filtra, ordena, valida, relaciona, reporta, audita o se muestra en el panel, debe existir como columna real con tipo, constraint e índice cuando corresponda.

### Excepción

No se autoriza ninguna excepción para esta feature sin una decisión escrita y aprobada antes de crear la migración. La preferencia por defecto es no utilizar JSON en absoluto en las tablas nuevas.

La columna `web_sessions.metadata` existente se conserva por compatibilidad histórica, pero no se debe ampliar para guardar nuevos campos de tracking. Todo dato nuevo debe llegar a una columna explícita o a una tabla relacionada.

## 3. Diagnóstico de la implementación actual

### Componentes reutilizables

El flujo actual ya tiene una base válida:

```text
site-tracking.js
  -> POST /api/crm/web/visit
  -> record_web_session()
  -> public.web_sessions
  -> API de visitas / mapa-de-conversion
```

`web_sessions` ya contiene columnas para tenant, sesión, UTM, referrer, campaña, dispositivo, geografía y contacto.

### Limitaciones que deben corregirse

1. `site-tracking.js` resuelve el tenant mediante alias de Webchat o configuración relativa al dominio actual. El alias de Webchat no debe ser la identidad de una instalación de tracking.
2. `visit-tracking.js` usa por defecto `'/api/crm'`. Desde un dominio externo esa URL apunta al dominio del tenant, no al backend de Talia.
3. El collector actual actualiza una fila por sesión. Al navegar, aumenta `visit_count`, pero no conserva un historial normalizado de cada página visitada.
4. El script actual envía información amplia del navegador y solicita geolocalización. Para clientes debe aplicarse consentimiento, minimización y límites de retención.
5. El endpoint público recibe tráfico no confiable. El navegador nunca debe enviar `organizacion_id`; el backend debe resolver el tenant mediante una instalación pública registrada y un dominio autorizado.

## 4. Experiencia propuesta para el tenant

En `settings/variables` se agregará una pestaña:

```text
Página Web
```

### 4.1 Estado de tracking

Campos visibles:

- Tracking habilitado.
- Consentimiento requerido.
- Identificador público de sitio.
- Estado de instalación: `pendiente`, `recibiendo_datos`, `inactivo` o `bloqueado`.
- Último evento recibido.
- Último dominio detectado.

### 4.2 Dominios autorizados

El tenant podrá registrar uno o más dominios:

```text
cliente.com
www.cliente.com
landing.cliente.com
```

Cada dominio tendrá estado propio:

- pendiente;
- verificado;
- rechazado;
- inactivo.

La comparación debe normalizar protocolo, mayúsculas, puerto, `www` según la política definida y trailing slash, sin guardar la normalización dentro de JSON.

### 4.3 Código de instalación

El panel generará un solo snippet:

```html
<script
  async
  src="https://app.talia.mx/assets/js/talia-tracking.js"
  data-site-id="talia_site_PUBLIC_ID">
</script>
```

El `data-site-id` es público y no es un secreto. No debe contener la clave primaria de la organización ni permitir modificar el tenant. El botón principal será `Copiar código`.

### 4.4 Instrucciones

La pestaña mostrará instrucciones para:

1. copiar el snippet;
2. pegarlo antes de `</head>` en todas las páginas, o en el layout global del CMS;
3. publicar el sitio;
4. abrir una página del dominio registrado;
5. validar que aparezca el último evento en el panel.

También incluirá instrucciones específicas para HTML, WordPress/PHP, Next.js y Google Tag Manager.

### 4.5 Diagnóstico

El tenant podrá ver:

- código generado;
- último evento aceptado;
- dominio que originó el evento;
- última URL de entrada;
- último UTM recibido;
- error de dominio no autorizado;
- error de CORS;
- script no detectado;
- fecha de instalación.

## 5. Script universal

Se creará un archivo estable y versionable:

```text
landing/src/assets/js/talia-tracking.js
```

El archivo será autocontenido para el consumidor. No debe depender de importar un módulo relativo desde el dominio del tenant.

### Responsabilidades

- leer `data-site-id` desde `document.currentScript`;
- enviar a una URL absoluta de Talia;
- crear un `session_id` aleatorio y renovarlo por TTL;
- capturar UTM y parámetros publicitarios permitidos;
- capturar `document.referrer`;
- registrar `page_view` para navegación tradicional y SPA;
- usar `sendBeacon` para salida de página cuando aplique;
- evitar duplicados por URL y sesión;
- respetar consentimiento y `navigator.doNotTrack`;
- no enviar secretos, tokens ni `organizacion_id`;
- limitar longitud y cantidad de campos enviados;
- fallar silenciosamente sin afectar la página del tenant.

### Parámetros aceptados

Los campos mínimos del collector serán explícitos:

```text
site_id
session_id
event_type
page_url
page_path
page_title
referrer
utm_source
utm_medium
utm_campaign
utm_term
utm_content
gclid
fbclid
msclkid
ttclid
device_type
language
timezone
screen_width
screen_height
viewport_width
viewport_height
```

Los campos que se persistan deberán existir como columnas en la tabla correspondiente. El payload HTTP puede ser un objeto JSON por necesidad del protocolo, pero no se debe persistir como columna JSON ni usarlo como contrato interno de negocio.

## 6. Modelo de datos nuevo

### 6.1 `tenant_web_tracking_sites`

Representa una instalación pública de tracking por tenant.

Columnas mínimas:

```text
id uuid primary key
organizacion_id uuid not null references organizaciones(id)
public_site_id text not null unique
active boolean not null default true
consent_required boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
last_event_at timestamptz null
```

Constraints e índices:

- `public_site_id` único;
- foreign key e índice por `organizacion_id`;
- índice parcial para instalaciones activas;
- RLS por `organizacion_id`;
- `public_site_id` con longitud y formato validados;
- prohibido aceptar `organizacion_id` desde el navegador.

### 6.2 `tenant_web_tracking_domains`

Representa los dominios autorizados para una instalación.

Columnas mínimas:

```text
id uuid primary key
tracking_site_id uuid not null references tenant_web_tracking_sites(id)
organizacion_id uuid not null references organizaciones(id)
domain text not null
domain_normalized text not null
verification_method text not null
verification_status text not null
verified_at timestamptz null
active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Constraints e índices:

- `tracking_site_id` y `organizacion_id` obligatorios;
- foreign keys con índices;
- `unique(tracking_site_id, domain_normalized)`;
- índice `domain_normalized, active` para validar eventos rápidamente;
- `verification_method` limitado a valores definidos, por ejemplo `dns`, `html_file` o `manual`;
- `verification_status` limitado a `pending`, `verified`, `rejected`, `inactive`;
- no se debe permitir un dominio activo asociado simultáneamente a tenants diferentes.

### 6.3 `web_tracking_events`

Se recomienda para conservar el historial de páginas y eventos. `web_sessions` seguirá siendo el resumen de sesión y la fuente compatible de la vista actual.

Columnas mínimas:

```text
id uuid primary key
organizacion_id uuid not null references organizaciones(id)
tracking_site_id uuid not null references tenant_web_tracking_sites(id)
tracking_domain_id uuid null references tenant_web_tracking_domains(id)
session_id text not null
event_type text not null
occurred_at timestamptz not null
page_url text null
page_path text null
page_title text null
referrer text null
referrer_host text null
utm_source text null
utm_medium text null
utm_campaign text null
utm_term text null
utm_content text null
gclid text null
fbclid text null
msclkid text null
ttclid text null
device_type text null
language text null
timezone text null
screen_width integer null
screen_height integer null
viewport_width integer null
viewport_height integer null
country_code text null
country_name text null
contacto_id uuid null references contactos(id)
created_at timestamptz not null default now()
```

Índices mínimos:

- `(organizacion_id, occurred_at desc)`;
- `(tracking_site_id, occurred_at desc)`;
- `(organizacion_id, event_type, occurred_at desc)`;
- `(organizacion_id, session_id, occurred_at)`;
- `(organizacion_id, utm_source, utm_medium, utm_campaign)`;
- `(organizacion_id, referrer_host, occurred_at desc)`;
- `(organizacion_id, contacto_id)` cuando se habilite la asociación.

Constraints recomendados:

- `event_type` limitado inicialmente a `page_view`, `cta_click`, `form_submit` y `whatsapp_click`;
- longitudes máximas para URL, referrer y UTM;
- dimensiones de pantalla no negativas;
- `occurred_at` dentro de una ventana razonable respecto al servidor para evitar abuso;
- `organizacion_id` consistente con la instalación y el dominio.

No se agregará una columna `metadata` a esta tabla.

## 7. API propuesta

### Endpoint público de ingestión

```text
POST /api/tracking/events
```

Responsabilidad única: validar e insertar/actualizar el evento recibido.

El contrato de entrada debe tener un schema Pydantic explícito, con campos equivalentes a las columnas anteriores. No debe aceptar:

- `organizacion_id`;
- `tracking_site_id` interno;
- campos libres de configuración;
- objetos arbitrarios de metadata.

El backend debe:

1. validar `public_site_id`;
2. resolver la instalación activa;
3. validar dominio/origen contra dominios verificados;
4. resolver `organizacion_id` en servidor;
5. normalizar UTM, host y URLs;
6. aplicar rate limit;
7. persistir columnas explícitas;
8. actualizar `web_sessions` sin perder el primer UTM válido;
9. responder sin exponer información interna.

### Endpoints privados del panel

```text
GET    /api/tracking/sites
POST   /api/tracking/sites
PATCH  /api/tracking/sites/{id}
GET    /api/tracking/sites/{id}/domains
POST   /api/tracking/sites/{id}/domains
PATCH  /api/tracking/domains/{id}
POST   /api/tracking/domains/{id}/verify
GET    /api/tracking/sites/{id}/installation
GET    /api/tracking/sites/{id}/health
GET    /api/crm/visitas/web-sessions
GET    /api/tracking/events
```

Los endpoints privados deben usar autenticación, permiso `reports.view` para métricas y un permiso administrativo/operativo separado para registrar o modificar dominios.

## 8. CORS y seguridad

- El collector usará la URL absoluta de Talia.
- CORS permitirá únicamente dominios `verified` y `active`.
- No se debe configurar `allow_origins="*"` para este flujo.
- `Origin` y `Referer` son señales de validación, no secretos.
- `public_site_id` es identificador público, no credencial.
- Se aplicará rate limit por IP, dominio y sitio público.
- No se registrarán tokens, cookies, headers completos ni payloads completos en logs.
- La geolocalización precisa del navegador será opt-in y no forma parte del MVP.
- Se respetará `Do Not Track` y el estado de consentimiento del sitio.
- RLS debe impedir que un tenant consulte eventos de otro tenant.
- Se establecerá retención y purga para eventos antiguos antes de producción.

## 9. Reglas de atribución

La nueva feature debe reutilizar las reglas de `mapa-de-conversion`:

- `source_class=campaign` cuando exista UTM;
- `source_class=organic_search` para buscadores reconocidos;
- `source_class=organic_social` para redes reconocidas;
- `source_class=referral` para otros dominios;
- `source_class=direct` sin referrer ni UTM.

Debe distinguirse claramente entre:

- sesiones;
- sesiones con contacto;
- contactos únicos;
- conversaciones;
- oportunidades.

Una sesión repetida no equivale a un contacto nuevo ni a una conversión.

## 10. Plan de implementación

### Fase 0: diseño y contrato

- [ ] Confirmar dominio canónico de la aplicación.
- [ ] Definir formato de `public_site_id`.
- [ ] Definir política de normalización de dominios.
- [ ] Definir retención de eventos.
- [ ] Confirmar permisos y roles.
- [ ] Revisar CORS actual y proxy de producción.

### Fase 1: base de datos

- [x] Diseñar migración para `tenant_web_tracking_sites`.
- [x] Diseñar migración para `tenant_web_tracking_domains`.
- [x] Aplicar la migración y validar en Supabase la estructura RLS para `authenticated` y `service_role` (2026-08-15); queda pendiente la prueba funcional con JWT representativo.
- [x] Validar índices y constraints en Supabase (estructura y conteos iniciales validados, 2026-08-15).
- [x] Cubrir la FK compuesta de dominios con `(tracking_site_id, organizacion_id)` y retirar el índice simple redundante (2026-08-15).
- [ ] Crear migración para `web_tracking_events` si se habilita historial de páginas.
- [ ] Agregar foreign keys, constraints, índices y RLS.
- [ ] Verificar planes con `EXPLAIN` para filtros por tenant, fecha, UTM y dominio.
- [ ] No usar columnas `metadata`, `json`, `jsonb`, `payload`, `config` o equivalentes.

### Fase 2: backend

- [ ] Crear schemas Pydantic separados para instalación, dominio, evento y respuesta.
- [ ] Crear repository y service de tracking.
- [ ] Crear endpoint público de ingestión.
- [ ] Implementar resolución `public_site_id` → instalación → tenant.
- [ ] Implementar validación de dominio y rate limit.
- [ ] Mantener compatibilidad con `POST /api/crm/web/visit` durante la migración.

### Fase 3: script

- [ ] Crear `talia-tracking.js` autocontenido.
- [ ] Eliminar dependencia de alias de Webchat para el tracking.
- [ ] Usar URL absoluta de ingestión.
- [ ] Agregar consentimiento y `Do Not Track`.
- [ ] Validar navegación tradicional y SPA.
- [ ] Versionar el script con una estrategia de cache busting controlada.

### Fase 4: panel

- [ ] Agregar pestaña `Página Web` en `settings/variables`.
- [ ] Crear gestión de dominios.
- [ ] Crear generación y copia del snippet.
- [ ] Crear estado de instalación y diagnóstico.
- [ ] Mostrar instrucciones por plataforma.
- [ ] No colocar secretos en el snippet.

### Fase 5: mapa y validación

- [ ] Reutilizar `web_sessions` para sesiones y UTM.
- [ ] Incorporar eventos de página únicamente si el producto necesita recorrido detallado.
- [ ] Validar filtros por tenant, fechas, UTM, referrer y dominio.
- [ ] Comparar sesiones, contactos únicos y conversiones con etiquetas no ambiguas.
- [ ] Probar con tres tenants existentes antes de habilitar nuevos clientes.

## 11. Criterios de aceptación

La feature no se considerará lista hasta demostrar:

- un tenant puede copiar un único snippet;
- el script funciona en HTML, WordPress/PHP y SPA;
- una visita se atribuye al tenant correcto sin enviar `organizacion_id`;
- un dominio no autorizado no puede generar datos para otro tenant;
- UTM y referrer llegan a `web_sessions` y aparecen en `mapa-de-conversion`;
- los datos de un tenant no aparecen en otro;
- los filtros importantes usan columnas e índices reales;
- no existe ninguna tabla nueva con `metadata`, `json`, `jsonb`, `payload`, `config` o equivalente;
- el panel muestra instalación, último evento y errores accionables;
- se validan CORS, rate limit, consentimiento y retención;
- se miden latencia y planes de consulta con datos representativos.

## 12. Decisión recomendada

Implementar un collector first-party universal de Talia con:

```text
un script público
+ un public_site_id por instalación
+ dominios autorizados por tenant
+ endpoint absoluto multi-tenant
+ web_sessions como resumen compatible
+ web_tracking_events para historial detallado opcional
+ columnas explícitas en todas las tablas nuevas
```

El alias de Webchat debe seguir existiendo para resolver Webchat, pero no debe ser la identidad principal del seguimiento del sitio web.
