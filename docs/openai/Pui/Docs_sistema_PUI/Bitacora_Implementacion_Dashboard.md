# Bitacora de Implementacion - Dashboard Multitenant

## 2026-04-21

### Estado del dia
- Se agregaron las vistas self-service del tenant normal:
  - `/dashboard/institucion`
  - `/dashboard/onboarding`
  - `/dashboard/inscripcion`
  - `/dashboard/credenciales`
- Se agrego la vista `/dashboard/monitoreo` como resumen operativo simple del tenant normal.
- Se agregaron las vistas `/dashboard/usuarios` y `/dashboard/roles` como consultas simples del tenant normal.
- El header del dashboard ahora prioriza esas vistas para tenants normales y mantiene separado el flujo de la cuenta maestra.
- La documentacion de arquitectura y roadmap se alineo con la propuesta extendida de vistas SaaS multi-tenant.

### Cambios aplicados (frontend)
- Se implementaron vistas simples y amigables para tenant normal:
  - Institución: resumen editable-controlado del tenant.
  - Onboarding: resumen de alta técnica y documental antes de producción.
  - Inscripción: checklist de onboarding/compliance.
  - Credenciales: estado técnico y Llave MX/e.Firma sin exponer secretos.
- Monitoreo: resumen operativo con reportes recientes y compliance rápido.
- Usuarios: listado del equipo del tenant con roles y MFA.
- Roles: resumen de roles visibles y permisos asignados.
- Se ajusto la navegacion principal para mostrar primero las vistas propias del tenant normal.

## 2026-04-20

### Estado del dia
- Estado general: **Cumplimiento de seguridad (SAST/DAST/SCA) evidenciado** en QA y Productivo.
- Evidencias en dashboard: `https://pui.geoactiv.mx/dashboard/compliance` (tenant maestro `geoactiv-pui-sbx`).
- Expediente offline listo: `Archivos_cumplimiento/expediente_2026-04-20_012002/` y `paquete_entrega_pui_2026-04-20.tgz`.
- Modelo operativo documentado: tenant maestro Geoactiv + tenants de renta, con evidencia y trazabilidad segregadas por tenant y por ambiente.

### Cambios aplicados (seguridad/compliance)
- DAST válido para manual: **ZAP API-scan autenticado (OpenAPI + JWT)** sobre URL_BASE + endpoints obligatorios, en QA y Productivo.
- Evidencias cargadas en Compliance:
  - `SAST` (CodeQL) en `qa` y `productivo` (SARIF).
  - `SCA` (pip-audit) en `qa` y `productivo` (JSON).
  - `DAST` (OWASP ZAP API-scan) en `qa` y `productivo` (TGZ con `openapi.json` + reportes).
- Endurecimiento aplicado:
  - JWT single-use configurable (`PUI_JWT_SINGLE_USE=1`).
  - Enforce permisos por endpoint en `/pui/*` (403 si no hay permiso).
  - Rate limiting Nginx (`limit_req`) para `/pui/*` y `/admin/*`.
  - Security headers + CSP estricta para `/pui/*` y `/admin/*` (API-only).
  - Soporte de allowlist IP por configuración (`PUI_IP_ALLOWLIST_ENABLED` + `PUI_IP_ALLOWLIST_CIDRS`).

### Cambios aplicados (presentacion/demo)
- Se agrego un modo demo/sandbox visible en el frontend para presentar la app sin datos reales.
- El login ahora prellena usuario y tenant sandbox cuando `NEXT_PUBLIC_DEMO_MODE=true`.
- Se bloquean acciones de escritura en integraciones, compliance y desactivacion de reportes durante demo.
- Se consolido `https://pui.geoactiv.mx/dashboard/demo` como entrada unica de presentacion.
- Se documento el flujo de presentacion en `Docs/Guia_Demo_Sandbox_Presentacion.md`.
- Se formalizo la arquitectura de vistas en `Docs/Arquitectura_Vistas_Dashboard_PUI.md`.
- La vista y el selector de tenant quedaron restringidos para que solo la cuenta maestra cambie tenant; los tenants de renta operan con tenant fijo y menu simplificado.

### Cambios aplicados (soporte/diagnostico)
- Se creo la vista formal `https://pui.geoactiv.mx/dashboard/soporte`.
- La vista de soporte expone un tablero de diagnostico de solo lectura con:
  - sesion activa,
  - integraciones recientes,
  - auditoria reciente,
  - reportes recientes,
  - estado resumido de compliance.
- Se agregaron acciones operativas reales para soporte:
  - reintento de diagnostico de conectividad por integracion,
  - resincronizacion del tablero con el backend.
- Se implemento la resincronizacion formal de reportes en backend:
  - `POST /admin/reports/{report_id}/resync`
  - `GET /admin/resync/tasks`
- Se implemento el scheduler base de fase 3:
  - `scheduled_search_jobs` y `job_executions`
  - arranque automatico por entorno con `PUI_PHASE3_SCHEDULER_ENABLED=1`
  - vista de soporte con jobs recientes de fase 2/3
- Se conecto la semantica de fase 2/3 a comparacion CURP y notificaciones outbound hacia la PUI para coincidencias detectadas por el scheduler.
- La fase 2 ya cierra con `busqueda-finalizada` al completar su corrida.
- La portada `/dashboard` se enriquecio con KPIs de integraciones, compliance y actividad reciente para operar como resumen ejecutivo.
- La vista `/dashboard/reportes/<id>` se simplifico para mostrar resumen, fases legibles y cierre sin saturar al usuario con tablas tecnicas.
- Se simplifico el flujo de acceso: `/dashboard/login` entra directo al dashboard y `/dashboard/demo` quedo solo como vista opcional de presentacion.
- Se agregaron accesos directos a `Demo` y `Soporte` en el header global.
- Se alineo la documentacion de rutas para marcar `/dashboard/soporte` como implementada.

### Cambios aplicados (tenants de renta)
- Se implemento la vista `/dashboard/tenants` y `/dashboard/tenants/nuevo` para la cuenta maestra.
- Se agrego el endpoint `POST /admin/tenants` para alta guiada de tenants de renta.
- El alta crea automaticamente las integraciones por ambiente y deriva las URLs base QA/Productivo a partir del `tenant_slug`.
- Se agrego la vista `/dashboard/tenants/<id>` con detalle, edicion controlada y acciones de activar/suspender.
- Se agregaron los endpoints `PATCH /admin/tenants/{tenant_id}`, `POST /admin/tenants/{tenant_id}/activate` y `POST /admin/tenants/{tenant_id}/suspend`.
- Se agrego la vista de compliance por tenant dentro del detalle y el endpoint `GET /admin/tenants/{tenant_id}/compliance/status`.
- Se agrego la vista self-service `/dashboard/perfil` para tenants normales; URL, webhook e IP quedan de solo lectura y las asigna el backend.
- Se dejo el acceso de tenants restringido solo a la cuenta maestra o soporte autorizado.
- Se integro la propuesta extendida de vistas multi-tenant en la documentacion del plan:
  - `Docs/Vistas_Propuestas_App_PUI_Geoactiv_MultiTenant.md`
  - `Docs/Arquitectura_Vistas_Dashboard_PUI.md`
  - `Docs/Plan_Implementacion_Dashboard_Multitenant.md`
  - `Docs/Requisitos_Gobierno_PUI.md`

## 2026-04-17

### Estado del dia
- Estado general: **MVP operativo**.
- Landing publica: `https://pui.geoactiv.mx/`.
- Dashboard admin: `https://pui.geoactiv.mx/dashboard`.

### Cambios aplicados

#### Backend FastAPI (`/admin/*`)
- Se implementaron endpoints base de autenticacion:
  - `POST /admin/auth/login`
  - `GET /admin/me`
- Se implemento cambio de contraseña inicial:
  - `POST /admin/auth/change-password`
- Se implemento modulo multitenant inicial:
  - `GET /admin/tenants`
  - `POST /admin/tenant-context`
- Se implemento modulo de integraciones (lectura):
  - `GET /admin/integrations`
- Se implemento modulo de auditoria (lectura):
  - `GET /admin/audit/requests`
  - `GET /admin/audit/requests/{request_id}/fields`

#### Frontend Next.js (`/dashboard`)
- Se creo proyecto `frontend/` con:
  - Next.js + App Router
  - TailwindCSS
  - shadcn/ui
- Se publico pantalla MVP con:
  - login admin,
  - carga de perfil (`/admin/me`),
  - seleccion de tenant y persistencia en sesion,
  - vista de integraciones por tenant,
  - vista de auditoria con paginacion/filtros,
  - flujo de cambio obligatorio de contraseña.

#### Infraestructura
- `pui.service` activo en `127.0.0.1:8080` para FastAPI.
- `pui-frontend.service` activo en `127.0.0.1:3000` para Next.js.
- Nginx ajustado para:
  - mantener landing en `/`,
  - exponer dashboard en `/dashboard`,
  - enrutar `/pui/*` y `/admin/*` al backend.

### Validaciones realizadas
- Login real con usuario maestro global.
- Cambio de contraseña validado de punta a punta.
- Tenant context validado (antes `tenant_id=null`, despues tenant aplicado).
- Integraciones por tenant y auditoria consultadas con datos reales.
- `npm run lint` + `npm run build` del frontend sin errores.
- `python -m py_compile` en backend admin sin errores.

### Datos de referencia operativa
- Usuario admin usado: `collejas` / `administracion@geoactiv.mx`.
- Tenant activo validado: `0f26df80-d9cb-44bf-a421-d29b4083ef31`.

### Pendientes inmediatos
1. UX:
   - auto-carga de auditoria al aplicar tenant,
   - formato amigable de fechas y estados.
2. Integraciones:
   - acciones de activar/desactivar,
   - prueba de conectividad desde dashboard.
3. Reportes:
   - modulo de `pui_reports` + fases.
4. Seguridad:
   - logout/revocacion de sesion,
   - timeout idle por actividad.

### Actualizacion adicional (2026-04-17, bloque de pruebas backend)
- Se implementaron acciones de integraciones en backend:
  - `POST /admin/integrations/{id}/activate`
  - `POST /admin/integrations/{id}/deactivate`
  - `POST /admin/integrations/{id}/connectivity-test`
- Se agrego validacion de permisos por endpoint admin (`tenant.integrations.read/write`, `tenant.audit.read`).
- Se mejoro dashboard MVP:
  - auto-carga de integraciones y auditoria al aplicar tenant,
  - formato legible de fechas,
  - badges visuales para estado HTTP y activo/inactivo,
  - bloque `Pruebas backend (QA)` con checks ejecutables en la misma pantalla.
- Validaciones extra realizadas:
  - `activate/deactivate/connectivity-test` ejecutados en dominio productivo.
  - `connectivity-test` actualiza `last_connectivity_test_at` incluso si probe falla.
  - sin tenant activo, `GET /admin/integrations` responde error controlado.
  - login invalido incrementa `failed_login_count` y login valido lo normaliza.
  - filtros de auditoria (`endpoint_code`, `http_status`) validados.
  - redaccion de campos sensibles (`telefono`, `correo`) validada.

### Actualizacion adicional (2026-04-17, hardening de sesiones y aislamiento)
- Se implemento `POST /admin/auth/logout` con revocacion de sesion en `user_sessions`.
- Se habilito renovacion de `idle_expires_at` en cada request autenticado (`/admin/*`).
- Se agrego auditoria de acciones administrativas en `audit_events` para:
  - `tenant_context.set`,
  - `integration.activate`,
  - `integration.deactivate`,
  - `integration.connectivity_test`,
  - `auth.logout`.
- Se extendio `require_admin_auth` para capturar `remote_ip` y `user_agent` en eventos admin.
- Se crearon datos de prueba controlados para validar aislamiento entre tenants.

#### Validaciones del bloque
- Sesion expirada (`expires_at`) responde `401`.
- Sesion expirada por inactividad (`idle_expires_at`) responde `401`.
- Logout revoca token y `GET /admin/me` posterior responde `401`.
- Usuario sin `tenant.integrations.write` recibe `403` en acciones de integracion.
- Usuario local tenant no puede cambiar a tenant ajeno (`403`).
- Intentar accionar integracion de tenant distinto responde error controlado (`404`).
- Cambio de tenant de usuario global cambia inmediatamente alcance de datos.
- `GET /admin/audit/requests/{request_id}/fields` no expone datos de otro tenant.

### Actualizacion adicional (2026-04-17, modulo reportes y fases en MVP)
- Se implementaron endpoints admin de reportes:
  - `GET /admin/reports`
  - `GET /admin/reports/{report_id}/phases`
  - `GET /admin/reports/{report_id}/deactivations`
  - `POST /admin/reports/{report_id}/deactivate`
- Se aplico RBAC en backend:
  - `tenant.reports.read` para lectura de reportes/fases/historial,
  - `tenant.reports.write` para desactivacion.
- Se agrego trazabilidad en `audit_events` para la accion `report.deactivate`.
- Se extendio la pantalla `/dashboard` con el bloque **Reportes y fases**:
  - filtros por status/origen/busqueda,
  - paginacion server-side,
  - consulta de fases e historial por reporte,
  - desactivacion de reporte desde UI.

#### Validaciones del bloque
- `GET /admin/reports` responde `200` con tenant activo y filtra correctamente.
- `GET /admin/reports/{id}/phases` responde `200` para reporte del tenant activo.
- `GET /admin/reports/{id}/deactivations` responde `200`.
- `POST /admin/reports/{id}/deactivate` responde `200` y cambia estado a `closed`.
- Usuario sin permiso de escritura (`qa_platform_ops`) recibe `403` al desactivar.
- Intento de operar reporte con tenant distinto devuelve `404` sin fuga de datos.
- `npm run lint` y `npm run build` del frontend pasan sin errores.

### Actualizacion adicional (2026-04-17, separacion de vistas login/app)
- Se separo el flujo visual en dos rutas de dashboard:
  - `https://pui.geoactiv.mx/dashboard/login`
  - `https://pui.geoactiv.mx/dashboard/app`
- Se agrego redireccion de `https://pui.geoactiv.mx/dashboard` hacia `/dashboard/login`.
- Se movio la implementacion MVP a componente compartido para reutilizar logica entre vistas.
- Se agrego persistencia de sesion frontend en `localStorage`:
  - token,
  - expiracion de sesion,
  - tenant seleccionado.
- Se agregaron guardas de navegacion:
  - en `/dashboard/app` sin token -> redireccion a `/dashboard/login`,
  - login exitoso en `/dashboard/login` -> redireccion a `/dashboard/app`,
  - logout en `/dashboard/app` -> redireccion a `/dashboard/login`.

#### Validaciones del bloque
- `npm run lint` y `npm run build` del frontend en verde.
- `pui-frontend.service` reiniciado y activo.
- Smoke HTTP:
  - `/dashboard` responde `307` (redirect),
  - `/dashboard/login` responde `200`,
  - `/dashboard/app` responde `200`.

### Actualizacion adicional (2026-04-17, pruebas automatizadas backend iniciales)
- Se agrego directorio `tests/` con pruebas automatizadas usando `unittest`.
- Archivos de prueba agregados:
  - `tests/test_admin_auth.py`
  - `tests/test_admin_tenant_context.py`
  - `tests/test_admin_reports.py`
  - `tests/test_admin_integrations.py`
  - `tests/test_admin_audit.py`
  - `tests/test_pui_endpoints.py`
- Se agrego `httpx==0.28.1` en `requirements.txt` para habilitar `fastapi.testclient`.

#### Cobertura validada
- Auth admin:
  - login OK,
  - `/admin/me` con token,
  - cambio de contraseña OK y error de contraseña actual inválida.
- Tenant context:
  - cambio de tenant OK,
  - rechazo por tenant no permitido (`403`),
  - rechazo sin Bearer (`401`).
- Reportes:
  - listado de reportes,
  - fases por reporte,
  - desactivación por permisos,
  - rechazo por permisos insuficientes (`403`),
  - aislamiento de tenant con `404` controlado.
- Integraciones:
  - lectura de integraciones,
  - activar/desactivar,
  - prueba de conectividad,
  - rechazo por permisos insuficientes (`403`).
- Auditoría:
  - listado paginado y filtrado por endpoint/status,
  - campos por request,
  - respuesta controlada para request fuera de tenant (lista vacía).
- Regresión `/pui/*`:
  - `GET /pui/health`,
  - `POST /pui/login` (éxito y error controlado),
  - `POST /pui/activar-reporte`,
  - `POST /pui/activar-reporte-prueba`,
  - `POST /pui/desactivar-reporte`,
  - validación de rechazo por falta de Bearer en endpoint protegido (`401`).

#### Resultado de ejecución
- `python -m unittest discover -s tests -p 'test_*.py'`:
  - **30 pruebas ejecutadas, 30 OK**.

---

## 2026-04-18
### Estado del dia
- Se inicia separacion visual (Home vs QA) manteniendo la pantalla MVP para pruebas backend.

### Cambios aplicados
- Frontend:
  - `/dashboard` ahora es Home (entrada principal).
  - Se crea `/dashboard/qa` para mantener la pantalla MVP/QA.
  - `/dashboard/app` queda como redirect temporal a `/dashboard/qa`.
  - Post-login navega a `/dashboard` (home).
  - `/dashboard/login` ahora es una vista limpia (login dedicado), sin bloques de QA.
  - Se agrega `/dashboard/compliance` (evidencias SAST/DAST/SCA por ambiente) y gating para Productivo.

### Validaciones realizadas
- `frontend/` compila con `npm run build` (rutas: `/`, `/login`, `/qa`, `/app` dentro del basePath `/dashboard`).

### Pendientes inmediatos
1. Convertir la vista QA en modulos/rutas reales (`integraciones`, `auditoria`, `reportes`).
2. Reubicar/renombrar la pantalla QA a un area de soporte si se mantiene a largo plazo.
3. Agregar módulo Compliance (SAST/DAST/SCA) con gating para Productivo.

---

## 2026-04-19

### Estado del dia
- Seguridad/Compliance: **OK en QA y Productivo** (SAST/DAST/SCA con evidencias cargadas).
- Ambientes por subdominio definidos:
  - QA/Sandbox: `https://pui-qa.geoactiv.mx/pui`
  - Productivo: `https://pui-prod.geoactiv.mx/pui`

### Cambios aplicados
- Infra (DNS/TLS/Nginx):
  - Se crearon vhosts para `pui-qa.geoactiv.mx` y `pui-prod.geoactiv.mx` en Nginx (HTTP→HTTPS) apuntando a FastAPI en `127.0.0.1:8080` bajo `/pui/*`.
  - Se emitió certificado Let’s Encrypt para ambos subdominios.
- DB (integraciones):
  - Se actualizó `tenant_pui_integrations` del tenant sandbox para usar `https://pui-qa.geoactiv.mx/pui`.
  - Se creó registro `production` con `https://pui-prod.geoactiv.mx/pui` (inicia `active=false`).
- CI/Seguridad:
  - Se ejecutó OWASP ZAP para Productivo apuntando a `https://pui-prod.geoactiv.mx/pui/health` y se cargó evidencia.
  - Se ajustó SCA para referir los subdominios de QA/Prod (base_url) y se cargó evidencia.
  - Se ajustó CodeQL para repos privados: exporta SARIF como artefacto (sin depender de “Code scanning” habilitado).
- Backend:
  - Fix: `GET /admin/compliance/evidence` ya no falla por validación Pydantic (UUID→string en respuestas).

### Validaciones realizadas
- DNS resuelve subdominios a `67.205.156.148`.
- HTTPS activo en:
  - `https://pui-qa.geoactiv.mx/`
  - `https://pui-prod.geoactiv.mx/`
- `GET /admin/compliance/status` devuelve OK para SAST/DAST/SCA en `qa` y `productivo`.
- `GET /admin/compliance/evidence` devuelve `200` y lista historial.
- UI: `https://pui.geoactiv.mx/dashboard/compliance` carga status + historial sin 500.

### Pendientes inmediatos
1. Formalizar “Productivo” como ambiente operativo real (activar integración productiva cuando aplique).
2. Definir checklist hardening adicional (headers, rate-limit, allowlist IP si aplica) y evidencias complementarias.

## Plantilla para siguientes entradas

```text
## YYYY-MM-DD
### Estado del dia
- ...

### Cambios aplicados
- ...

### Validaciones realizadas
- ...

### Pendientes inmediatos
1. ...
```
