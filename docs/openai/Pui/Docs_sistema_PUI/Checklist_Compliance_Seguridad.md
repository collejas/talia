# Checklist Compliance de Seguridad (PUI) — para sujetos obligados

> Este checklist aplica por `tenant` y por `ambiente`. La plataforma Geoactiv es el contenedor SaaS; el cumplimiento documental y operativo se registra por institución/tenant.

Este checklist está alineado al Manual Técnico y sirve como guía operativa dentro del dashboard.

## A) Operación técnica (no sustituible por archivos)
- [x] URL base definida y publicada por ambiente (QA/Prod).
- [x] Endpoints requeridos implementados y protegidos con JWT:
  - [x] `/login`
  - [x] `/activar-reporte`
  - [x] `/activar-reporte-prueba`
  - [x] `/desactivar-reporte`
- [x] TLS 1.2+ activo (HTTPS).
- [x] Logs/auditoría habilitados (sin datos sensibles) para:
  - [x] solicitudes recibidas,
  - [x] acciones ejecutadas,
  - [x] respuestas enviadas.
- [x] Flujo por fases soportado (1/2/3) y trazable.
- [ ] Allowlist IP / ACL aplicada a `/pui/*` (por ambiente y/o tenant) (soportado vía `PUI_IP_ALLOWLIST_ENABLED=1` + `PUI_IP_ALLOWLIST_CIDRS=...` + hardening Nginx cuando PUI entregue IPs).
- [x] Rate limiting / antiabuso aplicado a endpoints públicos (`/pui/*`) (Nginx `limit_req`).
- [ ] Hardening completo de headers (CSP, ocultar banners/versiones, etc.) (CSP/base headers aplicados; pendiente revisar ocultamiento/banners y ajustes finos).
- [ ] Tokens no reutilizables (criterio y enforcement) para endpoints PUI según Manual (implementado y configurable vía `PUI_JWT_SINGLE_USE=1`).
- [x] Enforcement fino de permisos por endpoint/acción (no solo JWT válido).

## B) Evidencias SAST/DAST/SCA (por tenant y ambiente)

Para cada tenant autorizado y para cada ambiente (`qa`, `productivo`):
- [x] SAST cargado/registrado (archivo + metadatos).
- [x] DAST cargado/registrado (archivo + metadatos).
- [x] SCA cargado/registrado (archivo + metadatos).
- [x] Las evidencias incluyen:
  - [x] fecha de ejecución,
  - [x] ambiente,
  - [x] URLs evaluadas (URL base + endpoints),
  - [x] herramienta/metodología,
  - [x] resultado.

Política sugerida:
- [x] `vigencia_días` definida (ej. 60) y alertas configuradas (< 7 días para vencer).

## D) Cómo obtener evidencias (GitHub Actions)

En el repo `collejas/PUI`:
- SAST:
  - Workflow: `Security - CodeQL (SAST)` (resultados en pestaña “Security” de GitHub).
    - Nota: este workflow requiere habilitar **Code scanning** en el repo (Settings → Code security and analysis → Code scanning).
  - Workflow: `Security - Semgrep (SAST)` (artefacto `sast-semgrep` con `semgrep.json`/`semgrep.sarif`).
- SCA:
  - Workflow: `Security - SCA (Dependencies)` (artefactos `sca-python` y `sca-node`).
- DAST:
  - Workflow principal para expediente del Manual: `Security - DAST API (OWASP ZAP)` (manual `workflow_dispatch`, artefacto `dast-zap-api-<ambiente>`).
  - Workflow complementario de hardening host-level: `Security - DAST (OWASP ZAP)` (artefacto `dast-zap-<ambiente>`).

Flujo recomendado para registrar en dashboard:
1. Ejecutar workflow en GitHub Actions (QA y/o Productivo).
2. Descargar el artefacto del run.
3. Subirlo en `https://pui.geoactiv.mx/dashboard/compliance` como evidencia del tipo/ambiente.

### D.1) Descargar artefactos con `gh` (CLI)

En cualquier máquina donde tengas `gh` autenticado (tu servidor o tu laptop):

1) Identifica el `run_id` del workflow:
- `gh run list --workflow "Security - Semgrep (SAST)" --limit 5`
- `gh run list --workflow "Security - SCA (Dependencies)" --limit 5`
- `gh run list --workflow "Security - DAST API (OWASP ZAP)" --limit 5`
- `gh run list --workflow "Security - DAST (OWASP ZAP)" --limit 5`

2) Descarga artefactos por run:
- `gh run download <run_id> --dir /tmp/pui_security_artifacts/semgrep`
- `gh run download <run_id> --dir /tmp/pui_security_artifacts/sca`
- `gh run download <run_id> --dir /tmp/pui_security_artifacts/zap-api`
- `gh run download <run_id> --dir /tmp/pui_security_artifacts/zap`

3) Archivos sugeridos para subir como evidencia:
- SAST: `semgrep.sarif` o `semgrep.json`
- SCA: `npm-audit.json` (Node) y/o `pip-audit.json` (Python) (uno o ambos según aplique)
- DAST Manual/Técnico: `report_html.html`, `report_json.json`, `report_md.md` y `openapi.json` del artefacto `dast-zap-api-<ambiente>`
- DAST complementario: `report_html.html` o `report_json.json` del artefacto `dast-zap-<ambiente>`

El dashboard marcará **“Falta”** mientras no existan evidencias vigentes registradas en la tabla `public.compliance_evidences` para el tenant y el ambiente activos.

## C) Regla de gating (Productivo)
- [ ] Si falta cualquier evidencia requerida en `productivo`, bloquear:
  - [ ] “Activar integración productiva”
  - [ ] “Rotar credenciales productivas” (opcional, recomendado)
- [ ] Para `DAST`, exigir evidencia de API-scan autenticado sobre `URL_BASE + endpoints` con severidades High/Medium/Low en cero.
- [ ] No aprobar `DAST` si el API-scan reporta `Unexpected Content-Type was returned` u otra observación Low/Medium/High sobre `/pui` o endpoints obligatorios.

## E) URLs por ambiente (recomendación operativa)
- QA/Sandbox (URL_BASE): `https://pui-qa.geoactiv.mx/pui`
- Productivo (URL_BASE): `https://pui-prod.geoactiv.mx/pui`
