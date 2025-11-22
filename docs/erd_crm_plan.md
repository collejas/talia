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
- `oportunidades`: vinculadas a `cuenta_id` y `contacto_id` principal, con `titulo`, `monto_estimado`, `moneda`, `probabilidad`, `fecha_cierre_probable`, `estado` (catálogo `abierta`/`ganada`/`perdida`), `motivo_perdida` (catálogo + texto libre), `etapa_id` y `propietario_usuario_id`.
- `oportunidad_etapas_historial`: registra cambios de etapa con `cambiado_por_usuario_id` y `cambiado_en`.

## Actividades y tareas
- `actividades`: tabla unificada con `tipo` (`llamada`, `reunion`, `email`, `whatsapp`, `nota`, `tarea`), `canal` (zoom, meet, whatsapp, teléfono, etc.), `asunto`, `descripcion`, `estado`, `inicio_en`, `fin_en`, relaciones opcionales (`cuenta_id`, `contacto_id`, `oportunidad_id`), asignaciones (`creado_por_usuario_id`, `asignado_a_usuario_id`) y `metadata JSONB` (URLs de meeting, IDs externos, etc.).
- Las tareas, ya sea como tabla separada o modeladas dentro de `actividades`, deben incluir explícitamente `prioridad` y `fecha_vencimiento` para soportar SLA y recordatorios.
- Para notas rápidas, puede mantenerse `actividades.tipo = 'nota'` o crearse una tabla `notas` polimórfica (`relacion_tipo`, `relacion_id`) cuando se requiera visibilidad/permisos diferenciados.

## Soporte y tickets
- `tickets`: enlace con `contacto_id` y `cuenta_id` opcional, campos de `estado`, `prioridad`, `canal_origen`, `asignado_a_usuario_id`, fechas de creación/actualización/cierre y `metadata JSONB` para IDs externos.
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
- `archivos`: referencias a almacenamiento con relación polimórfica (`relacion_tipo`, `relacion_id`) para adjuntar a cuentas, contactos, oportunidades, tickets, actividades, etc.; incluye `nombre_original`, `content_type`, `tamano_bytes`, `storage_path/url`, `subido_por_usuario_id` y `subido_en`.
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
  archivos ||--o{ cuentas : "adjunta" : optional
  archivos ||--o{ contactos : "adjunta" : optional
  archivos ||--o{ oportunidades : "adjunta" : optional
  archivos ||--o{ tickets : "adjunta" : optional
```

## Migración y pasos sugeridos
1. [x] Crear tablas base (`organizaciones`, `roles`, `usuarios`, `usuario_roles`) y activar RLS por `organizacion_id`.
2. [x] Añadir `organizacion_id` a tablas existentes y migrar datos actuales respetando el aislamiento.
3. [x] Crear tablas del núcleo CRM (`cuentas`, `contactos`, `etapas_pipeline`, `oportunidades`, `oportunidad_etapas_historial`).
4. [x] Introducir `actividades` y/o `tareas`, agregando `prioridad`, `fecha_vencimiento`, `sla_horas` y `recordatorio_en`, y migrar llamadas/conversaciones a este modelo.
5. [x] Implementar `tickets` y `ticket_comentarios` si aplica al soporte actual.
6. [x] Incorporar `productos`, `cotizaciones`, `cotizacion_items` cuando se active ventas/cobranzas.
7. [x] Añadir `campanas`, `leads`, `lead_eventos` para captación y alimentar el funnel.
8. [x] Integrar `tags`, `archivos`, `audit_logs` y ajustar APIs para exponer CRUD filtrados por `organizacion_id` y `propietario_usuario_id`.
9. [x] Crear `notas` polimórficas con flag de visibilidad y conectarlas a las entidades (cuentas, contactos, oportunidades, tickets, actividades) respetando RLS.
10. [x] Publicar endpoints polimórficos para `archivos`, `taggings` y `notas`, validando el catálogo de `relacion_tipo` y adoptando componentes frontend reutilizables con visibilidad y permisos por tenant.

Este ERD cubre los casos propuestos (ventas, soporte, marketing) y está pensado para crecer con auditoría, etiquetado y metadatos sin romper compatibilidad.

## Alineación con la lista solicitada
- Las tablas de tenant y seguridad (`organizaciones`, `usuarios`, `roles`, `usuario_roles`) corresponden al bloque de **Base del sistema**; `organizacion_id` sustituye a `cliente_id` para evitar ambigüedad.
- El núcleo CRM se mapea 1:1 con **cuentas, contactos, oportunidades, etapas_pipeline** y su historial.
- **Actividades**, **tareas** (como `tipo` en actividades) y **notas** quedan cubiertas en la sección de actividades/tareas.
- **Productos**, **cotizaciones** e **items** se incluyen en el bloque de ventas.
- **Tickets** y **ticket_comentarios** coinciden con el apartado de soporte.
- **Campanas**, **leads** y **lead_eventos** abarcan marketing y origenes.
- **Tags**, **taggings**, **archivos** y **audit_logs** cubren etiquetas, archivos y auditoría como elementos transversales.

## Complementos para cerrar al 100 % la propuesta
- Definir si `actividades` seguirá siendo la tabla única o si se crea una tabla `tareas` separada con `prioridad`, `fecha_vencimiento` y SLA explícitos; el frontend actual no expone prioridades y habrá que ajustar formularios/listados cuando se materialicen.
- Incorporar una tabla `notas` polimórfica si se requiere visibilidad distinta a las actividades estándar (por ejemplo, notas internas del equipo de soporte que no se muestran al cliente).
- Ajustar la carga de archivos y comentarios en frontend/backend para reutilizar `archivos` y `taggings` de forma polimórfica en todas las entidades relacionadas (cuentas, contactos, oportunidades, tickets, actividades).

## Propuestas para cerrar los complementos
- **Actividades vs. tareas:** mantener `actividades` como tabla única para no duplicar lógica y agregar campos obligatorios `prioridad` (enum `baja`/`media`/`alta`/`critica`), `fecha_vencimiento`, `sla_horas` (nullable) y `recordatorio_en`. El frontend debe exponer prioridad y vencimiento en creación/edición y permitir ordenar/filtrar por esos campos; el backend debe validar SLA y calcular estados derivados (`vencida`, `al_dia`) en vistas o materialized views.
- **Notas polimórficas y visibilidad:** crear `notas` con `relacion_tipo`, `relacion_id`, `texto`, `creado_por_usuario_id`, `creado_en`, `visible_para_cliente` (booleano) y `tipo` (por ejemplo `interna`, `publica`, `sistema`). Para casos simples puede mantenerse `actividades.tipo = 'nota'`, pero cuando se requiera aislamiento (soporte interno) el frontend mostrará sólo las notas `visibles_para_cliente = true` en portales públicos y todas en vistas internas; el backend filtra por `organizacion_id` y el flag de visibilidad.
- **Archivos y etiquetas polimórficas:** centralizar la carga y listado en `archivos` y `taggings` usando `relacion_tipo`/`relacion_id` (cuentas, contactos, oportunidades, tickets, actividades). Exponer en el backend endpoints polimórficos (`POST /archivos/{relacion_tipo}/{relacion_id}` y `POST /taggings/{relacion_tipo}/{relacion_id}`) y adaptar el frontend para reutilizar un componente común de adjuntos/etiquetas que se configure por tipo; validar en backend que `relacion_tipo` pertenezca a un catálogo permitido para evitar referencias huérfanas. Ya existen endpoints REST en el backend (`/crm/archivos`, `/crm/taggings` y `/crm/notas`) que aplican esta validación y se apoyan en RLS por `organizacion_id`.

### Cierre del plan
- Los endpoints `/crm` ahora cubren también el núcleo comercial (`cuentas`, `contactos`, `etapas_pipeline`, `oportunidades`, `oportunidad_etapas_historial`) y las `actividades` con SLA, usando validación de filtros y delegando a Supabase con RLS multi-tenant.
- El frontend dispone de un cliente `frontend/panel/src/lib/api/crm.ts` que reutiliza el token actual y el `PANEL_API_URL` para consumir estos endpoints de forma consistente, facilitando la transición de los componentes existentes del embudo hacia el nuevo modelo multi-tenant.

Con estas definiciones, el plan queda completo respecto a la lista recomendada; la ejecución requiere seguir las migraciones y ajustes de frontend/backend que se describen abajo.

## Brechas detectadas en el backup `backups/postgres_20251122_164957`
- Las tablas actuales clave (`clientes`, `contactos`, `usuarios`, `roles`, `usuarios_roles`) no tienen columna de tenant ni RLS, por lo que el plan debe añadir `organizacion_id` y políticas de aislamiento antes de exponerlas como multi-tenant. 【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L1225-L1247】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L10735-L10751】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L10793-L10802】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L11847-L11891】
- El pipeline vigente está centrado en `lead_tableros`/`lead_etapas`/`lead_tarjetas` y su historial (`lead_movimientos`), sin entidades de `cuentas` u `oportunidades`; el plan debe incluir migraciones de esos tableros y movimientos hacia el nuevo modelo de oportunidades y etapas. 【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L11264-L11298】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L11325-L11336】
- Las actividades actuales se reparten entre `conversaciones` (mensajería) y `llamadas`, sin unificarse en una tabla polimórfica; se requiere una estrategia de consolidación hacia `actividades` con enlaces a cuentas/contactos/oportunidades y campos de SLA. 【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L10758-L10775】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L11379-L11392】