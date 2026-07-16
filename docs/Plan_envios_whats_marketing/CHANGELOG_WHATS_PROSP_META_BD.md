# Changelog · Whats-Prosp Meta + BD

Fecha: 2026-07-16
Ruta: `docs/Plan_envios_whats_marketing/CHANGELOG_WHATS_PROSP_META_BD.md`

## Regla de uso

Este es el changelog operativo único de esta carpeta.

Aquí se debe registrar cualquier cambio relevante que afecte:

- plan,
- diseño de datos,
- contratos backend,
- frontend,
- migraciones,
- o decisiones del refactor de `Whats-Prosp`.

## 2026-07-16

- Se descartó continuar con la solución anterior basada en dualidad Twilio/Meta dentro de `settings/variables`.
- Se decidió reiniciar el enfoque de `Whats-Prosp` desde una idea de negocio más correcta:
  - cortar Twilio solo en `Whats-Prosp`;
  - rediseñar esa parte nativa para Meta y base de datos.
- Se dejó explícito que este trabajo no elimina todavía Twilio del resto de la app.
- Se creó el plan maestro [PLAN_WHATS_PROSP_META_BD.md](/var/www/talia/docs/Plan_envios_whats_marketing/PLAN_WHATS_PROSP_META_BD.md).
- Se definió que `Whats-Prosp` debe usar solo:
  - `template_name`
  - `language_code`
  - `meta_category`
- Se aclaró que la categoría oficial de Meta:
  - `marketing`
  - `utility`
  - `authentication`
  no reemplaza por sí sola la semántica operativa del producto, pero sí debe modelarse explícitamente.
- Se analizó la estructura actual de prospección y se confirmó que:
  - `prospeccion_contacto_templates` ya existe;
  - `prospeccion_contacto_batch` y `prospeccion_contacto_envio` ya existen;
  - el problema real es que WhatsApp sigue dependiendo demasiado de `metadata`.
- Se decidió no crear un catálogo paralelo nuevo para `Whats-Prosp`.
- Se decidió reutilizar `prospeccion_contacto_templates`, normalizándola con columnas explícitas para Meta.
- Se documentó el diseño SQL en [02_DISENO_SQL_WHATS_PROSP_META_BD.md](/var/www/talia/docs/Plan_envios_whats_marketing/02_DISENO_SQL_WHATS_PROSP_META_BD.md).
- Se definió como estrategia de persistencia:
  - plantilla canónica por `template_id`;
  - snapshot histórico en batch;
  - snapshot histórico en envío.
- Se creó la migración inicial [20280711_090000_whats_prosp_meta_templates.sql](/var/www/talia/supabase/migrations/20280711_090000_whats_prosp_meta_templates.sql).
- La migración inicial:
  - agrega columnas explícitas Meta a `prospeccion_contacto_templates`;
  - agrega constraints de `provider`, `usage_scope`, `meta_category` y `template_status`;
  - agrega unicidad por tenant para `template_name + language_code`;
  - agrega referencia y snapshots en `prospeccion_contacto_batch`;
  - agrega referencia y snapshots en `prospeccion_contacto_envio`.
- Se documentó el contrato backend nuevo en [04_BACKEND_CONTRACTS.md](/var/www/talia/docs/Plan_envios_whats_marketing/04_BACKEND_CONTRACTS.md).
- Se fijó que el contrato nuevo de `Whats-Prosp` ya no debe aceptar:
  - `twilio_content_sid`
  - `meta_template_name`
  - `meta_template_language`
  como payload principal desde frontend.
- Se fijó que el frontend debe trabajar con:
  - `template_id`
  y que el backend resuelve y snapshotéa la plantilla Meta real.
- Se aplicó la migración `whats_prosp_meta_templates` en la base real vía Supabase MCP.
- Se verificó en base real que ya existen:
  - columnas explícitas Meta en `public.prospeccion_contacto_templates`;
  - constraints de integridad para `provider`, `usage_scope`, `meta_category` y `template_status`;
  - índice único tenant-aware para `template_name + language_code`;
  - columnas snapshot y FK canónica en `public.prospeccion_contacto_batch`;
  - columnas snapshot y FK canónica en `public.prospeccion_contacto_envio`.
- Se implementó el CRUD backend específico de `Whats-Prosp` en:
  - `GET /api/crm/prospeccion/whatsapp/templates`
  - `GET /api/crm/prospeccion/whatsapp/templates/{template_id}`
  - `POST /api/crm/prospeccion/whatsapp/templates`
  - `PATCH /api/crm/prospeccion/whatsapp/templates/{template_id}`
  - `DELETE /api/crm/prospeccion/whatsapp/templates/{template_id}`
- Se implementaron métodos dedicados de repositorio para `Whats-Prosp` Meta-only.
- Se agregó manejo explícito de conflicto único para plantillas Meta de `Whats-Prosp`.
- Se habilitó `metadata` auxiliar en la plantilla Meta de `Whats-Prosp` solo para datos complementarios de UI/CTA/tracking, sin volver a usar `metadata` como fuente estructural de:
  - `template_name`
  - `language_code`
  - `meta_category`
  - `template_status`
- Se refactorizó la construcción de canales de prospección para que WhatsApp resuelva desde plantilla canónica:
  - `whatsapp_template_id`
  - `template_name`
  - `template_language`
  - `meta_category`
  - snapshots visibles de la plantilla
- Se eliminó la exigencia de `campana_id` para plantillas `Whats-Prosp` Meta, permitiendo que funcionen como catálogo reutilizable y no como plantilla amarrada a una campaña específica.
- Se retiró, en el flujo operativo de `Whats-Prosp`, la dependencia funcional del `twilio_content_sid` como referencia principal.
- Se actualizó el worker de prospección WhatsApp para enviar por Meta usando:
  - `template_name`
  - `template_language`
  y para construir variables numéricas desde el cuerpo cuando existan placeholders tipo `{{1}}`, `{{2}}`, etc.
- Se actualizó el armado de batch y envíos para persistir:
  - `whatsapp_template_id`
  - `whatsapp_template_name_snapshot`
  - `whatsapp_language_code_snapshot`
  - `whatsapp_meta_category_snapshot`
  - `whatsapp_template_display_name_snapshot`
- Se adaptó el cliente compartido del panel para que `listContactoTemplates(...)` combine:
  - plantillas legacy de `correo` y `llamada`
  - plantillas nuevas `Whats-Prosp` Meta desde BD
- Se agregaron helpers frontend específicos:
  - `createWhatsProspTemplate(...)`
  - `updateWhatsProspTemplate(...)`
  - `deleteWhatsProspTemplate(...)`
- Se actualizó `prospeccion/prospectos` para dejar de inyectar `twilio_content_sid` al programar envíos de `Whats-Prosp`.
- Se actualizó el wizard de campañas de prospección para que WhatsApp ya no dependa de SID y use la plantilla seleccionada por `template_id`.
- Se actualizó `prospeccion/campanas` para que la gestión de plantillas WhatsApp use el contrato nuevo:
  - captura `template_name`
  - captura `language_code`
  - captura `meta_category`
  - captura `template_status`
  - elimina captura de SID Twilio dentro de la edición de plantilla `Whats-Prosp`
- Se dejó la vista `settings/variables -> Whats-Prosp` alineada con el nuevo modelo:
  - ya no captura SIDs;
  - conserva solo `prompt_id` y `prompt_version` de prospección;
  - muestra que las plantillas ahora se administran en el catálogo de plantillas en BD.
- Se implementó limpieza explícita de la config legacy `whatsapp.templates.prospeccion` al guardar `settings/variables` y `settings/tenants`, para evitar que reaparezca el arreglo viejo de SIDs por efecto de merge.
- Se validó sintaxis backend con `python3 -m py_compile` sobre los archivos tocados.
- No fue posible correr `tsc` real del panel porque el proyecto no tiene instalada localmente la dependencia `typescript` en `frontend/panel`.

## Pendientes abiertos

- probar manualmente el flujo completo en UI:
  - crear plantilla Meta;
  - seleccionar plantilla en `prospeccion/prospectos`;
  - generar batch;
  - verificar snapshots y referencias en BD.
- revisar si la vista de métricas y atribución debe dejar de mostrar o priorizar referencias legacy como `twilio_content_sid`.
- decidir si se hará backfill de registros históricos legacy desde `metadata/config`.
- continuar con el refactor mayor para retirar Twilio del resto de la app, fuera del alcance de este corte.
