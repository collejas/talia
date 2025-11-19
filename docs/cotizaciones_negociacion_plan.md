# Plan de Cotizaciones y Seguimiento de Negociación

## Contexto
- El CRM actual ya diferencia etapas de demo y negociación; la UI guarda información granular en `metadata.stage_prep`, pero no existe una entidad que modele cotizaciones ni un rastro claro de envíos previos.
- Durante la transición de demo a negociación se necesita generar una cotización formal (PDF) y enviarla por correo o WhatsApp, pudiendo iterar varias versiones antes del cierre.
- También es clave que el tablero muestre en qué leads ya se envió propuesta y que los KPIs midan el avance post-cotización.

## Objetivos
- Registrar **múltiples cotizaciones por lead**, con historial, versión y estado.
- Generar un PDF consistente (basado en una plantilla) que pueda enviarse como adjunto en correo o archivo en WhatsApp.
- Reflejar en la etapa de negociación que ya existe una cotización enviada (badges, campos obligatorios, métricas).
- Automatizar recordatorios posteriores al envío para no perder seguimiento.

## Cambios de Datos
- Crear tabla `lead_cotizaciones`:
  - Campos sugeridos: `id`, `tarjeta_id` (FK), `version`, `conceptos jsonb`, `subtotal`, `impuestos`, `total`, `moneda`, `valido_hasta`, `estado` (`borrador`, `enviada`, `aceptada`, `rechazada`), `canal_envio`, `enviada_por`, `enviada_en`, `pdf_path`, `pdf_url`, `metadatos`.
  - Índices por `tarjeta_id`, `estado`, `enviada_en`.
  - Trigger opcional que escriba el último resumen en `lead_tarjetas.metadata.stage_prep.negociacion`.
- Registrar cada envío en `lead_movimientos` con metadata `{"quote_id": ..., "version": ..., "canal": ...}` para que aparezca en el historial del drawer.
- Buckets de Supabase: `quotes/{lead_id}/{uuid}.pdf` con políticas públicas de solo lectura.

## Backend / APIs
1. **Servicio de cotizaciones (`app/services/quotes.py`)**
   - Construye contexto del lead/ítems y renderiza HTML (Jinja2).
   - Genera PDF (e.g. `weasyprint`) y lo sube al bucket, devolviendo URL y metadatos.
2. **Endpoints FastAPI**
   - `POST /leads/{lead_id}/quotes`: crea versión nueva, almacena en `lead_cotizaciones`, retorna preview + URL.
   - `POST /leads/{lead_id}/quotes/{quote_id}/send`: acepta canal (`email`, `whatsapp`), manda el PDF y actualiza campos (`estado`, `enviada_en`, `proposal_sent_at`).
   - `GET /leads/{lead_id}/quotes`: lista historial para la UI.
3. **Envío por correo**
   - Reutilizar `storage.fetch_email_template` + `send_email`, adjuntando el PDF y permitiendo personalizar el cuerpo.
4. **Envío por WhatsApp**
   - Extender `_send_whatsapp_reply` para soportar `media_url` (Twilio).
   - Registrar salida en `register_whatsapp_message`.
5. **Automatización**
   - Después de `quote_sent_at`, crear un `lead_recordatorios` automático (ej. 48h) o mover a sub-etapa de seguimiento si no hay respuesta.

## Frontend / UX
- **Drawer (Negociación)**:
  - Nuevo bloque “Cotizaciones” con tabla de versiones (versión, fecha, canal, total, estado, acciones Ver PDF / Reenviar / Clonar).
  - Botón “Generar y enviar” → abre modal para capturar ítems, validez, notas y canal; llama al endpoint y actualiza `stage_prep`.
- **Embudo / Tarjetas**:
  - Mostrar badge “Cotización enviada” cuando `metadata.stage_prep.negociacion.quote_sent_at` exista.
  - Actualizar `STAGE_REQUIRED_FIELDS` para exigir `quote_sent_at` antes de cerrar en “Cerrado ganado” o etapas avanzadas.
  - Tooltip o chip con la última versión enviada y monto estimado.
- **Historial**:
  - Reutilizar el nuevo `lead_movimientos` para mostrar eventos “Cotización v2 enviada por WhatsApp”.
- **Métricas**:
  - Agregar KPIs de “Leads con cotización” y “Conversiones post-cotización” en `section-cards` y `mapa-de-conversion`.

## Flujo End-to-End
1. Agente agenda demo desde el board (ya soportado).
2. Tras la demo, desde el drawer genera cotización (rellena ítems → API → PDF → se guarda versión 1).
3. Selecciona canal:
   - Email: se envía con adjunto; `lead_cotizaciones` marca `canal_envio=email`.
   - WhatsApp: se sube PDF a Twilio media URL y se manda el mensaje + link.
4. `lead_tarjetas.metadata.stage_prep.negociacion` se actualiza con `quote_sent_at`, `quote_channel`, `quote_total`, `quote_pdf_url`.
5. El board muestra el badge y bloquea avanzar sin la cotización requerida.
6. Si hay nuevas iteraciones, se repite paso 2; `version` incrementa y los registros anteriores quedan disponibles.
7. Recordatorios y métricas usan `lead_cotizaciones` para disparar tareas y reportar resultados.

## Pendientes / Próximos pasos
### Avances
- ✅ `lead_cotizaciones` creada + RLS/índices (`supabase/migrations/20260330_180000_lead_cotizaciones.sql`).
- ✅ RPCs para crear cotizaciones (`panel_lead_quote_create`) y marcar envío/aceptación (`panel_lead_quote_mark`) con sincronización hacia `lead_movimientos` y `stage_prep` (`supabase/migrations/20260330_181000_panel_lead_quotes.sql`).
- ✅ Endpoints del panel para listar/crear/actualizar cotizaciones, generar PDF y enviarlo por correo/WhatsApp (`/leads/{id}/quotes`, `/leads/{id}/quotes/send`, `/quotes/{id}/mark`) (`backend/app/api/routes/panel.py`).
- ✅ Servicio de PDFs y subida a Storage (`app/services/quotes.py`, `storage.upload_quote_document`).

### Próximos pasos
1. Validar con ventas los campos del template (ítems, impuestos, términos, firmas).
2. Ajustar la plantilla PDF (branding, fuentes) y validar con equipo legal/ventas.
3. Configurar bucket `quotes` en Storage (si no existe) y definir políticas públicas.
4. Ajustar frontend (drawer, modal, badges, métricas) para consumir los endpoints nuevos.
5. QA en staging de todo el flujo demo → cotización → negociación.
6. Documentar en `README`/playbooks cómo crear y enviar cotizaciones.

> Este archivo se irá actualizando conforme completemos cada hito para mantener seguimiento del plan.
