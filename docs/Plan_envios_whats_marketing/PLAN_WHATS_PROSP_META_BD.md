# Plan de rediseño · Whats-Prosp solo Meta + BD

Fecha: 2026-07-16
Ruta: `docs/Plan_envios_whats_marketing/PLAN_WHATS_PROSP_META_BD.md`

## 1) Objetivo

Rehacer `Whats-Prosp` para que:

1. deje de usar Twilio en ese flujo especifico;
2. use solo plantillas nativas de Meta;
3. deje de depender de configuracion temporal en `settings/variables`;
4. pase a un modelo persistente en base de datos;
5. quede listo para reportes, auditoria y cobro futuro.

Este plan no elimina Twilio del resto de la app.
Solo saca Twilio de la parte de `Whats-Prosp`.

## 2) Alcance

Incluye:

- pestaña `Whats-Prosp` en `settings/variables`;
- modelo de datos para plantillas de WhatsApp Marketing usadas en prospeccion;
- lectura y seleccion de esas plantillas desde `prospeccion/prospectos`;
- validacion runtime para envios con Meta;
- base para trazabilidad de plantilla usada.

No incluye todavia:

- eliminar Twilio de voice;
- eliminar Twilio del resto de WhatsApp general;
- borrar webhooks o servicios legacy globales;
- refactor total del canal WhatsApp.

## 3) Decision de arquitectura

### 3.1 Regla principal

`Whats-Prosp` deja de operar con `SID` de Twilio.

Desde este cambio, `Whats-Prosp` debe trabajar solo con datos nativos de Meta:

- `template_name`
- `language_code`
- `meta_category`

### 3.2 Config vs BD

La configuracion del canal puede seguir en `settings/variables` para cosas tecnicas como:

- proveedor activo general,
- `phone_number_id`,
- `page_access_token`,
- tokens o secretos.

Pero el catalogo de plantillas de `Whats-Prosp` ya no debe vivir en config/json.

Debe vivir en BD con columnas explicitas.

## 4) Modelo de negocio correcto

Para `Whats-Prosp`, una plantilla ya no es solo configuracion tecnica.

Es una entidad operativa porque:

- se consulta frecuentemente,
- se selecciona en flujos de prospeccion,
- define que mensaje sale,
- debe auditarse,
- puede reportarse,
- y despues puede participar en cobro.

Por eso debe existir una tabla dedicada.

## 5) Modelo de datos propuesto

### 5.1 Tabla principal

Tabla sugerida:

- `public.whatsapp_prospeccion_templates`

Columnas sugeridas:

- `id uuid primary key`
- `organizacion_id uuid not null`
- `template_name text not null`
- `language_code text not null`
- `meta_category text not null`
- `display_name text not null`
- `description text`
- `status text not null`
- `active boolean not null default true`
- `created_by uuid`
- `updated_by uuid`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 5.2 Columnas obligatorias

Para Meta en `Whats-Prosp` deben ser obligatorias:

- `template_name`
- `language_code`
- `meta_category`

### 5.3 Categoria oficial de Meta

La categoria oficial del proveedor debe guardarse como columna real.

Valores iniciales esperados:

- `marketing`
- `utility`
- `authentication`

Aunque en `Whats-Prosp` lo mas probable es que casi todo sea `marketing`, igual conviene modelarlo bien desde el inicio.

### 5.4 Unicidad

Agregar unique por tenant para evitar duplicados:

- unique `(organizacion_id, template_name, language_code)`

## 6) Constraints e indices

### 6.1 Constraints

Checks sugeridos:

- `meta_category in ('marketing','utility','authentication')`
- `status in ('draft','approved','rejected','archived')`

### 6.2 Indices

Indices sugeridos:

- index `(organizacion_id, active)`
- index `(organizacion_id, meta_category)`
- index `(organizacion_id, status)`
- index `(organizacion_id, created_at desc)`

## 7) Relacion con ejecucion

### 7.1 Seleccion por ID

`prospeccion/prospectos` no debe seguir cargando plantillas por strings sueltos desde config.

Debe seleccionar una plantilla por:

- `template_id`

### 7.2 Snapshot historico

Cuando se ejecute un batch o envio, se debe guardar snapshot minimo de la plantilla usada.

Campos sugeridos:

- `template_id`
- `template_name_snapshot`
- `language_code_snapshot`
- `meta_category_snapshot`
- `display_name_snapshot`

Eso evita perder trazabilidad si la plantilla cambia despues.

## 8) Cambios de frontend

### 8.1 Settings

La pestaña `Whats-Prosp` debe dejar de pedir SIDs.

Debe pasar a administrar un catalogo Meta con campos como:

- nombre visible,
- `template_name`,
- `language_code`,
- `meta_category`,
- estado activo.

### 8.2 Prospeccion

En `prospeccion/prospectos` el usuario debe elegir entre plantillas Meta registradas en BD.

No debe escribir:

- `HX...`
- ni strings manuales de config.

### 8.3 UX esperada

La UI debe dejar claro:

- que `Whats-Prosp` usa solo Meta,
- que la plantilla debe existir y estar aprobada,
- y que la seleccion se hace desde el catalogo persistente.

## 9) Cambios de backend

### 9.1 CRUD de plantillas

Se propone crear endpoints dedicados:

- `GET /api/crm/prospeccion/whatsapp/templates`
- `POST /api/crm/prospeccion/whatsapp/templates`
- `PATCH /api/crm/prospeccion/whatsapp/templates/{id}`
- `GET /api/crm/prospeccion/whatsapp/templates/{id}`
- `POST /api/crm/prospeccion/whatsapp/templates/{id}/activate`
- `POST /api/crm/prospeccion/whatsapp/templates/{id}/archive`

### 9.2 Runtime de envio

El runtime de `Whats-Prosp` debe resolver la plantilla seleccionada y enviar usando:

- `template_name`
- `language_code`

Ya no debe requerir `twilio_content_sid` para ese flujo.

### 9.3 Validaciones

El backend debe validar:

- ownership por tenant;
- que la plantilla exista;
- que este activa;
- que tenga categoria Meta valida;
- que el tenant tenga configurado Meta para WhatsApp;
- que el template seleccionado pertenezca al tenant actual.

## 10) Migracion funcional

### 10.1 Cortar Twilio solo en Whats-Prosp

Se debe quitar la dependencia funcional de:

- `whatsapp.templates.prospeccion`
- cualquier campo de `SID` Twilio usado solo por `Whats-Prosp`

### 10.2 Mantener Twilio fuera de este alcance

No se toca todavia:

- WhatsApp general legacy;
- voice;
- otros modulos que aun dependan de Twilio.

### 10.3 Compatibilidad temporal

Si hace falta una transicion corta, puede existir lectura temporal de datos viejos solo para migracion interna.

Pero el destino final de `Whats-Prosp` debe ser solo Meta + BD.

## 11) Backlog propuesto

### A. Base de datos

- [ ] Crear tabla `whatsapp_prospeccion_templates`
- [ ] Agregar constraints de categoria y estado
- [ ] Agregar unique `(organizacion_id, template_name, language_code)`
- [ ] Agregar indices operativos
- [ ] Definir columnas snapshot en la tabla operativa de batch/envio

### B. Backend

- [ ] Crear schemas Pydantic
- [ ] Crear CRUD de plantillas
- [ ] Ajustar runtime de `Whats-Prosp` para Meta-only
- [ ] Quitar validacion que asume `twilio_content_sid` en `Whats-Prosp`
- [ ] Guardar snapshot de plantilla usada

### C. Frontend

- [ ] Rehacer pestaña `Whats-Prosp` sin SIDs
- [ ] Mostrar catalogo Meta persistente
- [ ] Ajustar `prospeccion/prospectos` para seleccionar `template_id`
- [ ] Mostrar errores claros cuando falte configuracion Meta o plantilla aprobada

### D. QA

- [ ] Test de create/update/list por tenant
- [ ] Test de unique por `template_name + language_code`
- [ ] Test de seleccion correcta en prospeccion
- [ ] Test de envio runtime sin Twilio SID
- [ ] Test de snapshot historico

## 12) Riesgos

- dejar logica vieja de Twilio mezclada en `Whats-Prosp`;
- guardar plantilla seleccionada solo en metadata;
- no snapshotear datos y perder auditoria;
- confundir categoria oficial de Meta con reglas internas del producto;
- seguir usando `settings/variables` como catalogo en lugar de BD.

## 13) Resultado esperado

Al terminar este plan:

- `Whats-Prosp` opera solo con Meta;
- ya no depende de SIDs de Twilio;
- las plantillas viven en BD;
- `prospeccion/prospectos` selecciona plantillas reales;
- el sistema deja base limpia para reportes, auditoria y cobro futuro;
- y Twilio queda aislado para retirarlo despues en un refactor aparte.
