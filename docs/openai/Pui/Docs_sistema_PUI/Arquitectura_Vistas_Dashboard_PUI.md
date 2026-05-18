# Arquitectura de Vistas del Dashboard PUI

## Objetivo

Definir una estructura clara, amigable y operativa para el dashboard del obligado conectado a la PUI.

La propuesta prioriza:
- operación diaria;
- trazabilidad completa;
- cumplimiento documental;
- soporte y sandbox;
- separación entre uso funcional y uso técnico.

## Principios

### 1. Enfoque operativo
El dashboard debe comportarse como un centro de control de cumplimiento, no como una consola técnica.

### 2. Visibilidad inmediata
La portada debe responder rápido:
- reportes activos;
- coincidencias pendientes;
- fase 3 activa;
- errores de integración;
- estado de compliance.

### 3. Trazabilidad total
Cada registro debe permitir reconstruir:
- recepción;
- fases;
- coincidencias;
- envíos a PUI;
- cierres y desactivaciones;
- errores y reintentos.

### 4. Separación de capas
Se deben distinguir:
- operación diaria;
- integración técnica;
- auditoría/compliance;
- sandbox;
- soporte.

### 5. Separación por tenant
La UI debe distinguir entre:
- cuenta maestra de Geoactiv;
- tenants rentados;
- solo lectura para tenants normales;
- acceso ampliado solo para la cuenta maestra o soporte interno autorizado.

## Mapa de rutas propuesto

- `/dashboard/login`
- `/dashboard`
- `/dashboard/integraciones`
- `/dashboard/auditoria`
- `/dashboard/reportes`
- `/dashboard/reportes/<id>`
- `/dashboard/compliance`
- `/dashboard/institucion`
- `/dashboard/inscripcion`
- `/dashboard/credenciales`
- `/dashboard/monitoreo`
- `/dashboard/usuarios`
- `/dashboard/roles`
- `/dashboard/perfil`
- `/dashboard/demo`
- `/dashboard/soporte`
- `/dashboard/tenants`
- `/dashboard/tenants/nuevo`
- `/dashboard/tenants/<id>`

La propuesta extendida de producto y SaaS también queda documentada en:
- `Docs/Vistas_Propuestas_App_PUI_Geoactiv_MultiTenant.md`

Esa propuesta desglosa la plataforma en dos grandes familias:
- **Geoactiv / operador**: `/admin`, `/admin/tenants`, `/admin/integraciones`, `/admin/auditoria`, `/admin/reportes`, `/admin/compliance`, `/admin/soporte`, `/admin/demo`.
- **Tenant rentado / self-service**: `/dashboard/institucion`, `/dashboard/inscripcion`, `/dashboard/integracion`, `/dashboard/reportes`, `/dashboard/auditoria`, `/dashboard/compliance`, `/dashboard/credenciales`, `/dashboard/monitoreo`, `/dashboard/usuarios`, `/dashboard/roles`.

En la implementación actual algunas de esas vistas se materializan con otros nombres de ruta o están como roadmap:
- `/dashboard/integraciones` cubre hoy la intención de `/dashboard/integracion`.
- `/dashboard/perfil` cubre la autogestión mínima del tenant normal.
- `/dashboard/tenants/*` cubre la administración maestra de tenants.
- `/dashboard/soporte` cubre el diagnóstico formal.
- `/dashboard/qa` queda como temporal.

## Sidebar recomendado

- Inicio → `/dashboard`
- Reportes → `/dashboard/reportes`
- Integración → `/dashboard/integraciones`
- Bitácora → `/dashboard/auditoria`
- Cumplimiento → `/dashboard/compliance`
- Institución → `/dashboard/institucion`
- Inscripción → `/dashboard/inscripcion`
- Credenciales → `/dashboard/credenciales`
- Monitoreo → `/dashboard/monitoreo`
- Usuarios → `/dashboard/usuarios`
- Roles → `/dashboard/roles`
- Mi tenant → `/dashboard/perfil`
- Sandbox → `/dashboard/demo`
- Soporte → `/dashboard/soporte`
- Tenants → `/dashboard/tenants`

## Descripción de vistas

### `/dashboard/login`
Acceso seguro al panel.
Estado actual:
- entrada principal al dashboard;
- la vista demo es opcional y separada del flujo normal;
- el usuario global cambia tenant solo si su cuenta está autorizada para ello;
- tenants normales no ven selector de tenant.

### `/dashboard`
Resumen ejecutivo y operativo:
- KPIs;
- alertas;
- actividad reciente;
- estado de integración.
Estado actual:
- alertas visuales de integraciones y compliance;
- sesión activa;
- integraciones activas/inactivas;
- compliance por ambiente;
- reporte y auditoría más recientes.

### `/dashboard/integraciones`
Configuración institucional:
- datos institucionales;
- webhook/URL base;
- credenciales;
- ambientes;
- conectividad;
- resincronización.
Estado actual:
- acciones editables solo para la cuenta maestra o usuarios autorizados;
- tenants normales deben ver solo lectura.

### `/dashboard/perfil`
Perfil self-service del tenant normal:
- razón social;
- nombre comercial;
- contacto legal;
- notas.
Estado actual:
- URLs base, webhook e IP se muestran como asignación del backend;
- el tenant normal no puede editar campos de ruteo ni seguridad.

### `/dashboard/institucion`
Ficha simple del tenant normal:
- razón social;
- nombre comercial;
- contacto legal;
- estado;
- URLs asignadas por backend.
Estado actual:
- implementada como vista de consulta amigable;
- permite ir a edición controlada en `/dashboard/perfil`.

### `/dashboard/inscripcion`
Checklist de inscripción PUI:
- estado de onboarding;
- cumplimiento por ambiente;
- IP / webhook / URLs asignadas;
- próximos pasos.
Estado actual:
- implementada como vista de seguimiento simple;
- concentra pasos de inscripción y cumplimiento inicial.

### `/dashboard/credenciales`
Estado de credenciales e identidad técnica:
- Llave MX;
- e.Firma;
- estado de credenciales por ambiente;
- URLs/IP asignadas.
Estado actual:
- implementada como vista de consulta para tenants normales;
- no expone secretos.

### `/dashboard/monitoreo`
Resumen operativo del tenant:
- reportes activos y cerrados;
- última actividad;
- compliance rápido por ambiente;
- enlaces directos a reportes e inscripción.
Estado actual:
- implementada como vista de consulta simple para tenants normales;
- usa reportes recientes y compliance para mostrar el estado operativo sin saturar la pantalla.

### `/dashboard/usuarios`
Resumen del equipo del tenant:
- usuarios activos;
- MFA;
- bloqueos;
- roles asignados.
Estado actual:
- implementada como vista de consulta y gestión limitada para tenants normales;
- permite invitar usuarios y cambiar estado en alcance acotado;
- lista usuarios del tenant y sus roles sin exponer acciones globales.

### `/dashboard/roles`
Resumen de acceso del tenant:
- roles asignados;
- permisos visibles;
- miembros por rol;
- acceso del usuario actual.
Estado actual:
- implementada como vista de consulta y asignación limitada para tenants normales;
- permite cambiar el rol activo de cada usuario dentro del catálogo del tenant;
- expone el catálogo de roles y permisos asignados al tenant.

### `/dashboard/auditoria`
Bitácora estructurada:
- filtros;
- detalle de request;
- payload redacted;
- correlación con reportes y coincidencias.

### `/dashboard/reportes`
Bandeja operativa:
- activos;
- pendientes;
- con error;
- desactivados;
- fase 3.

### `/dashboard/reportes/<id>`
Expediente completo:
- resumen;
- resumen simple;
- fases en formato legible;
- enlaces a trazabilidad;
- cierre / desactivación.
Estado actual:
- vista simplificada para usuario;
- acciones técnicas movedizas a auditoría;
- detalle de fases resumido para no saturar la pantalla.

### `/dashboard/compliance`
Checklist y evidencias:
- SAST;
- DAST;
- SCA;
- hardening;
- sandbox;
- validación productiva.

### `/dashboard/demo`
Vista opcional de presentación.
Sandbox y validación funcional:
- login de prueba;
- activación de prueba;
- historial sandbox;
- exportación de evidencia.

### `/dashboard/soporte`
Soporte técnico controlado:
- diagnóstico;
- jobs pendientes;
- reintentos;
- resincronización;
- revisión de payload.

### `/dashboard/tenants`
Administración de tenants de renta:
- listado;
- alta;
- detalle;
- estado de cumplimiento;
- configuración de URLs e IPs.
Estado actual:
- vista implementada para la cuenta maestra;
- no disponible para tenants normales;
- las URLs base QA/Productivo se derivan automáticamente al crear el tenant.

### Relación con la propuesta extendida
- `Docs/Vistas_Propuestas_App_PUI_Geoactiv_MultiTenant.md` propone además vistas de `institucion`, `inscripcion`, `integracion`, `credenciales`, `monitoreo`, `usuarios` y `roles`.
- Las tres primeras de esa familia ya quedaron implementadas en la UI actual como `institucion`, `inscripcion` y `credenciales`.
- El resto permanece como objetivo del roadmap: la estructura actual ya separa maestro vs tenant y permite evolucionar a ese mapa sin romper la arquitectura.

## Matriz por vista

| Vista | Campos principales | Acciones principales | API / dato clave | Estado |
| --- | --- | --- | --- | --- |
| `/dashboard/login` | usuario, contraseña, tenant opcional, mensaje de estado | iniciar sesión, cambiar contraseña, abrir demo | `POST /admin/auth/login`, `POST /admin/auth/change-password` | Implementada |
| `/dashboard` | KPIs, alertas, actividad reciente, salud de integración | navegar a módulos, recargar estado | `GET /admin/me`, `GET /admin/integrations`, `GET /admin/reports` | Implementada |
| `/dashboard/integraciones` | datos institucionales, webhook, credenciales, ambientes, conectividad | activar/desactivar, probar conectividad, resincronizar | `GET/POST /admin/integrations/*` | Implementada |
| `/dashboard/auditoria` | endpoint, request id, HTTP, JWT, fecha, fields redacted | filtrar, abrir detalle, exportar | `GET /admin/audit/requests`, `GET /admin/audit/requests/{id}/fields` | Implementada |
| `/dashboard/reportes` | id búsqueda, CURP, fase, status, origen, coincidencias | abrir detalle, desactivar, filtrar | `GET /admin/reports` | Implementada |
| `/dashboard/reportes/<id>` | resumen, fases, coincidencias, timeline, desactivaciones | reintentar, pausar, exportar expediente | `GET /admin/reports/{id}`, `/phases`, `/deactivations` | Implementada |
| `/dashboard/compliance` | checklist, SAST/DAST/SCA, ambiente, vigencia, artefactos | cargar evidencia, descargar, marcar faltantes | `GET/POST /admin/compliance/*` | Implementada |
| `/dashboard/institucion` | razón social, contacto legal, estado, URLs asignadas | ir a edición controlada, recargar | `GET /admin/tenant-profile` | Implementada |
| `/dashboard/inscripcion` | checklist de onboarding, compliance por ambiente, URLs/IP | revisar checklist, ir a compliance/integraciones | `GET /admin/tenant-profile`, `GET /admin/compliance/status` | Implementada |
| `/dashboard/credenciales` | Llave MX, e.Firma, credenciales por ambiente, URLs/IP | revisar estado, ir a inscripción/compliance | `GET /admin/tenant-profile` | Implementada |
| `/dashboard/onboarding` | folio, URLs asignadas, IP/webhook, Llave MX, e.Firma, compliance por ambiente | revisar avance, ir a institución/inscripción/credenciales | `GET /admin/tenant-profile`, `GET /admin/compliance/status` | Implementada |
| `/dashboard/monitoreo` | reportes activos/cerrados, última actividad, compliance rápido | abrir reportes, revisar compliance, ir a inscripción | `GET /admin/reports`, `GET /admin/compliance/status` | Implementada |
| `/dashboard/usuarios` | usuarios del tenant, roles, MFA, bloqueos | invitar, suspender/reactivar, revisar equipo | `GET/POST /admin/tenant-users`, `PATCH /admin/tenant-users/{user_id}/status` | Implementada |
| `/dashboard/roles` | roles del tenant, permisos visibles, miembros por rol | cambiar rol, revisar acceso, ir a usuarios | `GET /admin/tenant-roles`, `GET /admin/tenant-users`, `PATCH /admin/tenant-users/{user_id}/role`, `GET /admin/me` | Implementada |
| `/dashboard/perfil` | razón social, nombre comercial, contacto legal, notas | editar datos propios, recargar | `GET /admin/tenant-profile`, `PATCH /admin/tenant-profile` | Implementada |
| `/dashboard/demo` | usuario demo, tenant demo, últimos resultados sandbox | ejecutar demo, exportar evidencia | `DemoBanner`, login de sandbox, rutas demo | Implementada |
| `/dashboard/soporte` | jobs, colas, reintentos, incidentes, salud técnica | diagnosticar, reintentar conectividad, resincronizar tablero, observar scheduler fase 3 | `GET /admin/me`, `GET /admin/integrations`, `GET /admin/audit/requests`, `GET /admin/reports`, `GET /admin/compliance/status`, `GET /admin/scheduler/jobs`, `POST /admin/integrations/{id}/connectivity-test` | Implementada |
| `/dashboard/tenants` | listado, alta, detalle, cumplimiento, URLs, IPs | crear tenant, revisar, editar configuración, suspender | `GET /admin/tenants`, `POST /admin/tenants`, `GET /admin/tenants/{tenant_id}`, `PATCH /admin/tenants/{tenant_id}`, `POST /admin/tenants/{tenant_id}/activate`, `POST /admin/tenants/{tenant_id}/suspend`, `GET /admin/tenants/{tenant_id}/compliance/status` | Implementada |
| `/dashboard/qa` | checks backend, resumen sesión, datos de prueba | ejecutar checks, inspección, soporte temporal | `useQaChecks` + endpoints admin | Temporal |

## Relación con la implementación actual

- Implementado hoy: `login`, `home`, `integraciones`, `auditoria`, `reportes`, `reportes/<id>`, `compliance`, `institucion`, `inscripcion`, `credenciales`, `perfil`, `demo`, `tenants`.
- Temporal: `qa`.
- Implementada: `soporte`.
- Compatibilidad heredada: `/dashboard/app`.

## Checklist de implementación por vista

### `/dashboard/login`
- [x] Formulario de acceso.
- [x] Soporte para tenant opcional.
- [x] Cambio de contraseña requerido.
- [x] Acceso directo a demo.

### `/dashboard`
- [x] Resumen ejecutivo básico.
- [x] Guard de sesión.
- [x] Acceso a módulos.

### `/dashboard/integraciones`
- [x] Datos del tenant activo.
- [x] Acciones activar/desactivar.
- [x] Prueba de conectividad.
- [ ] Resincronización operativa completa.

### `/dashboard/auditoria`
- [x] Lista con filtros.
- [x] Detalle de request fields.
- [ ] Exportación CSV/JSON.

### `/dashboard/reportes`
- [x] Lista de reportes.
- [x] Filtros por status/origen/búsqueda.
- [ ] Tabs de fase 3 / pendientes de cierre histórico.

### `/dashboard/reportes/<id>`
- [x] Resumen del caso.
- [x] Fases.
- [x] Desactivaciones.
- [ ] Timeline visual completo.
- [ ] Acciones de reintento/pausa formales.

### `/dashboard/compliance`
- [x] Checklist y evidencias.
- [x] Carga y descarga de artefactos.
- [ ] Gating productivo completo por policy.

### `/dashboard/institucion`
- [x] Resumen simple del tenant normal.
- [x] Contacto legal visible.
- [x] URLs asignadas por backend visibles.
- [x] CTA a edición controlada.

### `/dashboard/inscripcion`
- [x] Checklist de onboarding.
- [x] Estado por ambiente.
- [x] Identificación de faltantes.
- [x] CTA a compliance e integraciones.

### `/dashboard/credenciales`
- [x] Estado de Llave MX/e.Firma.
- [x] Estado de credenciales por ambiente.
- [x] URLs/IP visibles sin exponer secretos.
- [x] CTA a inscripción y compliance.

### `/dashboard/onboarding`
- [x] Resumen de alta técnica y documental.
- [x] URLs/IP asignadas por backend visibles.
- [x] Llave MX/e.Firma y compliance por ambiente visibles.
- [x] CTA a institución, inscripción, credenciales, compliance e integraciones.

### `/dashboard/perfil`
- [x] Datos editables del tenant normal.
- [x] URLs/webhook/IP en solo lectura.
- [x] Bloqueo para cuenta global.

### `/dashboard/demo`
- [x] Entrada guiada de presentación.
- [x] Sandbox visible.
- [x] Bloqueo de acciones de escritura.
- [ ] Historial sandbox enriquecido.

### `/dashboard/soporte`
- [x] Vista formal de soporte técnico.
- [x] Diagnóstico y lectura rápida del estado.
- [x] Prueba de conectividad por integración.
- [x] Resincronización de tablero.
- [ ] Resincronización operativa completa de backend.

### `/dashboard/tenants`
- [x] Listado de tenants de renta.
- [x] Alta guiada de tenant nuevo.
- [x] Detalle del tenant.
- [x] Edición de URLs/IPs/seguridad.
- [x] Suspensión / activación.
- [x] Vista de cumplimiento por tenant.
- [x] Restricción visible solo para cuenta maestra.

### `/dashboard/qa`
- [x] Vista temporal de soporte / pruebas.
- [x] Checks backend.
- [ ] Retiro o migración a soporte formal.

## Backlog priorizado por vista

### Prioridad 1: cerrar operación base
1. `/dashboard/reportes`
2. `/dashboard/reportes/<id>`
3. `/dashboard/integraciones`

Objetivo:
- terminar la operación principal del caso;
- tener expediente completo;
- dejar conectividad y acciones de integración firmes.

### Prioridad 2: cerrar trazabilidad y cumplimiento
1. `/dashboard/auditoria`
2. `/dashboard/compliance`

Objetivo:
- exportación y trazabilidad completa;
- gating productivo por policy;
- evidencia auditable por ambiente.

### Prioridad 3: consolidar experiencia de presentación
1. `/dashboard/demo`
2. enriquecer historial sandbox

Objetivo:
- demo clara para clientes;
- flujo de presentación sin riesgo;
- evidencia de sandbox reutilizable.

### Prioridad 4: formalizar soporte
1. `/dashboard/soporte`
2. migrar o retirar `/dashboard/qa`

Objetivo:
- sacar QA de la zona temporal;
- crear diagnóstico controlado;
- evitar que soporte dependa de pantallas de pruebas.

### Prioridad 5: hardening funcional restante
1. resincronización operativa completa
2. exportación CSV/JSON de auditoría
3. timeline visual completo
4. acciones formales de reintento/pausa
5. tabs de fase 3 y cierres históricos

## Tabla operativa del backlog

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

## Orden recomendado de desarrollo

1. `/dashboard`
2. `/dashboard/reportes`
3. `/dashboard/reportes/<id>`
4. `/dashboard/integraciones`
5. `/dashboard/auditoria`
6. `/dashboard/compliance`
7. `/dashboard/demo`
8. `/dashboard/soporte`

## Nota de implementación

La ruta `/dashboard/app` debe tratarse como compatibilidad heredada durante la transición, no como entrada principal.
