# Plan integral · Prospección

## Resumen general
- [ ] **Contexto actual**  
  - Base de datos consolidada (`busquedas`, `resultados`, `prospeccion_prospectos`, `contactos`).  
  - Worker `ProspeccionContactSender` y endpoints `/prospeccion/*` listos para campañas multicanal.  
  - Documento operativo previo: `docs/plan_envios_prospeccion.md`.
- [ ] **Objetivo principal**  
  Construir una experiencia completa “Descubre → Enriquecer → Preparar → Lanzar → Evaluar”, habilitando campañas coordinadas de correo, WhatsApp y voz con métricas y handoff al CRM.

## Avances recientes
- [x] Multicanal: wizard en `/prospeccion/prospectos` + drawer y wizard reutilizado desde `/prospeccion/campanas` con presets que duplican filtros/plantillas.
- [x] Brevo: `send_email` usa API/`BREVO_API_KEY`, se guarda `messageId` y el webhook `/crm/prospeccion/contacto/brevo/webhook` sincroniza envíos/rebotes.

---

## 1. Descubre (Búsquedas geolocalizadas)
- [ ] Unificar `/prospeccion/google-busqueda` y `/prospeccion/denue-busqueda` bajo tabs permanentes.
- [ ] Mostrar contadores por búsqueda (resultados guardados, conversiones) usando `busquedas` + `prospeccion_prospectos`.
- [ ] Permitir etiquetar resultados antes de guardar (llenar `segmento` y `metadata -> tags`).

## 2. Enriquecer (Verificación y scraping)
- [x] Tarjetas guía en `/prospeccion/prospectos`:
  - [x] **Validar teléfonos** (Twilio Lookup) → actualiza `lookup_status`, `carrier_*`.
  - [x] **Scraper** (Google/DENUE) → llena `metadata.contacto`.
  - [x] **Captura manual** → fomenta completar email/puesto/notas.
- [x] Registrar cada acción en `prospeccion_prospectos_audit` y mostrar timeline por prospecto (tabs de historial en la vista de prospectos).
- [x] Añadir badge visual de canal permitido (teléfono fijo/móvil, WhatsApp sí/no, correo).

## 3. Preparar (Segmentación y listas inteligentes)
- [ ] Persistir `metadata.stage` (`discover/enrich/prepare/launch/evaluate`) y mostrar progreso global.
- [ ] Guardar filtros frecuentes como “listas inteligentes” (`prospeccion_contacto_batch.filtros` plantillas) para reutilizar.
- [x] Integrar botón “Convertir a contacto” → crear registro en `public.contactos` y marcar al prospecto como promovido (`metadata.convertido_contacto_id`).
- [ ] Considerar job/trigger que mueva prospectos verificados al embudo CRM (etapa “Prospección · Primer contacto”).

## 4. Lanzar (Constructor de campañas)
- [x] Diseñar wizard en `/prospeccion/prospectos`:
  1. Selección de lista/filtros (usa listas inteligentes).  
  2. Selección de canales + plantillas (`prospeccion_contacto_templates`).  
  3. Programación (usar `programado_en` por canal).  
  4. Confirmación y creación de lote (`prospeccion_contacto_batch` + `prospeccion_contacto_envio`).
- [x] Añadir drawer post-confirmación con historial de cada prospecto y CTA “Promover a CRM”.
- [x] Integrar Brevo para correo:  
  - [x] Modo SMTP (se mantiene como respaldo).  
  - [x] Modo API (send_email usa `BREVO_API_KEY/BREVO_BASE_URL` y almacena `messageId`).  
  - [x] Webhook `/crm/prospeccion/contacto/brevo/webhook` para mapear delivered/bounces hacia `prospeccion_contactos_log` y métricas. Documentado en `variables.md`.
- [x] Persistir el Buscador en BD:  
  - [x] Crear tablas `prospeccion_buscador_jobs` y `prospeccion_buscador_resultados` (migración Supabase + RLS).  
  - [x] Actualizar `BuscadorJobManager` para leer/escribir vía `CRMRepository` en vez de archivos.  
  - [x] Ajustar endpoints `/prospeccion/buscador/*` para usar datos persistidos (mismo contrato).  
  - [x] Exponer “Guardar resultado como prospecto” directamente desde estos registros.  
  - [x] Agregar historial de jobs en `/prospeccion/buscador` para reabrir resultados guardados.  
  - [x] Arreglar la conversión a prospecto desde resultados web (supresión de `contacto_datos`).

## 5. Evaluar (Campañas y métricas)
- [ ] Extender `/prospeccion/contactos` con agrupación por “campaña” (`campana_id` en batch o metadata).
- [ ] `/prospeccion/campanas`:  
  - [x] Mostrar secuencias (correo día 1, WhatsApp día 3…).  
  - [x] KPI por canal (entregados, fallidos, reintentos) usando `/api/prospeccion/contacto/metrics`.  
  - [x] Botón “Duplicar campaña” que clone filtros/plantillas.
- [ ] Exponer timeline completo (logs, estados Twilio, Brevo SID) desde `prospeccion_contactos_log`.
- [ ] Documentar runbook en `docs/plan_envios_prospeccion.md` (pausar lote, reintentar, monitoreo).

---

## Plan de acción detallado
1. [x] **Centralizar navegación**: barra/tabs “Descubre · Enriquecer · Preparar · Lanzar · Evaluar” en `/prospeccion`.
2. [x] **Checklist de enriquecimiento** en `/prospeccion/prospectos` con acciones automáticas (lookup, scraper, captura).
3. [x] **Wizard de campañas** con scheduling básico y soporte multicanal.
4. [ ] **Integración CRM** (crear contacto/oportunidad directamente desde el prospecto).
   - [x] Crear etapa inicial del pipeline (“Prospección · Primer contacto”) para leads provenientes de campañas /prospección (seed automático por tenant vía `ensure_prospeccion_stage`).
   - [x] Al convertir un prospecto, crear la oportunidad en esa etapa y poblar `metadata.source` con `Prospección – {fuente_busqueda}` (Google/DENUE/Búsqueda web).
   - [x] Registrar en `public.contactos` el canal usado en la campaña (correo/WhatsApp/voz) y bloquear recontacto automático (se guarda en `contacto_datos.prospeccion_canal` y el backend omite prospectos convertidos al programar nuevos envíos).
5. [x] **Agrupador de campañas + duplicación** en `/prospeccion/campanas`. _(botón Duplicar abre el wizard con presets del último lote y reutiliza el drawer de resultados)_.
6. [ ] **Indicadores de progreso** por etapa (basados en `metadata.stage`).
7. [x] **Brevo**: definir método elegido, ajustar `send_email`, registrar estados (webhook) y actualizar documentación.

---

## Dependencias y notas
- Datos: `supabase/migrations/20260921_120000_prospeccion_prospectos_core.sql`, `20260922_090000_prospeccion_contacto_envios.sql`.
- Backend: `backend/app/services/prospeccion_contact_sender.py` + endpoints `/crm/prospeccion/*`.
- Frontend: vistas en `frontend/panel/src/app/prospeccion/*`.
- Documentación relacionada:  
  - `docs/plan_envios_prospeccion.md`  
  - `docs/plan realizado para extender propspeccion.md`
- Multi-tenant:  
  - [x] Todas las tablas (existentes y nuevas) deben tener `organizacion_id uuid` y FK a `public.organizaciones`.  
  - [x] Políticas RLS por tenant (`organizacion_id = public.usuario_organizacion_id(auth.uid())`).  
  - [x] El backend debe poblar `organizacion_id` en cada inserción (`CRMRepository` usa claim o contexto del usuario / trigger).  
  - [ ] Validar que los procesos históricos (p. ej. migración del Buscador) asignen la organización correcta o la default.

Mantener este archivo como checklist vivo para coordinar equipo de producto, ingeniería y operaciones al consolidar la sección de prospección.
