# Backend contracts · Whats-Prosp solo Meta + BD

Fecha: 2026-07-16
Ruta: `docs/Plan_envios_whats_marketing/04_BACKEND_CONTRACTS.md`

## 1) Objetivo

Definir el contrato backend para el refactor de `Whats-Prosp` con estas reglas:

- `Whats-Prosp` deja de usar Twilio;
- `Whats-Prosp` usa solo Meta;
- las plantillas viven en BD;
- el frontend opera por `template_id`;
- batch y envío guardan snapshot histórico de la plantilla usada.

## 2) Fuente de verdad

La fuente de verdad de las plantillas de `Whats-Prosp` será:

- `public.prospeccion_contacto_templates`

filtrada por:

- `canal = 'whatsapp'`
- `usage_scope = 'whats_prosp'`
- `provider = 'meta'`

## 3) Entidad backend canónica

### 3.1 Plantilla de Whats-Prosp

Campos relevantes:

- `id`
- `organizacion_id`
- `canal`
- `provider`
- `usage_scope`
- `slug`
- `nombre`
- `descripcion`
- `cuerpo_texto`
- `template_name`
- `language_code`
- `meta_category`
- `template_status`
- `activo`
- `creado_por`
- `creado_en`
- `actualizado_en`

### 3.2 Regla de interpretación

Para este refactor:

- `nombre` = nombre visible interno en la UI
- `template_name` = nombre oficial aprobado en Meta
- `language_code` = idioma oficial aprobado en Meta
- `meta_category` = categoría oficial de Meta
- `template_status` = estado operativo/aprobación usado por GEOACTIV

## 4) Endpoints propuestos

### 4.1 Listar plantillas

`GET /api/crm/prospeccion/whatsapp/templates`

Query params sugeridos:

- `active=true|false`
- `template_status=approved|draft|rejected|archived`
- `meta_category=marketing|utility|authentication`
- `search=<texto>`
- `page=<n>`
- `page_size=<n>`

Respuesta:

```json
{
  "items": [
    {
      "id": "uuid",
      "nombre": "Prospección alcaldes",
      "template_name": "prospeccion_alcaldes_v1",
      "language_code": "es_MX",
      "meta_category": "marketing",
      "template_status": "approved",
      "activo": true,
      "descripcion": "Plantilla principal de prospección",
      "creado_en": "2026-07-16T12:00:00Z",
      "actualizado_en": "2026-07-16T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

### 4.2 Obtener una plantilla

`GET /api/crm/prospeccion/whatsapp/templates/{template_id}`

Respuesta:

```json
{
  "id": "uuid",
  "organizacion_id": "uuid",
  "canal": "whatsapp",
  "provider": "meta",
  "usage_scope": "whats_prosp",
  "slug": "prospectos-alcaldes-meta",
  "nombre": "Prospección alcaldes",
  "descripcion": "Plantilla principal",
  "cuerpo_texto": "Hola {{1}}, ...",
  "template_name": "prospeccion_alcaldes_v1",
  "language_code": "es_MX",
  "meta_category": "marketing",
  "template_status": "approved",
  "activo": true,
  "creado_en": "2026-07-16T12:00:00Z",
  "actualizado_en": "2026-07-16T12:00:00Z"
}
```

### 4.3 Crear plantilla

`POST /api/crm/prospeccion/whatsapp/templates`

Request body:

```json
{
  "slug": "prospectos-alcaldes-meta",
  "nombre": "Prospección alcaldes",
  "descripcion": "Plantilla principal",
  "cuerpo_texto": "Hola {{1}}, ...",
  "template_name": "prospeccion_alcaldes_v1",
  "language_code": "es_MX",
  "meta_category": "marketing",
  "template_status": "approved",
  "activo": true
}
```

Reglas server-side:

- `canal` se fija a `whatsapp`
- `provider` se fija a `meta`
- `usage_scope` se fija a `whats_prosp`
- `organizacion_id` se toma del usuario autenticado
- no aceptar `organizacion_id` enviado por frontend

### 4.4 Actualizar plantilla

`PATCH /api/crm/prospeccion/whatsapp/templates/{template_id}`

Request body parcial:

```json
{
  "nombre": "Prospección alcaldes v2",
  "descripcion": "Versión actualizada",
  "template_status": "approved",
  "activo": true
}
```

Campos editables:

- `slug`
- `nombre`
- `descripcion`
- `cuerpo_texto`
- `template_name`
- `language_code`
- `meta_category`
- `template_status`
- `activo`

Campos no editables por cliente:

- `id`
- `organizacion_id`
- `provider`
- `usage_scope`
- `canal`
- `creado_por`
- `creado_en`

### 4.5 Activar / archivar

Opcionalmente, si se quiere una semántica más explícita:

- `POST /api/crm/prospeccion/whatsapp/templates/{template_id}/activate`
- `POST /api/crm/prospeccion/whatsapp/templates/{template_id}/archive`

Esto evita que el frontend tenga que hacer PATCH “manual” para cambios operativos simples.

## 5) Schemas Pydantic sugeridos

### 5.1 Create

`WhatsProspTemplateCreate`

Campos:

- `slug: str`
- `nombre: str`
- `descripcion: str | None`
- `cuerpo_texto: str | None`
- `template_name: str`
- `language_code: str`
- `meta_category: Literal["marketing", "utility", "authentication"]`
- `template_status: Literal["draft", "approved", "rejected", "archived"]`
- `activo: bool = True`

### 5.2 Update

`WhatsProspTemplateUpdate`

Todos opcionales, con las mismas restricciones de tipo/enum.

### 5.3 Read

`WhatsProspTemplateRead`

Respuesta completa para frontend.

### 5.4 List item

`WhatsProspTemplateListItem`

Versión ligera para tablas/selectores.

## 6) Validaciones backend

### 6.1 Validaciones de integridad

El backend debe rechazar:

- `template_name` vacío
- `language_code` vacío
- `meta_category` fuera de catálogo
- `template_status` fuera de catálogo
- duplicado de `template_name + language_code` dentro del mismo tenant

### 6.2 Validaciones de tenant

El backend debe validar:

- que la plantilla pertenezca al `organizacion_id` resuelto por sesión
- que el usuario no pueda leer ni editar plantillas de otro tenant

### 6.3 Validaciones de runtime

Antes de enviar `Whats-Prosp`, el backend debe validar:

- que el tenant tenga Meta configurado
- que exista `meta.whatsapp.page_access_token`
- que exista `whatsapp.meta.phone_number_id`
- que la plantilla seleccionada exista
- que la plantilla esté `activa = true`
- que `template_status = 'approved'`

## 7) Contrato para ejecución de prospección

### 7.1 Entrada esperada desde frontend

En `prospeccion/prospectos`, para WhatsApp de prospección el frontend debe mandar:

```json
{
  "canal": "whatsapp",
  "template_id": "uuid"
}
```

No debe mandar:

- `twilio_content_sid`
- `meta_template_name`
- `meta_template_language`

como fuente principal.

### 7.2 Resolución interna

El backend debe resolver `template_id` a:

- `template_name`
- `language_code`
- `meta_category`

y debe snapshotear esos valores en:

- `prospeccion_contacto_batch`
- `prospeccion_contacto_envio`

### 7.3 Snapshot mínimo

Al crear batch/envío, persistir:

- `whatsapp_template_id`
- `whatsapp_template_name_snapshot`
- `whatsapp_language_code_snapshot`
- `whatsapp_meta_category_snapshot`
- `whatsapp_template_display_name_snapshot`

## 8) Respuesta operativa de ejecución

Cuando el backend cree batch/envíos, debe conservar en la respuesta datos útiles para el panel:

```json
{
  "ok": true,
  "batch_id": "uuid",
  "template": {
    "id": "uuid",
    "nombre": "Prospección alcaldes",
    "template_name": "prospeccion_alcaldes_v1",
    "language_code": "es_MX",
    "meta_category": "marketing"
  }
}
```

## 9) Errores canónicos sugeridos

### CRUD de plantillas

- `whats_prosp_template_not_found`
- `whats_prosp_template_duplicate`
- `whats_prosp_template_invalid_category`
- `whats_prosp_template_invalid_status`
- `whats_prosp_template_forbidden`

### Runtime de envío

- `whats_prosp_meta_not_configured`
- `whats_prosp_template_required`
- `whats_prosp_template_not_approved`
- `whats_prosp_template_inactive`
- `whats_prosp_template_tenant_mismatch`

## 10) Repositorio / acceso a datos

Se recomienda no reutilizar directamente el CRUD genérico actual de `contact_templates` sin filtro adicional.

Se pueden seguir dos rutas:

### Opción A

Crear métodos específicos:

- `list_whats_prosp_templates`
- `get_whats_prosp_template`
- `create_whats_prosp_template`
- `update_whats_prosp_template`

Ventaja:

- el contrato queda aislado y claro

### Opción B

Reusar `prospeccion_contacto_templates`, pero encapsular el filtro fijo:

- `canal = whatsapp`
- `provider = meta`
- `usage_scope = whats_prosp`

Recomendación:

- usar opción B en repositorio
- pero exponer rutas específicas de `Whats-Prosp` en API

## 11) Compatibilidad temporal

Durante la transición, el backend puede seguir leyendo datos legacy para no romper históricos.

Pero el contrato nuevo ya no debe aceptar Twilio como entrada para `Whats-Prosp`.

La compatibilidad temporal solo debe existir internamente para lectura o backfill, no como contrato público nuevo.

## 12) Orden recomendado de implementación

1. aplicar migración SQL;
2. crear schemas Pydantic;
3. crear repository methods;
4. crear endpoints CRUD;
5. cambiar runtime de prospección a `template_id`;
6. snapshotear en batch/envío;
7. retirar contrato viejo de `SID` en `Whats-Prosp`.

### 12.1 Integración con métricas y resultado comercial

Los contratos de ejecución de `Whats-Prosp` deben conservar las llaves
necesarias para que el agregado compartido relacione campaña, lote, mensaje,
conversación, oportunidad y cobro. Ese agregado será consumido por:

- `prospeccion/metricas`, para rendimiento y eficiencia de campaña;
- `mapa-de-conversion`, para adquisición, atribución y conversión.

No se deben copiar costos ni oportunidades a una segunda tabla de reportes.
Cuando el costo no esté conciliado mediante `cobro_mensaje_id`, el contrato de
métricas debe conservar el estado pendiente y la UI no debe presentar cero.
