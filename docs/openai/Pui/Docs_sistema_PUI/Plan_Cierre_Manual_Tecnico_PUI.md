# Plan de cierre: cumplimiento total del Manual Técnico PUI

> Corte: **2026-04-20**  
> Alcance: **integración institucional PUI** (URL_BASE + endpoints obligatorios) + requisitos técnicos/operativos del Manual.  
> Modelo de operación: **tenant maestro Geoactiv + tenants de renta**. El expediente base documenta al tenant maestro; cada tenant de renta debe conservar su propio anexo de evidencia y cumplimiento.  
> Evidencia de seguridad (SAST/DAST/SCA) por ambiente: ver `Archivos_cumplimiento/expediente_2026-04-20_012002/`.

## 1) Qué ya está cerrado (base sólida)

**Integración inbound (institución recibe de PUI):**
- Endpoints institucionales bajo `URL_BASE`:
  - `POST /pui/login`
  - `POST /pui/activar-reporte`
  - `POST /pui/activar-reporte-prueba`
  - `POST /pui/desactivar-reporte`
- JWT operativo + TLS expuesto por Nginx.
- Persistencia y trazabilidad base (emisiones de token, solicitudes, reportes/fases, desactivaciones).

**Expediente de seguridad (prerrequisito de conectividad):**
- SAST, DAST (API-scan autenticado) y SCA ejecutados en `qa` y `productivo`.
- En el corte `2026-04-20`: sin High/Medium/Low (DAST) y sin findings/vulnerabilidades reportadas (SAST/SCA).

## 2) Qué falta para declarar “cumplimiento total” del Manual (priorizado)

Estos puntos son los que típicamente detienen la autorización “total”:

### A) Lado saliente hacia PUI (obligatorio para flujo por fases)
- Implementar y evidenciar llamadas salientes hacia PUI:
  - `/notificar-coincidencia`
  - `/busqueda-finalizada`
- Documentar URLs base de PUI (sandbox/productivo) y método de autenticación saliente.
- Probar idempotencia, reintentos y trazabilidad (request_id/correlation_id).

### B) Fase 3 (búsqueda continua) operativa
- Motor/scheduler de búsqueda continua:
  - ejecución periódica,
  - generación de notificaciones,
  - detención al recibir “baja/desactivar”.
- Estado actual: base operativa implementada para fase 2/3 (jobs programados + ejecuciones + observabilidad en soporte) y ya existe comparación CURP + notificación outbound contra la PUI; fase 2 también cierra con `/busqueda-finalizada`. Falta cerrar cobertura funcional completa de fuentes reales/casos de prueba para declarar el flujo total.
- Evidencia: bitácoras + registros de ejecuciones + casos de prueba reproducibles.

### C) Resincronización (tolerancia a fallos)
- Mecanismo explícito de resincronización:
  - reintentos,
  - recuperación tras downtime,
  - reconciliación de “pendientes” por ventana de tiempo.

### D) Cifrado biométrico AES-256-GCM (fotos/huellas)
- Implementar cifrado/descifrado conforme al Manual:
  - base64 + AES-256-GCM,
  - llave biométrica por institución/tenant (gestión/rotación),
  - evidencia de que no se persisten biométricos en claro.

### E) Controles de infraestructura y hardening (exigibles)
- Allowlist IP / ACL (por tenant y/o por ambiente) para endpoints `/pui/*`.
- Rate limiting / antiabuso para endpoints públicos.
- Hardening de headers de seguridad (CSP, HSTS, nosniff, frame-ancestors/XFO, etc.) y ocultamiento de banners/versiones.

### F) Tokens “no reutilizables” y control de acceso fino
- Definir/implementar criterio “no reusable” (según interpretación del Manual):
  - single-use por `jti` para ciertos endpoints, o
  - invalidación/rotación estricta por operación.
- Enforcement fino por permiso/acción en endpoints PUI (no solo “JWT válido”).

### G) Validaciones contractuales/catálogos del Manual
- Validaciones estrictas contra catálogos/anexos (ej. `lugar_nacimiento`):
  - códigos permitidos,
  - mapeos CURP (FORÁNEO/DESCONOCIDO, etc.),
  - rechazo explícito de valores fuera de catálogo.

### H) Expediente administrativo (no es solo código)
- Evidencias administrativas requeridas:
  - Llave MX (Persona Moral),
  - e.Firma vigente,
  - acuses/correos de aprobación,
  - pruebas funcionales/conectividad formalizadas.

## 3) Roadmap de implementación (fases)

### Fase 1 — Seguridad/infra (bloqueo productivo)
- Allowlist IP + rate limit + hardening headers.
- Enforce permisos por endpoint.
- Definir token no reutilizable (mínimo viable).
- Evidencia: DAST/SAST/SCA ya existe; sumar evidencia de hardening (DAST baseline complementario + config).

### Fase 2 — Integración saliente (fase 1/2)
- `/notificar-coincidencia` + `/busqueda-finalizada` (cliente HTTP).
- Evidencia: logs/auditoría + pruebas reproducibles + casos de error.

### Fase 3 — Operación fase 3 + resincronización
- Scheduler + job executions + resync.
- Evidencia: bitácora + pruebas controladas.

### Fase 4 — Cifrado biométrico AES-256-GCM
- Implementación + gestión de llaves + pruebas.

### Fase 5 — Expediente administrativo
- Anexos y acuses (fuera del repo si hay sensibles; referenciar en checklist de entrega).

## 4) Entregables de evidencia (para autorización)

- Paquete offline: `Archivos_cumplimiento/expediente_2026-04-20_012002/paquete_entrega_pui_2026-04-20.tgz`
- Matriz Manual→Evidencia: `Docs/reporte_cumplimiento_pui_manual.md`
- Dictamen comparativo: `Docs/reporte_comparativo_sast_dast_sca_vs_manual_pui.md`
- Plan operativo/arquitectura: `Docs/Plan_Implementacion_Dashboard_Multitenant.md`
- Alta de tenant de renta: `Docs/Vista_Alta_Tenant_Renta_PUI.md`
- Regla de operación por tenant: la autorización y el seguimiento se revisan por tenant maestro y, para cada tenant de renta, por su anexo independiente.
