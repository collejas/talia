# Prospección · Backend y endpoints

Archivo principal: `backend/app/api/routes/crm.py`
Repositorio principal: `backend/app/repositories/crm.py`

## Estado actual

- La estrategia de deduplicación por identidad y retención ya está aplicada en producción.
- DENUE conserva resultados con ventana de 5 días y tiene purga automática activa.
- Las búsquedas DENUE viejas ya fueron depuradas junto con sus dependencias operativas.
- `prospeccion_prospectos.busqueda_id` ya no se debe tratar como una dependencia destructiva para la limpieza de resultados.
- La deuda técnica pendiente es sólo de optimización futura de rendimiento si el volumen vuelve a crecer.

## 1) Búsquedas Google

- `POST /crm/prospeccion/google/busquedas`
- `GET /crm/prospeccion/google/busquedas`
- `DELETE /crm/prospeccion/google/busquedas/{busqueda_id}`
- `GET /crm/prospeccion/google/resultados`
- `GET /crm/prospeccion/google/resultados/map`
- `GET /crm/prospeccion/google/resultados/bounds`
- `DELETE /crm/prospeccion/google/resultados`

## 2) Búsquedas DENUE

- `POST /crm/prospeccion/denue/busquedas`
- `GET /crm/prospeccion/denue/busquedas`
- `DELETE /crm/prospeccion/denue/busquedas/{busqueda_id}`
  - Forma parte de la limpieza profunda de DENUE ya aplicada.
  - La eliminación de búsquedas antiguas ya no debe borrar prospectos útiles convertidos previamente.
- `GET /crm/prospeccion/denue/jobs/{job_id}`
- `POST /crm/prospeccion/denue/jobs/{job_id}/cancel`
- `GET /crm/prospeccion/denue/resultados`
- `GET /crm/prospeccion/denue/resultados/map`
- `GET /crm/prospeccion/denue/resultados/bounds`
- `GET /crm/prospeccion/denue/actividades`
- `GET /crm/prospeccion/denue/catalogos`
- `GET /crm/prospeccion/denue/scian/clase-indice`
- `DELETE /crm/prospeccion/denue/resultados`

## 3) Prospectos

- `GET /crm/prospeccion/prospectos`
- `GET /crm/prospeccion/prospectos/preferences`
- `GET /crm/prospeccion/prospectos/views`
- `GET /crm/prospeccion/prospectos/queries`
- `GET /crm/prospeccion/prospectos/contact-indicadores`
- `POST /crm/prospeccion/prospectos`
- `POST /crm/prospeccion/prospectos/manual`
- `PUT /crm/prospeccion/prospectos/preferences`
- `PUT /crm/prospeccion/prospectos/views`
- `PATCH /crm/prospeccion/prospectos/{prospecto_id}`
- `DELETE /crm/prospeccion/prospectos/{prospecto_id}`
  - `POST /crm/prospeccion/prospectos/bulk-delete`
  - `POST /crm/prospeccion/prospectos/verificar-telefonos`
- `POST /crm/prospeccion/prospectos/checklist/lookup`
- `POST /crm/prospeccion/prospectos/checklist/scraper`
- `GET /crm/prospeccion/prospectos/checklist`
- `POST /crm/prospeccion/prospectos/contactar`
- `GET /crm/prospeccion/prospectos/{prospecto_id}/contactos`
- `GET /crm/prospeccion/prospectos/{prospecto_id}/audit`
- `POST /crm/prospeccion/prospectos/{prospecto_id}/convertir-contacto`
  - Si un prospecto ya existe y vuelve a entrar por una búsqueda nueva, el flujo debe hacer `upsert` por identidad, no crear duplicados.
  - Para DENUE/Google la identidad primaria es `organizacion_id + fuente + external_id`; si falta `external_id`, el flujo cae a la identidad de resultado.

## 4) Contacto y campañas

- `GET /crm/prospeccion/contacto/batches`
- `GET /crm/prospeccion/contacto/batches/{batch_id}`
- `POST /crm/prospeccion/contacto/batches/{batch_id}/cancelar`
- `GET /crm/prospeccion/contacto/batches/{batch_id}/stream`
- `GET /crm/prospeccion/contacto/envios`
- `POST /crm/prospeccion/contacto/envios/{envio_id}/reintentar`
- `GET /crm/prospeccion/contacto/logs`
- `GET /crm/prospeccion/contacto/suppressions`
- `GET /crm/prospeccion/contacto/templates`
- `GET /crm/prospeccion/contacto/templates/brevo-catalog`
- `POST /crm/prospeccion/contacto/templates`
- `POST /crm/prospeccion/contacto/templates/import-brevo`
- `POST /crm/prospeccion/contacto/suppressions`
- `PATCH /crm/prospeccion/contacto/suppressions/{suppression_id}`
- `PATCH /crm/prospeccion/contacto/templates/{template_id}`
- `DELETE /crm/prospeccion/contacto/templates/{template_id}`
- `GET /crm/prospeccion/contacto/listas`
- `POST /crm/prospeccion/contacto/listas`
- `PATCH /crm/prospeccion/contacto/listas/{lista_id}`
- `DELETE /crm/prospeccion/contacto/listas/{lista_id}`
- El endpoint legacy `GET /crm/prospeccion/contacto/metrics` fue retirado el
  2026-08-21. Las métricas globales viven en
  `GET /crm/prospeccion/metricas`; el detalle operativo vive en los endpoints
  de lotes, envíos y logs.
- `GET /crm/prospeccion/whatsapp/readiness`
- `GET /crm/prospeccion/whatsapp/atribucion/reglas`
  - Soporta `include_historial=true` para incluir versiones cerradas (`vigente_hasta` no nulo).
- `POST /crm/prospeccion/whatsapp/atribucion/reglas`
- `PATCH /crm/prospeccion/whatsapp/atribucion/reglas/{regla_id}`
  - Versiona automáticamente cuando cambian campos de atribución (`frase_objetivo`, `tipo_match`, `canal_publicitario`, `campana_publicitaria`, `adset`, `anuncio`, `prioridad`).
  - Conserva histórico y crea nueva versión vigente.
- `DELETE /crm/prospeccion/whatsapp/atribucion/reglas/{regla_id}`
- `POST /crm/prospeccion/whatsapp/atribucion/reglas/simular`
- `GET /crm/prospeccion/metricas`
  - Dashboard unificado de prospección (campañas + frases WhatsApp).
  - Filtros globales: `date_from`, `date_to`, `campana_id`, `canal`, `campana_publicitaria`, `regla_id`, `limit`.
  - Incluye:
    - `campanas.summary`, `campanas.items`, `campanas.timeseries`.
    - `frases_whatsapp.summary`, `frases_whatsapp.by_channel`, `frases_whatsapp.by_rule`, `frases_whatsapp.timeseries`.
- `GET /crm/prospeccion/metricas/export/xlsx`
  - Exporta workbook XLSX multi-hoja del tablero de métricas.
  - Respeta los mismos filtros que `GET /crm/prospeccion/metricas`.
- `POST /crm/prospeccion/contacto/brevo/webhook`
  - Exposición pública recomendada (panel/proxy):
    - `POST /api/prospeccion/contacto/brevo/webhook`
    - Reenvía a backend `POST /crm/prospeccion/contacto/brevo/webhook`.
- `GET /crm/prospeccion/campanas`
- `GET /crm/prospeccion/campanas/atribucion`
  - Incluye `sesiones_utm` y `click_to_session_pct` para atribución correo (UTM + ids técnicos `cid/tid`).
- `GET /crm/prospeccion/campanas/{campana_id}/duplicar`

## 5) Servicios internos relevantes

- `google_search_jobs.py`: procesamiento asíncrono Google.
- `denue_search_jobs.py`: procesamiento asíncrono DENUE.
- `prospeccion_contact_sender.py`: worker de envíos por canal.
- `prospeccion_auto_promoter.py`: promoción automática a CRM según señales.

## 6) Inbox reutilizado para prospección (en curso)

- Endpoint base: `GET /crm/inbox/threads`
- Filtros ya soportados para prospección:
  - `source` (ej. `prospeccion`)
  - `source=publicidad_whatsapp` (atribución por frase)
  - `channel` (ej. `whatsapp`)
  - `batch_id`
  - `campana_id`

## 7) Notas operativas recientes

- `POST /crm/prospeccion/prospectos/contactar` requiere header `X-Organizacion-Id`.
- `GET /crm/prospeccion/whatsapp/readiness` permite validar configuración Twilio/plantilla antes de lanzar lotes.
