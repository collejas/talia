# Plan de Implementacion: Dashboard Multitenant (Next.js + FastAPI)

> Alineación operativa: este plan se interpreta como `tenant maestro + tenants de renta`, con control de acceso y trazabilidad segregados por institución.

## Estado de avance (al 2026-04-21)

- [x] Infra: Nginx con landing `/` + dashboard en `/dashboard/*` + API en `/admin/*` + inbound PUI en `/pui/*`.
- [x] Infra: subdominios por ambiente:
  - QA/Sandbox `https://pui-qa.geoactiv.mx/pui` (TLS activo).
  - Productivo `https://pui-prod.geoactiv.mx/pui` (TLS activo).
- [x] Backend (FastAPI): autenticación/admin y contexto tenant:
  - `POST /admin/auth/login`, `GET /admin/me`, `POST /admin/auth/logout`, `POST /admin/tenant-context`, `GET /admin/tenants`.
- [x] Backend (FastAPI): integraciones por tenant:
  - `GET /admin/integrations`, `POST /admin/integrations/{id}/activate|deactivate|connectivity-test`.
- [x] Backend (FastAPI): auditoría operativa:
  - `GET /admin/audit/requests` + `GET /admin/audit/requests/{request_id}/fields`.
- [x] Backend (FastAPI): reportes/fases:
  - `GET /admin/reports`, `GET /admin/reports/{id}`, `GET /admin/reports/{id}/phases`, `GET /admin/reports/{id}/deactivations`.
- [x] Backend (FastAPI): compliance (SAST/DAST/SCA) + descarga de evidencias:
  - `GET /admin/compliance/status|policy|evidence`, `POST /admin/compliance/evidence`, `GET /admin/compliance/evidence/{id}/artifact`.
  - Fix aplicado: `GET /admin/compliance/evidence` ya no responde `500` (normalización de UUID → string en responses).
- [x] Frontend (Next.js): rutas implementadas bajo `basePath=/dashboard`:
  - `/dashboard/login`, `/dashboard`, `/dashboard/integraciones`, `/dashboard/auditoria`, `/dashboard/reportes`, `/dashboard/reportes/<id>`, `/dashboard/compliance`, `/dashboard/institucion`, `/dashboard/onboarding`, `/dashboard/inscripcion`, `/dashboard/credenciales`, `/dashboard/monitoreo`, `/dashboard/usuarios`, `/dashboard/roles`, `/dashboard/perfil`, `/dashboard/qa`.
- [x] GitHub Actions: evidencia de seguridad para Compliance:
  - SAST: Semgrep (artefacto) + CodeQL (SARIF como artefacto, útil en repos privados sin habilitar Code Scanning).
  - DAST: OWASP ZAP baseline (workflow_dispatch) contra URL por ambiente.
  - DAST API: OWASP ZAP API-scan autenticado con JWT + `openapi.json` por ambiente (`Security - DAST API (OWASP ZAP)`).
  - SCA: pip-audit (y/o npm audit según aplique).
- [x] Evidencias cargadas en Compliance (tenant `geoactiv-pui-sbx`):
  - QA: SAST/DAST/SCA en OK.
  - Productivo: SAST/DAST/SCA en OK.
- [x] Cierre de cumplimiento estricto del Manual (URL_BASE + endpoints, cero High/Medium/Low):
  - `/pui` responde `application/json` (sin redirects HTML) en `pui-qa` y `pui-prod`.
  - DAST API (OpenAPI + JWT) ejecutado en QA y Productivo sin High/Medium/Low.
  - Evidencia consolidada: `Archivos_cumplimiento/expediente_2026-04-20_012002/`.
- [x] Modo demo/sandbox de presentacion:
  - banner visible en dashboard,
  - preset de sandbox en login,
  - bloqueo de acciones de escritura para presentaciones.
  - acceso explicito y unico de presentacion en `/dashboard/demo`.
  - guia operativa para presentacion: `Docs/Guia_Demo_Sandbox_Presentacion.md`.

## Plan de cierre del Manual Técnico (pendientes)

Este plan se enfoca en el dashboard y la operación, pero el “cumplimiento total” del Manual incluye componentes funcionales/operativos adicionales.
El roadmap priorizado para cerrar esos faltantes está en:

- `Docs/Plan_Cierre_Manual_Tecnico_PUI.md`

## 1) Objetivo
Construir un dashboard administrativo multitenant para operar la integracion PUI sin romper los endpoints inbound ya productivos (`/pui/*`), manteniendo separacion clara entre:

- `API inbound PUI` (maquina a maquina).
- `Admin API` (usuarios humanos internos por tenant).
- `Frontend dashboard` (Next.js).

## 1.1) Fundamento (requisitos del Gobierno / PUI)

Antes de cerrar estructura, flujo y diseño de pantallas, este plan se alinea a los requisitos técnicos/normativos descritos en:
- `Docs/Requisitos_Gobierno_PUI.md` (resumen de trabajo a partir de PDFs locales).
- `Docs/Arquitectura_Vistas_Dashboard_PUI.md` (arquitectura de vistas propuesta para el dashboard).
- `Docs/Vista_Alta_Tenant_Renta_PUI.md` (flujo de alta guiada de un nuevo tenant de renta).
- `Docs/Vistas_Propuestas_App_PUI_Geoactiv_MultiTenant.md` (propuesta extendida de vistas SaaS multi-tenant).
- `Ducumentacion_Base/Manual_Tecnico_Plataforma_Unica_de_Identidad_Instituciones_Diversas.pdf`
- `Ducumentacion_Base/Guia_del_Sitio_de_Inscripcion_para_Instituciones_Diversas.pdf`
- `Ducumentacion_Base/LGMDFP_ref06_16jul24.pdf`

Decisiones de diseño derivadas:
- Trazabilidad/auditoría obligatoria (registro de búsquedas/consultas y operación).
- Seguridad obligatoria (TLS/JWT/validaciones) + evidencia (SAST/DAST/SCA) por ambiente.
- Flujo de reportes por fases (1/2/3) y eventos de cierre/desactivación.
- Onboarding/inscripción: IP/URL base/credenciales + pruebas de conectividad (QA/Prod) y folio/evidencias.

## 2) Arquitectura objetivo

### Backend (FastAPI)
- Mantener endpoints actuales:
  - `POST /pui/login`
  - `POST /pui/activar-reporte`
  - `POST /pui/activar-reporte-prueba`
  - `POST /pui/desactivar-reporte`
  - `GET /pui/health`
- Agregar superficie nueva para dashboard:
  - Prefijo recomendado: `/admin/*`
- Regla central:
  - Toda consulta/mutacion del dashboard se filtra por `tenant_id`.

### Frontend (Next.js)
- `frontend/` como proyecto separado.
- Stack:
  - Next.js (App Router)
  - React
  - TailwindCSS
  - shadcn/ui
  - React Hook Form + Zod
  - TanStack Query
- Frontend consume solo `/admin/*`.

### Seguridad y acceso
- No reutilizar JWT de `/pui/login` para usuarios humanos.
- Crear autenticacion de dashboard con tablas ya existentes:
  - `public.users`
  - `public.user_roles`
  - `public.roles`
  - `public.permissions`
  - `public.user_sessions`
- Soporte multitenant:
  - Usuario local tenant: `tenant_id` fijo.
  - Usuario global soporte: seleccion de tenant activa, auditada.

## 3) Alcance funcional (MVP)

### Modulo A: Acceso y sesion
- Login de dashboard.
- Renovacion/cierre de sesion.
- Middleware de permisos por rol.

### Modulo B: Contexto tenant
- Selector de tenant (solo usuarios globales).
- Persistencia del tenant activo.
- Guardas para evitar acciones cruzadas de tenant.

### Modulo C: Integracion PUI
- Vista de `tenant_pui_integrations`:
  - estado
  - environment
  - URLs
  - fechas de pruebas (`last_connectivity_test_at`, etc.)
- Acciones:
  - activar/desactivar integracion
  - prueba de conectividad

### Modulo D: Auditoria operativa
- Bandeja de `integration_requests`.
- Detalle con `integration_request_fields` (enmascarado de sensibles).
- Filtros por endpoint, fecha, estatus y tenant.

### Modulo E: Reportes y fases
- Lista de `pui_reports`.
- Detalle de fases (`pui_report_phase_status`).
- Historial de desactivaciones (`pui_report_deactivations`).

### Modulo F: Seguridad / Compliance (requisito para conectividad)
- Evidencias por ambiente (QA/Productivo) para:
  - SAST / DAST / SCA (fecha, herramienta, URLs evaluadas, resultado).
- Checklist técnico (headers/hardening) y control de estado:
  - bloquear “activar productivo” si no hay evidencias aprobadas.

Implementación (estado actual):
- UI: `/dashboard/compliance` (carga manual + status + historial + descarga).
- API:
  - `GET /admin/compliance/status`
  - `GET /admin/compliance/policy`
  - `POST /admin/compliance/policy`
  - `GET /admin/compliance/evidence`
  - `POST /admin/compliance/evidence` (multipart)
  - `GET /admin/compliance/evidence/{id}/artifact`
- DB:
  - `public.compliance_evidences`
  - `public.compliance_policies`

Automatización recomendada (GitHub Actions):
- SAST:
  - CodeQL (GitHub Security)
  - Semgrep (artefacto descargable para carga manual)
- SCA:
  - pip-audit (Python) + npm audit (Frontend)
- DAST:
  - OWASP ZAP baseline (manual) contra URLs por ambiente
  - OWASP ZAP API-scan autenticado con JWT usando `GET /pui/openapi.json`

### Modulo G: Onboarding / Inscripción (administrativo)
- Captura/seguimiento de:
  - URL base / IP (allowlist/ACL), credenciales, folio y estatus.
  - historial de pruebas de conectividad y motivos de rechazo.

## 3.5) Reglas de Compliance (según Manual Técnico)

Estas reglas aplican a **sujetos obligados** para operar y demostrar cumplimiento.

### 3.5.1 Operación técnica (no sustituible por archivos)
- La operación PUI **no se cumple** cargando Excel/CSV de forma periódica.
- Para operar conforme al Manual Técnico, el sujeto obligado debe:
  - Mantener la integración **conectada por API** (URL base + endpoints requeridos).
  - Ejecutar el flujo por fases (1/2/3) y conservar trazabilidad (logs/auditoría).

### 3.5.2 Evidencia de seguridad (SAST/DAST/SCA): 2 métodos soportados

El Manual Técnico requiere entregar evidencias SAST/DAST/SCA sobre URL base + endpoints.
El dashboard soportará dos maneras de gestionarlo:

**Método A — Manual (carga de evidencias)**
- El usuario sube archivos de evidencia (PDF/HTML/ZIP/etc.) generados por herramientas.
- Campos mínimos a capturar por evidencia:
  - ambiente (`qa` / `productivo`)
  - tipo (`SAST` / `DAST` / `SCA`)
  - herramienta (nombre/versión)
  - fecha de ejecución
  - URLs evaluadas (URL base + endpoints)
  - resultado (aprobado / no aprobado) + resumen
  - adjunto (archivo)
- Reglas UX:
  - No permitir marcar “aprobado” sin adjunto y metadatos completos.
  - Guardar historial (no sobrescribir).

**Método B — Automático (CI/CD)**
- Integración opcional para recibir resultados desde pipelines (webhook o polling).
- Se registra:
  - commit/tag, ambiente, herramienta, fecha, URLs, severidades y artefactos.
- Reglas UX:
  - El estado “aprobado” lo calcula el sistema a partir del resultado del pipeline.
  - Se conserva historial y se permite auditoría/exportación.

### 3.5.3 Regla de gating (bloqueo por cumplimiento)

Para evitar activar operación en Productivo sin evidencia:
- Si `ambiente=productivo` y falta al menos una evidencia vigente de:
  - SAST + DAST + SCA
  entonces:
  - bloquear acciones de “Activar integración productiva” (y mostrar qué falta).
- Para considerar `DAST` como aprobado conforme al Manual, la evidencia válida debe provenir del workflow `Security - DAST API (OWASP ZAP)` o de una herramienta equivalente que cubra `URL_BASE + endpoints` con autenticación JWT.
- El baseline host-level puede conservarse como evidencia complementaria de hardening, pero no sustituye el API-scan para autorizar conectividad.

Vigencia (política interna sugerida):
- Definir `vigencia_días` configurable por tenant (ej. 30/60/90) para evidencias.
- Mostrar advertencias cuando esté por vencer (ej. < 7 días).

## 3.1) Usuarios objetivo (sujetos obligados) y roles UX

Este dashboard está pensado para **sujetos obligados / instituciones** que deben mantener su integración PUI operativa, segura y trazable.

Personas (UX) recomendadas:
- **Admin de Institución (tenant_admin)**: configura integración (URLs/credenciales/IP), ve operación y atiende incidencias.
- **Operador de Búsqueda (tenant_operator)**: monitorea reportes, revisa fases, atiende errores y valida procesamiento interno.
- **Auditor/Compliance (tenant_auditor)**: consulta auditoría, exporta evidencias y sube reportes SAST/DAST/SCA.
- **Soporte Plataforma (platform_owner/global)**: selecciona tenant, da soporte, revisa auditoría global, gestiona usuarios/tenants.

Principio: cada rol debe ver solo lo necesario (mínimo privilegio) y la UI debe “guiar” el cumplimiento (checklists, estados claros, CTAs).

## 3.2) Mapa de rutas (IA v1) del dashboard

Nota: `frontend/` usa `basePath=/dashboard`, por lo que las rutas se ven como `https://pui.geoactiv.mx/dashboard/<ruta>`.

### 3.2.1) Índice maestro de navegación

| Ruta | Estado actual | Nota |
| --- | --- | --- |
| `/dashboard/login` | Implementada | Acceso seguro al panel. |
| `/dashboard` | Implementada | Inicio / resumen ejecutivo. |
| `/dashboard/demo` | Implementada | Entrada de presentación / sandbox. |
| `/dashboard/integraciones` | Implementada | Configuración y acciones del tenant activo. |
| `/dashboard/auditoria` | Implementada | Requests, filtros y fields. |
| `/dashboard/compliance` | Implementada | Evidencias SAST/DAST/SCA. |
| `/dashboard/reportes` | Implementada | Bandeja operativa de reportes. |
| `/dashboard/reportes/<id>` | Implementada | Expediente completo del caso. |
| `/dashboard/qa` | Temporal | Soporte / pruebas backend mientras exista. |
| `/dashboard/soporte` | Implementada | Diagnóstico / soporte técnico controlado. |
| `/dashboard/app` | Compatibilidad heredada | Alias/redirect temporal; no es entrada principal. |

### 3.2.2) Matriz funcional por vista

| Vista | Campos principales | Acciones principales | API / dato clave | Estado |
| --- | --- | --- | --- | --- |
| `/dashboard/login` | usuario, contraseña, tenant opcional, aviso demo | iniciar sesión, cambiar contraseña, abrir demo | `POST /admin/auth/login`, `POST /admin/auth/change-password` | Implementada |
| `/dashboard` | KPIs, alertas, actividad reciente, salud | navegar a módulos | `GET /admin/me`, `GET /admin/integrations`, `GET /admin/reports` | Implementada |
| `/dashboard/demo` | usuario demo, tenant demo, guía de presentación | abrir sandbox, entrar al acceso, exportar evidencia | `DemoBanner`, login demo, rutas sandbox | Implementada |
| `/dashboard/integraciones` | datos institucionales, webhook, credenciales, ambientes | activar/desactivar, conectividad, resincronización | `GET/POST /admin/integrations/*` | Implementada |
| `/dashboard/auditoria` | endpoint, request id, HTTP, JWT, fecha, fields | filtrar, abrir detalle, recargar | `GET /admin/audit/requests`, `GET /admin/audit/requests/{id}/fields` | Implementada |
| `/dashboard/reportes` | id búsqueda, CURP, fase, status, origen | abrir detalle, desactivar, filtrar | `GET /admin/reports` | Implementada |
| `/dashboard/reportes/<id>` | resumen, fases, coincidencias, timeline | reintentar, pausar, exportar expediente | `GET /admin/reports/{id}`, `/phases`, `/deactivations` | Implementada |
| `/dashboard/compliance` | checklist, SAST/DAST/SCA, vigencia, artefactos | cargar evidencia, descargar, marcar faltantes | `GET/POST /admin/compliance/*` | Implementada |
| `/dashboard/qa` | checks backend, resumen de sesión | ejecutar checks, inspección temporal | `useQaChecks` + endpoints admin | Temporal |
| `/dashboard/soporte` | jobs, colas, incidentes, salud técnica | diagnosticar, reintentar conectividad, resincronizar tablero, observar scheduler fase 3 | `GET /admin/me`, `GET /admin/integrations`, `GET /admin/audit/requests`, `GET /admin/reports`, `GET /admin/compliance/status`, `GET /admin/scheduler/jobs`, `POST /admin/integrations/{id}/connectivity-test` | Implementada |
| `/dashboard/app` | compatibilidad histórica | redirección heredada | `redirect` a `/qa` | Compatibilidad heredada |

### 3.2.3) Backlog priorizado por vista

#### Prioridad 1 — cerrar operación base
1. `/dashboard/reportes`
2. `/dashboard/reportes/<id>`
3. `/dashboard/integraciones`

Objetivo:
- terminar la operación principal del caso;
- tener expediente completo;
- dejar conectividad y acciones de integración firmes.

#### Prioridad 2 — cerrar trazabilidad y cumplimiento
1. `/dashboard/auditoria`
2. `/dashboard/compliance`

Objetivo:
- exportación y trazabilidad completa;
- gating productivo por policy;
- evidencia auditable por ambiente.

#### Prioridad 3 — consolidar experiencia de presentación
1. `/dashboard/demo`
2. enriquecer historial sandbox

Objetivo:
- demo clara para clientes;
- flujo de presentación sin riesgo;
- evidencia de sandbox reutilizable.

#### Prioridad 4 — formalizar soporte
1. `/dashboard/soporte`
2. migrar o retirar `/dashboard/qa`

Objetivo:
- sacar QA de la zona temporal;
- crear diagnóstico controlado;
- evitar que soporte dependa de pantallas de pruebas.

#### Prioridad 5 — hardening funcional restante
1. resincronización operativa completa
2. exportación CSV/JSON de auditoría
3. timeline visual completo
4. acciones formales de reintento/pausa
5. tabs de fase 3 y cierres históricos

Rutas implementadas (hoy):
- `/dashboard/login`: acceso.
- `/dashboard`: Inicio (resumen + accesos rápidos).
- `/dashboard/demo`: entrada de presentación / sandbox.
- `/dashboard/institucion`: ficha simple del tenant normal.
- `/dashboard/onboarding`: resumen de onboarding y preparación para producción.
- `/dashboard/inscripcion`: checklist de onboarding e inscripción.
- `/dashboard/credenciales`: estado técnico y Llave MX/e.Firma.
- `/dashboard/monitoreo`: resumen operativo del tenant normal.
- `/dashboard/usuarios`: usuarios y roles visibles del tenant normal; invitación y estado limitado solo si el rol lo permite.
- `/dashboard/roles`: permisos visibles y miembros por rol; cambio limitado del rol activo.
- `/dashboard/perfil`: edición self-service del tenant normal.
- `/dashboard/integraciones`: configuración y acciones de integración del tenant activo.
- `/dashboard/auditoria`: requests + filtros + fields.
- `/dashboard/compliance`: evidencias SAST/DAST/SCA + estado por ambiente + descargas.
- `/dashboard/reportes`: listado + filtros (status/origen/búsqueda).
- `/dashboard/reportes/<id>`: detalle (fases + desactivaciones + acción de baja).
- `/dashboard/qa`: herramienta interna temporal de soporte / pruebas backend.
- `/dashboard/app`: redirect heredado de compatibilidad hacia `/qa` (no es la entrada principal).
- `/dashboard/soporte`: ruta implementada de diagnóstico/soporte técnico controlado.

Rutas objetivo (próximas):
- **Operación**
  - `/dashboard/reportes`: lista de reportes (status/origen/búsqueda) + acciones permitidas.
  - `/dashboard/reportes/<id>`: detalle, fases (1/2/3), evidencias de notificación y errores.
- **Seguridad**
  - `/dashboard/compliance`: evidencias SAST/DAST/SCA por ambiente + checklist + estado “aprobado/no aprobado”.
  - `/dashboard/seguridad`: settings de MFA, hardening recomendado (solo admin/soporte).
- **Administración**
- `/dashboard/usuarios`: usuarios, roles, estado (active/locked), MFA. Implementada como vista de consulta y gestión limitada para tenant normal.
- `/dashboard/roles`: permisos por rol (solo platform/global o tenant_admin según política). Implementada como vista de consulta y asignación limitada para tenant normal.
- **Onboarding**
  - `/dashboard/onboarding`: resumen de alta técnica y documental, con folio, URLs asignadas, IP/webhook y estado “listo para prod”.
- **Perfil tenant**
  - `/dashboard/perfil`: edición self-service de razón social/contacto/notas para tenants normales; URL/webhook/IP quedan de solo lectura y los asigna el backend al crear el tenant.
- `/dashboard/tenants`, `/dashboard/tenants/nuevo` y `/dashboard/tenants/<id>`: alta, detalle y administración de tenants de renta por la cuenta maestra; las URLs base por ambiente se derivan automáticamente al crear el tenant y desde el detalle se pueden editar/suspender/activar.
- **Soporte**
  - `/dashboard/qa` (temporal) o `/dashboard/soporte/diagnostico` (cuando se formalice).
  - `/dashboard/demo` como acceso guiado de presentación al sandbox.
- `/dashboard/soporte` como vista formal de soporte técnico controlado y diagnóstico.

## 3.2.4) Backlog priorizado por vista

### Prioridad 1 — cerrar operación base
1. `/dashboard/reportes`
2. `/dashboard/reportes/<id>`
3. `/dashboard/integraciones`

Objetivo:
- terminar la operación principal del caso;
- tener expediente completo;
- dejar conectividad y acciones de integración firmes.

### Prioridad 2 — cerrar trazabilidad y cumplimiento
1. `/dashboard/auditoria`
2. `/dashboard/compliance`

Objetivo:
- exportación y trazabilidad completa;
- gating productivo por policy;
- evidencia auditable por ambiente.

### Prioridad 3 — consolidar experiencia de presentación
1. `/dashboard/demo`
2. enriquecer historial sandbox

Objetivo:
- demo clara para clientes;
- flujo de presentación sin riesgo;
- evidencia de sandbox reutilizable.

### Prioridad 4 — formalizar soporte
1. `/dashboard/soporte`
2. migrar o retirar `/dashboard/qa`

Objetivo:
- sacar QA de la zona temporal;
- crear diagnóstico controlado;
- evitar que soporte dependa de pantallas de pruebas.

### Prioridad 5 — hardening funcional restante
1. resincronización operativa completa
2. exportación CSV/JSON de auditoría
3. timeline visual completo
4. acciones formales de reintento/pausa
5. tabs de fase 3 y cierres históricos

### 3.2.5) Tabla operativa del backlog

| Ítem | Prioridad | Depende de | Estado | Resultado esperado |
| --- | --- | --- | --- | --- |
| `/dashboard/reportes` | 1 | `login`, `dashboard` | Implementada | Bandeja operativa completa para casos activos. |
| `/dashboard/reportes/<id>` | 1 | `/dashboard/reportes` | Implementada | Expediente completo del caso con fases y desactivaciones. |
| `/dashboard/integraciones` | 1 | `login`, `dashboard` | Implementada | Configuración y conectividad por tenant. |
| `/dashboard/auditoria` | 2 | `login`, `dashboard` | Implementada | Trazabilidad y fields redacted por request. |
| `/dashboard/compliance` | 2 | `login`, `dashboard` | Implementada | Evidencias y checklist por ambiente. |
| `/dashboard/demo` | 3 | `login` | Implementada | Presentación guiada sin datos reales. |
| `/dashboard/soporte` | 4 | `dashboard`, `auditoria` | Objetivo | Diagnóstico y soporte técnico controlado. |
| Migrar/retirar `/dashboard/qa` | 4 | `/dashboard/soporte` | Temporal | Sacar QA de la zona temporal. |
| Resincronización operativa | 5 | `integraciones`, `reportes` | Pendiente | Reintentos y sincronización completa. |
| Exportación de auditoría | 5 | `auditoria` | Pendiente | Descarga CSV/JSON para cumplimiento. |
| Timeline visual | 5 | `reportes/<id>` | Pendiente | Línea de tiempo clara por caso. |
| Reintento/pausa formal | 5 | `reportes/<id>` | Pendiente | Acciones controladas sobre el caso. |
| Tabs fase 3 / cierres históricos | 5 | `reportes` | Pendiente | Vistas rápidas para seguimiento de cierres. |

### 3.2.6) Correspondencia con la propuesta extendida de vistas

La propuesta `Docs/Vistas_Propuestas_App_PUI_Geoactiv_MultiTenant.md` amplía el roadmap con vistas de negocio y operación que no rompen lo ya implementado.

| Vista propuesta | Familia | Estado actual | Nota |
| --- | --- | --- | --- |
| `/admin` | Geoactiv / operador | Objetivo | Torre de control global SaaS. |
| `/admin/tenants` | Geoactiv / operador | Implementada vía `/dashboard/tenants` | Administración maestra de tenants. |
| `/admin/integraciones` | Geoactiv / operador | Implementada vía `/dashboard/soporte` y `/dashboard/integraciones` | Operación técnica y conectividad. |
| `/admin/auditoria` | Geoactiv / operador | Objetivo | Auditoría centralizada multi-tenant. |
| `/admin/reportes` | Geoactiv / operador | Objetivo | Monitoreo global de reportes. |
| `/admin/compliance` | Geoactiv / operador | Implementada vía `/dashboard/compliance` y detalle de tenant | Expediente maestro y anexos. |
| `/admin/soporte` | Geoactiv / operador | Implementada vía `/dashboard/soporte` | Diagnóstico controlado. |
| `/admin/demo` | Geoactiv / operador | Implementada vía `/dashboard/demo` | Presentación y sandbox internos. |
| `/dashboard/institucion` | Tenant rentado | Objetivo | Ficha institucional simple. |
| `/dashboard/onboarding` | Tenant rentado | Implementada | Resumen de alta técnica y documental. |
| `/dashboard/inscripcion` | Tenant rentado | Objetivo | Onboarding / inscripción PUI. |
| `/dashboard/integracion` | Tenant rentado | Objetivo | Vista simple de integración. |
| `/dashboard/credenciales` | Tenant rentado | Implementada | Estado de credenciales técnicas. |
| `/dashboard/monitoreo` | Tenant rentado | Implementada | Resumen operativo del tenant. |
| `/dashboard/usuarios` | Tenant rentado | Implementada | Usuarios, roles y estado limitado del tenant. |
| `/dashboard/roles` | Tenant rentado | Implementada | Permisos por rol y cambio limitado de asignación. |

Esta correspondencia deja claro que la app ya separa la base SaaS de la experiencia self-service del tenant, y que las vistas propuestas se incorporan como ruta de evolución del plan.

### 3.2.7) Backlog operativo por nuevas vistas

La ruta de evolución recomendada para la propuesta extendida es:

#### Prioridad 1 — identidad y alta del tenant
1. `/dashboard/institucion`
2. `/dashboard/onboarding`
3. `/dashboard/inscripcion`
4. `/dashboard/integracion`
5. `/dashboard/credenciales`

Objetivo:
- que el tenant rentado vea y mantenga su identidad institucional;
- completar el onboarding PUI;
- mostrar la configuración técnica con secretos protegidos;
- formalizar el estado de credenciales.

#### Prioridad 2 — operación cotidiana
1. `/dashboard/reportes`
2. `/dashboard/reportes/<id>`
3. `/dashboard/auditoria`

Objetivo:
- operar el flujo normal de casos;
- revisar trazabilidad;
- mantener una experiencia simple para usuario final.

#### Prioridad 3 — seguimiento y control
1. `/dashboard/monitoreo`
2. `/dashboard/compliance`
3. `/dashboard/usuarios`
4. `/dashboard/roles`

Objetivo:
- ver salud de procesos;
- revisar cumplimiento por ambiente;
- administrar acceso con roles claros.

#### Prioridad 4 — operador Geoactiv
1. `/admin`
2. `/admin/tenants`
3. `/admin/soporte`
4. `/admin/demo`

Objetivo:
- mantener el control maestro de plataforma;
- administrar tenants de renta;
- dar soporte y presentación sin mezclarlo con el tenant rentado.

## 3.3) Flujos principales (simples y amigables)

Flujo 1 — “Ponerme en línea” (Admin institución):
1. Entrar al dashboard (login).
2. Ir a Integraciones → capturar URL base/host/IP allowlist → guardar.
3. Ejecutar **Prueba de conectividad** → ver resultado y timestamp.
4. (Si aplica) activar integración → verificar auditoría de la acción.
5. Ir a Compliance → subir evidencias SAST/DAST/SCA (QA/Prod) → ver estatus “aprobado”.

Flujo 2 — “Operar reportes” (Operador):
1. Ir a Reportes → ver cola por estado (active/closed) y origen.
2. Abrir reporte → ver fases 1/2/3, últimos eventos y errores.
3. Confirmar “búsqueda finalizada” cuando aplique (según backend) y revisar auditoría asociada.
4. Al recibir desactivación, confirmar que se detuvo búsqueda continua y queda el reporte “closed”.

Flujo 3 — “Auditoría/Evidencias” (Auditor/Compliance):
1. Ir a Auditoría → filtrar por endpoint/status/fecha → revisar fields redacted.
2. Exportar trazas (CSV/JSON) por rango (pendiente de implementar).
3. Adjuntar evidencias SAST/DAST/SCA por ambiente con fechas/URLs/herramientas (Compliance).

## 3.4) Principios de diseño (para reducir fricción)

Recomendaciones UX/UI:
- **Lenguaje no técnico** en CTAs (p.ej. “Probar conectividad”, “Activar integración”, “Subir evidencia”).
- **Estados y next-step claros**: badge + mensaje + acción sugerida (ej. “Falta evidencia DAST Prod → Subir”).
- **No exponer secretos**: tokens/keys siempre truncados/ocultos; copiar con botón si aplica.
- **Errores accionables**: mostrar “qué falló” sin filtrar datos sensibles; mantener `request_id` correlacionable.
- **Checklist por ambiente** (QA/Prod) para que el sujeto obligado sepa cuándo está “listo”.

## 4) Fuera de alcance inicial (Fase 2+)
- Scheduler completo de busqueda continua y resincronizacion avanzada.
- Modulo outbound completo hacia API remota PUI.
- MFA obligatorio para todos los roles.
- BI avanzado / data warehouse.

## 5) Plan por sprints (6 semanas)

## Semana 1: Base tecnica
Entregables:
- Estructura `frontend/` creada y ejecutando.
- `app/api/routes/admin_auth.py` y `app/api/routes/admin_tenants.py` iniciales.
- Modelo base de sesion de dashboard.
- Nginx enrutando:
  - `/` -> frontend
  - `/api` -> FastAPI (o dominio separado)

Criterios de aceptacion:
- Login dashboard funcional.
- Endpoint `GET /admin/me` devuelve usuario y permisos.

## Semana 2: Multitenancy y permisos
Entregables:
- Selector tenant (usuarios globales).
- Middleware backend que inyecta/valida tenant activo.
- Matriz base de permisos por rol.

Criterios de aceptacion:
- Ningun endpoint admin responde datos de otro tenant.
- Se registran eventos de cambio de tenant para usuarios globales.

## Semana 3: Modulo Integracion PUI
Entregables:
- Pantalla de configuracion de integracion por tenant.
- Endpoints para activar/desactivar y prueba de conectividad.
- Auditoria de acciones administrativas.

Criterios de aceptacion:
- Acciones reflejadas en `tenant_pui_integrations`.
- Trazabilidad completa (quien, cuando, que cambio).

## Semana 4: Modulo Auditoria de requests
Entregables:
- Tabla paginada de `integration_requests`.
- Vista detalle con campos redacted.
- Filtros y export basico CSV.

Criterios de aceptacion:
- Respuesta < 1.5s para listado paginado (datos actuales).
- Campos sensibles no expuestos en claro.

## Semana 5: Modulo Reportes y fases
Entregables:
- Lista/Detalle de `pui_reports`.
- Timeline de fases con `pui_report_phase_status`.
- Accion de desactivacion desde dashboard (si aplica permiso).

Criterios de aceptacion:
- Estado de reporte consistente con API inbound.
- Registro en `pui_report_deactivations` al desactivar.

## Semana 6: Hardening y salida a produccion
Entregables:
- Pruebas de integracion criticas.
- Observabilidad minima (logs estructurados, metricas basicas).
- Runbook operativo y rollback.

Criterios de aceptacion:
- Checklist de go-live completado.
- Smoke test post-deploy verde.

## 6) Backlog tecnico recomendado
- Indices SQL para rendimiento:
  - `integration_requests (tenant_id, created_at desc)`
  - `integration_requests (tenant_id, endpoint_code, created_at desc)`
  - `pui_reports (tenant_id, updated_at desc)`
  - `pui_report_phase_status (tenant_id, pui_report_id, phase)`
- Estandar de errores para `/admin/*` (codigo, mensaje, trace_id).
- Rate limit por usuario para operaciones administrativas sensibles.
- Politica de expiracion de sesion y revocacion.

## 7) Estructura sugerida en repo

```text
/var/www/PUI
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.py                 # inbound PUI actual
│   │   │   ├── report_activation.py    # inbound PUI actual
│   │   │   ├── report_deactivation.py  # inbound PUI actual
│   │   │   ├── admin_auth.py           # nuevo
│   │   │   ├── admin_tenants.py        # nuevo
│   │   │   ├── admin_integrations.py   # nuevo
│   │   │   ├── admin_requests.py       # nuevo
│   │   │   └── admin_reports.py        # nuevo
│   └── ...
├── frontend/                             # nuevo Next.js
└── Docs/
    └── Plan_Implementacion_Dashboard_Multitenant.md
```

## 8) Riesgos y mitigaciones
- Riesgo: mezclar auth PUI con auth dashboard.
  - Mitigacion: JWT y rutas separadas por dominio funcional.
- Riesgo: fuga de datos entre tenants.
  - Mitigacion: filtro obligatorio por `tenant_id` en repositorios + pruebas de aislamiento.
- Riesgo: degradacion de performance en auditoria.
  - Mitigacion: paginacion server-side + indices + limites de query.

## 9) Definicion de terminado (DoD)
- Modulos A-E operativos.
- RBAC aplicado en backend (no solo ocultar botones en frontend).
- Logs de auditoria para cambios administrativos.
- Pruebas minimas:
  - auth dashboard
  - aislamiento tenant
  - integracion PUI config
  - consulta de auditoria y reportes
- Documentacion de despliegue y rollback actualizada.

## 10) Siguiente ejecucion inmediata
1. Crear `frontend/` (Next.js + Tailwind + shadcn).
2. Implementar `/admin/auth/login` y `/admin/me` en FastAPI.
3. Implementar selector de tenant y middleware tenant-context.
4. Entregar primera pantalla: Integracion PUI (solo lectura) en 48 horas.

## 11) Avance implementado (actualizado 2026-04-17)

### 11.1 Estado general
- Estado del MVP: **operativo en produccion**.
- Dominio landing: `https://pui.geoactiv.mx/`.
- Dominio dashboard: `https://pui.geoactiv.mx/dashboard`.
- Backend API: `https://pui.geoactiv.mx/pui/*` y `https://pui.geoactiv.mx/admin/*`.

### 11.2 Entregables completados

#### A) Acceso y sesion (Modulo A) - COMPLETADO (MVP)
- `POST /admin/auth/login` implementado y validado.
- `GET /admin/me` implementado y validado.
- `POST /admin/auth/logout` implementado y validado.
- Sesiones en `public.user_sessions` con expiracion e inactividad.
- JWT admin separado del JWT de PUI inbound.

#### B) Cambio de contraseña inicial - COMPLETADO
- `POST /admin/auth/change-password` implementado.
- Señal `must_change_password` integrada en login y `/admin/me`.
- Al cambiar contraseña:
  - se actualiza `public.user_password_credentials`,
  - se inserta historial en `public.user_password_history`,
  - se desactiva `must_change_password` en `public.users`.

#### C) Contexto tenant persistido (Modulo B) - COMPLETADO (MVP)
- `GET /admin/tenants` implementado.
- `POST /admin/tenants` implementado para alta guiada de tenants de renta.
- `POST /admin/tenant-context` implementado.
- Persistencia del tenant activo en `user_sessions.tenant_id`.
- Validacion de acceso por tenant para usuario global/local.

#### D) Integraciones por tenant (Modulo C, lectura) - COMPLETADO (MVP)
- `GET /admin/integrations` implementado.
- Consulta sobre `tenant_pui_integrations` filtrada por tenant activo.
- Vista frontend con tabla de ambiente, estado, credencial y conectividad.

#### E) Auditoria de requests (Modulo D, lectura) - COMPLETADO (MVP)
- `GET /admin/audit/requests` con paginacion y filtros (`endpoint_code`, `http_status`).
- `GET /admin/audit/requests/{request_id}/fields` para detalle de campos redacted.
- Vista frontend con tabla paginada y consulta de detalle por request.

#### H) Auditoria de acciones administrativas - COMPLETADO (MVP)
- Se registra traza en `audit_events` para:
  - cambio de tenant (`tenant_context.set`),
  - activar/desactivar integracion,
  - prueba de conectividad (`integration.connectivity_test`),
  - logout (`auth.logout`).

#### F) Frontend dashboard - COMPLETADO (MVP)
- Proyecto `frontend/` creado con Next.js + Tailwind + shadcn/ui.
- Pantalla funcional publicada en `/dashboard` con:
  - login,
  - carga de `/admin/me`,
  - selector de tenant + aplicar contexto,
  - tabla de integraciones,
  - tabla de auditoria + detalle de campos,
  - flujo de cambio de contraseña obligatorio.

#### G) Operacion y despliegue - COMPLETADO
- Servicio `systemd` backend activo:
  - `pui.service` -> `uvicorn app.main:app --host 127.0.0.1 --port 8080`.
- Servicio `systemd` frontend activo:
  - `pui-frontend.service` -> `next start --hostname 127.0.0.1 --port 3000`.
- Nginx configurado para:
  - mantener landing en `/`,
  - publicar dashboard en `/dashboard`,
  - enrutar `/pui/*` y `/admin/*` a FastAPI.

### 11.3 Validaciones ejecutadas
- Login real de usuario admin global validado en dominio.
- Flujo real validado:
  1. Login admin.
  2. Carga de `/admin/me` y `/admin/tenants`.
  3. Alta guiada de tenant de renta con `POST /admin/tenants`.
  4. Aplicacion de tenant con `/admin/tenant-context`.
  5. Carga de `/admin/integrations`.
  6. Carga de `/admin/audit/requests` y detalle de fields.
- Build/lint frontend y compilacion Python (`py_compile`) ejecutados sin errores.

### 11.4 Ajustes al plan original
- En el plan inicial se planteaba `/` como dashboard. Se ajusto para conservar negocio:
  - `/` permanece como landing comercial.
  - `/dashboard` aloja el panel administrativo.
- El avance real cubre gran parte de Semanas 1-4 del roadmap en version MVP.

### 11.5 Pendientes siguientes (prioridad)
1. Mejorar UX del panel:
   - auto-carga de auditoria al aplicar tenant,
   - formato legible de fechas,
   - estados visuales (`badges`) para codigos HTTP y errores.
2. Endurecimiento (Semana 6):
   - pruebas automatizadas de endpoints admin.

### 11.6 Avance adicional (2026-04-17, modulo reportes y fases)
- Endpoints admin implementados:
  - `GET /admin/reports` (paginacion y filtros por `report_status`, `report_origin`, `search`).
  - `GET /admin/reports/{report_id}/phases`.
  - `GET /admin/reports/{report_id}/deactivations`.
  - `POST /admin/reports/{report_id}/deactivate`.
- Permisos RBAC aplicados:
  - lectura: `tenant.reports.read`,
  - desactivacion: `tenant.reports.write`.
- Auditoria de acciones administrativas agregada:
  - `report.deactivate` en `audit_events`.
- Dashboard MVP extendido con bloque **Reportes y fases**:
  - tabla de reportes por tenant,
  - filtros y paginacion,
  - consulta de fases,
  - consulta de historial de desactivaciones,
  - accion de desactivar reporte.

### 11.7 Avance adicional (2026-04-17, separacion de vistas dashboard)
- Se separo la navegacion del panel en rutas dedicadas:
  - `/dashboard/login` para autenticacion.
  - `/dashboard/app` para operacion admin (tenant, integraciones, auditoria, reportes, QA) como compatibilidad historica.
- Se dejo redireccion desde `/dashboard` hacia `/dashboard/login`.
- Se implemento persistencia de sesion en frontend (token, expiracion y tenant seleccionado) usando `localStorage`.
- Se aplico guarda de acceso en frontend:
  - si no hay token en `/dashboard/app`, redirige a `/dashboard/login`.
  - al login exitoso en `/dashboard/login`, redirige a `/dashboard/app`.
  - al logout desde `/dashboard/app`, redirige a `/dashboard/login`.
> Nota: esta es la descripcion historica de la separacion original. El flujo actual de presentacion usa `/dashboard/demo`; `/dashboard/app` queda solo como compatibilidad temporal.

### 11.8 Avance adicional (2026-04-17, pruebas automatizadas iniciales)
- Se creo suite inicial de pruebas automatizadas en `tests/` con `unittest`:
  - `tests/test_admin_auth.py`
  - `tests/test_admin_tenant_context.py`
  - `tests/test_admin_reports.py`
  - `tests/test_admin_integrations.py`
  - `tests/test_admin_audit.py`
  - `tests/test_pui_endpoints.py`
- Cobertura actual de la suite:
  - `/admin/auth/login`
  - `/admin/me`
  - `/admin/auth/change-password`
  - `/admin/tenant-context`
  - `/admin/integrations`
  - `/admin/integrations/{integration_id}/activate`
  - `/admin/integrations/{integration_id}/deactivate`
  - `/admin/integrations/{integration_id}/connectivity-test`
  - `/admin/audit/requests`
  - `/admin/audit/requests/{request_id}/fields`
  - `/admin/reports`
  - `/admin/reports/{report_id}/phases`
  - `/admin/reports/{report_id}/deactivations`
  - `/admin/reports/{report_id}/deactivate`
  - `/pui/health`
  - `/pui/login`
  - `/pui/activar-reporte`
  - `/pui/activar-reporte-prueba`
  - `/pui/desactivar-reporte`
- Ejecucion validada:
  - `python -m unittest discover -s tests -p 'test_*.py'` -> **30 tests OK**.

## 12) Checklist tecnico de pruebas backend (pre-separacion de vistas)

Objetivo: validar logica backend de extremo a extremo antes de dividir UI en rutas finales (`/dashboard/login`, `/dashboard/demo`, `/dashboard/qa`, `/dashboard/soporte`, etc.).

### 12.1 Integraciones (acciones)
- [x] `POST /admin/integrations/{id}/activate` activa integracion valida del tenant activo.
- [x] `POST /admin/integrations/{id}/deactivate` desactiva integracion valida del tenant activo.
- [x] `POST /admin/integrations/{id}/connectivity-test` ejecuta prueba y actualiza `last_connectivity_test_at`.
- [x] Intentar accionar integracion de otro tenant devuelve error controlado (`404` sin fuga de datos).
- [x] Usuario sin permiso de escritura en integraciones recibe `403`.
- [x] Toda accion administrativa queda auditada (usuario, tenant, timestamp, accion).

### 12.2 Aislamiento multitenant
- [x] Usuario global sin tenant activo recibe error controlado al consultar modulos tenant-scoped.
- [x] Usuario global con tenant activo solo ve datos de ese tenant.
- [x] Cambio de tenant en sesion modifica alcance de datos inmediatamente.
- [x] Usuario local tenant no puede cambiarse a tenant ajeno.
- [x] Requests manipulando `tenant_id` de otro tenant nunca exponen datos cruzados.

### 12.3 Sesiones y seguridad
- [x] Login valido crea sesion en `user_sessions`.
- [x] Login invalido incrementa `failed_login_count`.
- [x] `must_change_password=true` obliga flujo de cambio de contraseña.
- [x] `POST /admin/auth/change-password` invalida credencial anterior y habilita nueva.
- [x] Sesion expirada por tiempo devuelve `401`.
- [x] Sesion revocada/logout devuelve `401`.
- [x] Expiracion por inactividad valida contra `idle_expires_at`.

### 12.4 Auditoria operativa
- [x] `GET /admin/audit/requests` pagina correctamente (`limit`, `offset`).
- [x] Filtros por `endpoint_code` y `http_status` funcionan.
- [x] `GET /admin/audit/requests/{request_id}/fields` solo devuelve campos del tenant activo.
- [x] Campos sensibles permanecen redacted.
- [x] Endpoint con `request_id` inexistente responde controlado (lista vacia o `404` segun criterio definido).

### 12.5 Reportes y fases (siguiente bloque funcional)
- [x] `GET` de reportes filtra por tenant activo.
- [x] Detalle de fases refleja `pui_report_phase_status` consistente.
- [x] Desactivacion de reporte valida permisos y registra traza.
- [x] Intentar operar reporte de otro tenant devuelve error controlado (`404` sin fuga).

### 12.6 Pruebas automatizadas minimas
- [x] Tests de integracion para `/admin/auth/login`, `/admin/me`, `/admin/auth/change-password`.
- [x] Tests para `/admin/tenant-context` y aislamiento tenant.
- [x] Tests para `/admin/integrations` (lectura y acciones).
- [x] Tests para `/admin/audit/requests` y `.../fields`.
- [x] Tests de regresion para endpoints `/pui/*` existentes.

### 12.7 Criterio de salida (go/no-go para separar vistas)
- [x] Todos los checks criticos de 12.1 a 12.4 en verde.
- [ ] Sin fugas de datos entre tenants en pruebas manuales y automatizadas.
- [x] Endpoints admin con errores consistentes y trazables.
- [x] Con eso aprobado, iniciar separacion visual final:
  - `/dashboard/login` (login)
  - `/dashboard` (home / entrada)
  - `/dashboard/demo` (entrada guiada de presentacion / sandbox)
  - `/dashboard/qa` (pantalla MVP/QA temporal para pruebas backend)
  - modulos por pagina (`integraciones`, `auditoria`, `reportes`).

## 13) Separacion inicial de vistas (referencia historica)

Objetivo historico: dejar `/dashboard` como punto de entrada "real" del dashboard y mover la pantalla de pruebas backend a una ruta separada. Este bloque se conserva como referencia de la evolucion; el flujo actual de presentacion usa `/dashboard/demo`.

### 13.1 Rutas
- [x] `/dashboard/login`: login (UI existente).
- [x] `/dashboard`: vista Home (entrada principal, con guard de sesion y resumen basico).
- [x] `/dashboard/demo`: entrada guiada de presentacion / sandbox.
- [x] `/dashboard/soporte`: tablero de soporte y diagnostico.
- [x] `/dashboard/qa`: vista QA (pantalla MVP que concentra pruebas: tenant, integraciones, auditoria, reportes).
- [x] `/dashboard/app`: redirect heredado de compatibilidad a `/qa` (sin uso nuevo).

### 13.2 Implementacion (frontend)
- `frontend/src/app/page.tsx`: ahora renderiza Home.
- `frontend/src/components/dashboard-home.tsx`: guard de sesion (localStorage + expira) + carga de `/admin/me`.
- `frontend/src/app/login/page.tsx`: ahora usa un login dedicado (sin bloques QA).
- `frontend/src/components/dashboard-login.tsx`: login limpio + soporte de `tenant_id` opcional + flujo `must_change_password`.
- `frontend/src/app/demo/page.tsx`: landing guiada de presentacion.
- `frontend/src/app/soporte/page.tsx`: tablero de soporte y diagnostico.
- `frontend/src/app/qa/page.tsx`: monta el MVP/QA actual.
- `frontend/src/app/app/page.tsx`: redirect a `/qa` (compat).
- `frontend/src/lib/admin-session.ts`: llaves de localStorage y helpers (leer/limpiar/expiracion).
- `frontend/src/components/dashboard-mvp.tsx`: post-login ahora navega a `/` (home).
> Nota: `/dashboard/app` se conserva solo como redirect heredado; la navegación actual recomendada es `/dashboard/demo` para presentación, `/dashboard/soporte` para diagnóstico y `/dashboard/qa` para pruebas temporales.

## 14) Primer modulo real: Integraciones + Header global

Objetivo: iniciar migracion por modulos, empezando por Integraciones en su propia ruta, y agregar un header global con contexto (usuario, tenant, logout).

### 14.1 Header global
- [x] Header sticky con:
  - usuario activo (username + email),
  - tenant activo (nombre si hay lista, si no el `tenant_id`),
  - selector/aplicar tenant (solo usuarios globales),
  - boton de cerrar sesion.

### 14.2 Ruta Integraciones
- [x] `/dashboard/integraciones` lista integraciones del tenant activo y permite:
  - activar / desactivar,
  - prueba de conectividad (`connectivity-test`).

### 14.3 QA se mantiene temporal
- [x] `/dashboard/qa` conserva la pantalla MVP completa para pruebas backend y diagnostico mientras migramos el resto de modulos.
- [x] `/dashboard/demo` sirve como acceso de presentacion/sandbox sin tocar datos reales.

## 15) Segundo modulo real: Auditoría

Objetivo: sacar Auditoría de la pantalla QA y llevarla a su propia ruta real con filtros, paginado y detalle de fields.

### 15.1 Ruta Auditoría
- [x] `/dashboard/auditoria` lista requests con:
  - paginado (`limit=20`, `offset`),
  - filtros por `endpoint_code` y `http_status`,
  - badges por HTTP status y JWT válido.

### 15.2 Fields por request
- [x] Botón `Fields` carga `GET /admin/audit/requests/{request_id}/fields` y muestra tabla de fields.
