# Prospección · Backend y endpoints

Archivo principal: `backend/app/api/routes/crm.py`
Repositorio principal: `backend/app/repositories/crm.py`

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
- `POST /crm/prospeccion/contacto/templates`
- `POST /crm/prospeccion/contacto/suppressions`
- `PATCH /crm/prospeccion/contacto/suppressions/{suppression_id}`
- `PATCH /crm/prospeccion/contacto/templates/{template_id}`
- `DELETE /crm/prospeccion/contacto/templates/{template_id}`
- `GET /crm/prospeccion/contacto/listas`
- `POST /crm/prospeccion/contacto/listas`
- `PATCH /crm/prospeccion/contacto/listas/{lista_id}`
- `DELETE /crm/prospeccion/contacto/listas/{lista_id}`
- `GET /crm/prospeccion/contacto/metrics`
  - Incluye `conversion_por_fuente` (`google_places`, `denue`, `usuario`) con base persistente vía RPC SQL.
- `GET /crm/prospeccion/whatsapp/readiness`
- `POST /crm/prospeccion/contacto/brevo/webhook`
- `GET /crm/prospeccion/campanas`
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
  - `channel` (ej. `whatsapp`)
  - `batch_id`
  - `campana_id`

## 7) Notas operativas recientes

- `POST /crm/prospeccion/prospectos/contactar` requiere header `X-Organizacion-Id`.
- `GET /crm/prospeccion/whatsapp/readiness` permite validar configuración Twilio/plantilla antes de lanzar lotes.
