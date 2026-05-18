# Checklist de entrega: expediente para autorizacion de conectividad PUI

Este checklist sirve para preparar el paquete que veran administradores de PUI (Gobierno) y avanzar en la autorizacion.

## Estado (corte 2026-04-20)

- [x] Evidencia consolidada (folder): `Archivos_cumplimiento/expediente_2026-04-20_012002/`.
- [x] Paquete listo para entrega (TGZ): `Archivos_cumplimiento/expediente_2026-04-20_012002/paquete_entrega_pui_2026-04-20.tgz`.
- [x] Evidencias registradas en dashboard (tenant maestro `geoactiv-pui-sbx`): `https://pui.geoactiv.mx/dashboard/compliance`.
- [ ] Cierre de faltantes para “cumplimiento total” del Manual (ver plan): `Docs/Plan_Cierre_Manual_Tecnico_PUI.md`.

## 1) Documentos base (fuentes)

- `Ducumentacion_Base/Manual_Tecnico_Plataforma_Unica_de_Identidad_Instituciones_Diversas.pdf`
- `Ducumentacion_Base/Guia_del_Sitio_de_Inscripcion_para_Instituciones_Diversas.pdf`
- `Ducumentacion_Base/LGMDFP_ref06_16jul24.pdf`

## 2) Alcance (explicito en la entrega)

- QA/Sandbox (URL_BASE): `https://pui-qa.geoactiv.mx/pui`
- Productivo (URL_BASE): `https://pui-prod.geoactiv.mx/pui`

Endpoints obligatorios bajo URL_BASE:

- `POST /pui/login`
- `POST /pui/activar-reporte`
- `POST /pui/activar-reporte-prueba`
- `POST /pui/desactivar-reporte`

## 3) Evidencia de seguridad (SAST/DAST/SCA) por ambiente

Evidencia consolidada (artefactos descargables):

- `Archivos_cumplimiento/expediente_2026-04-20_012002/`

Revisiones minimas antes de enviar:

- SAST (CodeQL/Semgrep):
  - SARIF sin findings (`runs[0].results.length == 0`) o findings triageados y sin impacto.
- SCA (pip-audit):
  - 0 vulnerabilidades (dependencias y fixes limpios).
- DAST API (ZAP API-scan, OpenAPI + JWT):
  - 0 High / 0 Medium / 0 Low (informational permitido).
  - El reporte incluye `openapi.json` usado para el scan.

## 4) Metodologia y trazabilidad (para auditoria)

- Referenciar el corte del expediente:
  - commit SHA y run IDs (GitHub Actions).
- Mantener separacion clara:
  - expediente de integracion PUI (URL_BASE) vs dashboard/admin/landing.

## 5) Entregables recomendados (paquete)

1. `Docs/Requisitos_Gobierno_PUI.md` (resumen normativo y tecnico desde PDFs).
2. `Docs/Plan_Implementacion_Dashboard_Multitenant.md` (arquitectura y decisiones operativas).
3. `Docs/reporte_cumplimiento_pui_manual.md` (matriz manual -> evidencia esperada).
4. `Docs/reporte_comparativo_sast_dast_sca_vs_manual_pui.md` (dictamen y semaforo).
5. Evidencias: `Archivos_cumplimiento/expediente_2026-04-20_012002/` (artefactos).

## 6) Nota operativa

La app (dashboard) sirve para gestionar evidencias y operacion interna, pero el expediente para PUI debe poder revisarse tambien fuera de la plataforma (artefactos + resumen).

En el modelo SaaS propuesto:

- el tenant maestro conserva la evidencia base y el expediente de referencia;
- cada tenant rentado debe tener su propio anexo regulatorio y sus propios registros de compliance;
- el dashboard debe permitir alternar tenant solo a la cuenta maestra autorizada.
