# Modelo ERD propuesto para CRM multi-tenant

Este plan describe las entidades mínimas y sus relaciones para evolucionar el CRM hacia un modelo multi-tenant con pipeline de ventas, soporte y marketing. Incluye convenciones para `organizacion_id`, historial de etapas y metadatos flexibles con `JSONB`.

## Alcances y convenciones
- **Tenant:** todas las tablas de negocio incluyen `organizacion_id` con FK a `organizaciones` (tenants) y tienen Row Level Security por `organizacion_id`.
- **Nomenclatura clara:**
  - `organizaciones` = tenants que usan el SaaS. Se evita el nombre `clientes` para no confundir con los "clientes" del área comercial.
  - `cuentas` = empresas en tu pipeline comercial (prospectos/clientes finales).
- **Propiedad:** los registros con responsables tienen `propietario_usuario_id` (FK a `usuarios`).
- **Seguimiento temporal:** campos `creado_en` y `actualizado_en` en tablas principales; tablas de historial para movimientos clave.
- **Metadatos:** columnas `metadata JSONB` en entidades que integran servicios externos (WhatsApp, email, calendarios, etc.).

## Núcleo de multi-tenant y permisos
- `organizaciones` (tenants del sistema): razón social, `rfc`, país/estado/ciudad, `dominio_principal`, configuración `config JSONB`, estado de onboarding y fechas de alta/pausa/cancelación.
- `usuarios`: pertenece a `organizacion_id`, datos de contacto, autenticación y estatus.
- `roles`: catálogo (`admin`, `ventas`, `soporte`, `marketing`, etc.).
- `usuario_roles`: relación many-to-many por `usuario_id` y `rol_id` con `organizacion_id` para aislar permisos por tenant.

## CRM de cuentas, contactos y oportunidades
- `cuentas`: empresas/organizaciones con `tipo`, industria, tamaño, sitio web, dirección o `direccion JSONB`, `propietario_usuario_id` y opcional `ubicacion_geom` si se usa PostGIS.
- `contactos`: personas ligadas opcionalmente a `cuenta_id`, con cargo, canales preferidos y `propietario_usuario_id`.
- `etapas_pipeline`: etapas ordenadas (`Nuevo`, `Calificado`, `Propuesta`, `Negociación`, `Ganado`, `Perdido`) con probabilidad por defecto.
- `oportunidades`: vinculadas a `cuenta_id` y `contacto_id` principal, con `titulo`, `monto_estimado`, `moneda`, `probabilidad`, `fecha_cierre_probable`, `estado`, `motivo_perdida`, `etapa_id` y `propietario_usuario_id`.
- `oportunidad_etapas_historial`: registra cambios de etapa con `cambiado_por_usuario_id` y `cambiado_en`.

## Actividades y tareas
- `actividades`: tabla unificada con `tipo` (`llamada`, `reunion`, `email`, `whatsapp`, `nota`, `tarea`), `asunto`, `descripcion`, `estado`, `inicio_en`, `fin_en`, relaciones opcionales (`cuenta_id`, `contacto_id`, `oportunidad_id`), asignaciones (`creado_por_usuario_id`, `asignado_a_usuario_id`) y `metadata JSONB` (URLs de meeting, IDs externos, etc.).
- Si se prefiere separar, `tareas` puede existir con `prioridad` y `fecha_vencimiento`, pero puede modelarse con `actividades.tipo = 'tarea'`.

## Soporte y tickets
- `tickets`: enlace con `cuenta_id` y `contacto_id`, campos de `estado`, `prioridad`, `canal_origen`, `asignado_a_usuario_id`, fechas de creación/actualización/cierre y `metadata JSONB` para IDs externos.
- `ticket_comentarios`: hilo de conversación con autor (usuario o cliente), mensaje y timestamps.

## Productos, cotizaciones y ventas
- `productos`: catálogo con `codigo`, `nombre`, `descripcion`, `precio_base`, `moneda` y `activo`.
- `cotizaciones`: ligadas a `oportunidad_id` y opcionalmente a `cuenta_id`/`contacto_id`, con `estatus`, `total`, `moneda`, `valida_hasta` y `creada_por_usuario_id`.
- `cotizacion_items`: items con `producto_id`, `descripcion`, `cantidad`, `precio_unitario`, `descuento_porcentaje` y `subtotal`.

## Marketing y lead management
- `campanas`: nombre, tipo, canal principal, fechas, presupuesto y `metadata JSONB`.
- `leads`: origen, datos de contacto, estado (`nuevo`, `en_proceso`, `convertido`, `descartado`), vínculo opcional a `campana_id` y referencias a `convertido_a_contacto_id` / `convertido_a_cuenta_id` cuando se convierten.
- `lead_eventos`: actividades de marketing (`abrió_email`, `click`, `visitó_pagina`, `respuesta_whatsapp`, etc.) con `metadata` y `registrado_en`.

## Etiquetas, archivos y auditoría
- `tags`: catálogo por `organizacion_id` con `nombre` y `color` opcional.
- `taggings`: relación polimórfica (`relacion_tipo`, `relacion_id`) para cuentas, contactos, oportunidades, tickets, etc.
- `archivos`: referencias a almacenamiento con `relacion_tipo`, `relacion_id`, `nombre_original`, `content_type`, `tamano_bytes`, `storage_path/url`, `subido_por_usuario_id` y `subido_en`.
- `audit_logs`: registros de acciones (`crear`, `actualizar`, `borrar`, `login`), tabla afectada, `registro_id`, `cambios JSONB`, `usuario_id`, IP y `user_agent`.

## Diagrama de relaciones (Mermaid)
```mermaid
erDiagram
  organizaciones ||--o{ usuarios : "tiene"
  usuarios ||--o{ usuario_roles : "asume"
  roles ||--o{ usuario_roles : "asignado"

  organizaciones ||--o{ cuentas : "posee"
  organizaciones ||--o{ contactos : "posee"
  organizaciones ||--o{ oportunidades : "posee"
  organizaciones ||--o{ etapas_pipeline : "define"
  organizaciones ||--o{ actividades : "usa"
  organizaciones ||--o{ tickets : "atiende"
  organizaciones ||--o{ productos : "vende"
  organizaciones ||--o{ campanas : "lanza"
  organizaciones ||--o{ tags : "crea"
  organizaciones ||--o{ archivos : "sube"
  organizaciones ||--o{ audit_logs : "genera"

  cuentas ||--o{ contactos : "incluye"
  cuentas ||--o{ oportunidades : "relaciona"
  cuentas ||--o{ tickets : "origina"

  contactos ||--o{ oportunidades : "principal"
  contactos ||--o{ actividades : "participa"
  contactos ||--o{ tickets : "crea"

  etapas_pipeline ||--|{ oportunidades : "flujo"
  oportunidades ||--o{ oportunidad_etapas_historial : "historial"
  oportunidades ||--o{ actividades : "agenda"
  oportunidades ||--o{ cotizaciones : "cotiza"

  cotizaciones ||--o{ cotizacion_items : "detalle"
  productos ||--o{ cotizacion_items : "incluye"

  campanas ||--o{ leads : "genera"
  leads ||--o{ lead_eventos : "eventos"
  leads ||--|| contactos : "convierte" : optional
  leads ||--|| cuentas : "convierte" : optional

  tags ||--o{ taggings : "marca"
  archivos ||--o{ actividades : "adjunta" : optional
```

## Migración y pasos sugeridos
1. Crear tablas base (`organizaciones`, `roles`, `usuarios`, `usuario_roles`) y activar RLS por `organizacion_id`.
2. Añadir `organizacion_id` a tablas existentes y migrar datos actuales respetando el aislamiento.
3. Crear tablas del núcleo CRM (`cuentas`, `contactos`, `etapas_pipeline`, `oportunidades`, `oportunidad_etapas_historial`).
4. Introducir `actividades` y/o `tareas` y migrar llamadas/conversaciones a este modelo.
5. Implementar `tickets` y `ticket_comentarios` si aplica al soporte actual.
6. Incorporar `productos`, `cotizaciones`, `cotizacion_items` cuando se active ventas/cobranzas.
7. Añadir `campanas`, `leads`, `lead_eventos` para captación y alimentar el funnel.
8. Integrar `tags`, `archivos`, `audit_logs` y ajustar APIs para exponer CRUD filtrados por `organizacion_id` y `propietario_usuario_id`.

Este ERD cubre los casos propuestos (ventas, soporte, marketing) y está pensado para crecer con auditoría, etiquetado y metadatos sin romper compatibilidad.

## Alineación con la lista solicitada
- Las tablas de tenant y seguridad (`organizaciones`, `usuarios`, `roles`, `usuario_roles`) corresponden al bloque de **Base del sistema**; `organizacion_id` sustituye a `cliente_id` para evitar ambigüedad.
- El núcleo CRM se mapea 1:1 con **cuentas, contactos, oportunidades, etapas_pipeline** y su historial.
- **Actividades**, **tareas** (como `tipo` en actividades) y **notas** quedan cubiertas en la sección de actividades/tareas.
- **Productos**, **cotizaciones** e **items** se incluyen en el bloque de ventas.
- **Tickets** y **ticket_comentarios** coinciden con el apartado de soporte.
- **Campanas**, **leads** y **lead_eventos** abarcan marketing y origenes.
- **Tags**, **taggings**, **archivos** y **audit_logs** cubren etiquetas, archivos y auditoría como elementos transversales.
