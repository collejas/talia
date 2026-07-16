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

## Pendientes abiertos

- aplicar la migración en la base real;
- implementar repository methods y endpoints específicos;
- adaptar `prospeccion/prospectos` al contrato por `template_id`;
- eliminar la dependencia funcional vieja de `SID` dentro de `Whats-Prosp`;
- definir si habrá backfill de datos legacy desde `metadata/config`.
