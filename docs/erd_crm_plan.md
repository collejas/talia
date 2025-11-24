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
1. [x] Crear tablas base (`organizaciones`, `roles`, `usuarios`, `usuario_roles`) y activar RLS por `organizacion_id`. _Implementado en `supabase/migrations/20260601_200000_multitenant_core.sql` (tablas/columnas) y `20260601_201500_crm_rls_policies.sql` (políticas iniciales)._
2. [x] Añadir `organizacion_id` a tablas existentes y migrar datos actuales respetando el aislamiento. _`20260601_200000_multitenant_core.sql` agrega y rellena `organizacion_id` en `contactos`, `lead_*`, `clientes`; `20260601_201600_ticket_comments_org.sql` lo hace para `ticket_comentarios`; `20260601_201700_rls_legacy_leads.sql` añade la columna y RLS multi-tenant a `lead_movimientos`, `lead_recordatorios`, `lead_cotizaciones`, `lead_cotizacion_items`, `cliente_documentos` y `cliente_responsables`._
3. [x] Crear tablas del núcleo CRM (`cuentas`, `contactos`, `etapas_pipeline`, `oportunidades`, `oportunidad_etapas_historial`). _`supabase/migrations/20260601_200500_crm_core_entities.sql` crea todas las entidades del ERD central._
4. [x] Introducir `actividades` y/o `tareas`, agregando `prioridad`, `fecha_vencimiento`, `sla_horas` y `recordatorio_en`, y migrar llamadas/conversaciones a este modelo. _Tablas y endpoints `/crm/actividades` listos; pendiente migrar datos legacy y exponerlo en el frontend._
5. [x] Implementar `tickets` y `ticket_comentarios` si aplica al soporte actual. _`/crm/tickets` y `/crm/tickets/{id}/comentarios` operativos con RLS; falta migrar tickets existentes y adoptar la nueva API en el panel._
6. [x] Incorporar `productos`, `cotizaciones`, `cotizacion_items` cuando se active ventas/cobranzas. _Endoints `/crm/productos`, `/crm/cotizaciones` e items implementados; resta adaptar flujos de ventas en el frontend._
7. [x] Añadir `campanas`, `leads`, `lead_eventos` para captación y alimentar el funnel. _`/crm/campanas`, `/crm/leads` y `/crm/leads/{id}/eventos` disponibles; pendiente migrar UI y datos._
8. [x] Integrar `tags`, `archivos`, `audit_logs` y ajustar APIs para exponer CRUD filtrados por `organizacion_id` y `propietario_usuario_id`. _`/crm/archivos`, `/crm/tags`, `/crm/taggings`, `/crm/audit_logs` listos; falta incorporarlos en el frontend._
9. [x] Crear `notas` polimórficas con flag de visibilidad y conectarlas a las entidades (cuentas, contactos, oportunidades, tickets, actividades) respetando RLS. _`/crm/notas` ya existe; falta consumirlo desde el panel y definir migración de notas legacy._
10. [x] Publicar endpoints polimórficos para `archivos`, `taggings` y `notas`, validando el catálogo de `relacion_tipo` y adoptando componentes frontend reutilizables con visibilidad y permisos por tenant. _Implementado con `callCrmApi`; pendiente migrar componentes UI._

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

- ### Avance actual (backend/frontend)
- `backend/app/api/routes/crm.py` cubre todo el ERD (cuentas, oportunidades, actividades, tickets/comentarios, archivos, tags/taggings, productos, cotizaciones, campañas, leads, notas y audit logs) con pruebas en `backend/tests/api/test_crm_routes.py`.
- Las tablas legacy (`lead_*`, `cliente_*`) ya tienen `organizacion_id` y políticas RLS multi-tenant (`20260601_201700_rls_legacy_leads.sql`), por lo que el modelo antiguo sigue operativo sin mezclar tenants.
- El frontend cuenta con `frontend/panel/src/lib/api/crm.ts` y vistas `/crm`, `/crm/oportunidades`, `/crm/tickets`, `/crm/actividades`, `/crm/campanas`, `/crm/leads`, `visitas`, `inbox` y `contactos` consumiendo `/crm` (todas apoyadas en `ClientDataTable` o server actions). Los helpers `callSupabaseRest/Rpc` fueron removidos y sólo los endpoints de autenticación siguen hablando con Supabase directamente.
- Se añadieron los endpoints `/crm/visitas/{kpis,estados,detalle,whatsapp/*}` y sus métodos en `CRMRepository`, por lo que la vista `visitas` ahora obtiene KPIs, detalle y conversaciones mediante el backend sin exponer la anon key. 【backend/app/api/routes/crm.py:1585-1729】【backend/app/repositories/crm.py:1234-1407】
- La agenda (listado, disponibilidad y acciones) ya vive en `/crm/agenda/*` y `frontend/panel/src/lib/agenda/data.ts` usa `callCrmApi`, evitando exponer la anon key para reprogramar o cancelar citas. 【backend/app/api/routes/crm.py:1885-2138】【frontend/panel/src/lib/agenda/data.ts:1-220】
- Prospección (Google Places y DENUE) expone `/crm/prospeccion/*` y los clientes (`frontend/panel/src/lib/prospeccion/*`) consumen esos endpoints mediante los proxies `/api/prospeccion/*`, por lo que ya no se llama a Supabase directo para crear/listar/borrar búsquedas y resultados; además, el router legacy (`backend/app/api/routes/panel.py`) quedó vacío y sólo conserva `/panel/env.js`, evitando cualquier doble implementación. 【backend/app/api/routes/crm.py:2139-2491】【backend/app/repositories/crm.py:1572-1664】【backend/app/api/routes/panel.py:1-18】
- La configuración de branding dejó de depender del panel legacy: `/crm/settings/logos` ya escribe/lee la tabla `logos` con control de admin y subida a Storage (`backend/app/api/routes/crm.py:2413-2474`, `backend/app/repositories/crm.py:549-573`). El proxy del panel (`frontend/panel/src/app/api/settings/logos/route.ts`) ahora usa `callCrmApi`, así que los formularios de plantillas (correo/cotización) consultan y suben logos únicamente a través del CRM.
- El catálogo que usa el embudo para seleccionar productos/cargos también consume `/crm/catalog/items`; el endpoint Next.js `/api/catalog/items` quedó como un simple proxy hacia `callCrmApi`, eliminando las llamadas directas a Supabase en el navegador (`frontend/panel/src/app/api/catalog/items/route.ts:1-48`).
- El inbox dejó de depender del backend legacy: `/crm/inbox/{summary,threads,messages,conversations/*}` ahora expone cambio de modo manual, respuestas y carga de adjuntos (`backend/app/api/routes/crm.py:3322-3704`), y los proxies de Next.js (`frontend/panel/src/app/api/inbox/*`) junto con `fetchLatestMessages` consumen exclusivamente `callCrmApi`, por lo que se eliminó `buildBackendTargets`, los endpoints `/conversaciones/*` del panel y el fallback a `/panel`. 【backend/app/api/routes/crm.py:3322-3704】【frontend/panel/src/app/api/inbox/[conversationId]/reply/route.ts:1-148】【frontend/panel/src/app/api/inbox/uploads/route.ts:1-64】【frontend/panel/src/lib/inbox/messages-server.ts:1-64】
- La conversión de leads, la vinculación con clientes y todo el flujo de cotizaciones (listar, crear, enviar, marcar estados) ocurre únicamente vía `/crm/leads/*` y los proxies `callCrmApi`, por lo que se eliminaron las rutas legacy `/leads/{id}/cliente`, `/leads/{id}/convertir` y `/leads/{id}/quotes` de `panel.py`. Esto evita la doble implementación sobre `lead_tarjetas` y reutiliza el mismo `CRMRepository` que usa el resto del panel. 【backend/app/api/routes/crm.py:4031-4270】【frontend/panel/src/app/api/embudo/leads/[oportunidadId]/cliente/route.ts:1-48】【frontend/panel/src/app/api/embudo/leads/[oportunidadId]/convertir/route.ts:1-38】
- `CRMRepository` incorporó `_rpc` y `register_webchat_message`, por lo que `storage.register_webchat_message` dejó de invocar `_call_supabase_rpc` directo y ahora registra mensajes/adjuntos del chat embebido mediante el cliente centralizado y el service role controlado. 【backend/app/repositories/crm.py:1142-1181】【backend/app/repositories/crm.py:2671-2693】【backend/app/services/storage.py:58-82】
- `CRMRepository.register_whatsapp_message` encapsula la RPC `registrar_mensaje_whatsapp` y `storage.register_whatsapp_message` dejó de usar `_call_supabase_rpc`, reduciendo la exposición del service role en los canales automatizados. 【backend/app/repositories/crm.py:1183-1219】【backend/app/services/storage.py:85-118】
- Las lecturas, insights, controles manuales y adjuntos del canal webchat también pasan por `CRMRepository`, así que `fetch_conversation`, `resolve_webchat_conversation_from_session`, `record_webchat_session_closure`, `record_webchat_visit`, `get_webchat_contact_id`, `fetch_webchat_session_id`, `upsert_conversation_insights`, `fetch_recent_messages` y `upload_webchat_attachment` ya no construyen llamadas directas a Supabase. 【backend/app/repositories/crm.py:1227-1411】【backend/app/services/storage.py:123-240】
- Los uploads generales (PDFs de cotización, logos y documentos de clientes) y las consultas de contacto/identidades ahora se atienden desde el repositorio, por lo que `upload_quote_document`, `upload_logo_asset`, `upload_cliente_document`, `fetch_contact`, `fetch_contact_identities` y `record_delivery_event` se ejecutan usando el mismo cliente centralizado. 【backend/app/repositories/crm.py:1403-1794】【backend/app/services/storage.py:360-520】
- Las plantillas de email, la metadata de calendar bookings y la actualización de contactos utilizan los helpers del CRM, eliminando las llamadas directas de `storage.py` hacia `panel_email_templates` y `calendar_bookings`. 【backend/app/repositories/crm.py:3020-2558】【backend/app/services/storage.py:520-660】
- Las vistas de analytics (visitantes por estado/municipio/país, detalle de visitas y leads geográficos) también se resuelven vía `CRMRepository`, de modo que `fetch_visitantes_*`, `fetch_webchat_visitas_detalle`, `fetch_leads_states` y `fetch_leads_municipios` dejaron de invocar RPCs con el service role desde `storage.py`. 【backend/app/repositories/crm.py:2183-2340】【backend/app/services/storage.py:620-900】
- Las automatizaciones de conversación (`storage.ensure_conversation_opportunity`, antes `ensure_lead_tarjeta`) dejaron de escribir en `lead_tarjetas` y ahora reutilizan `CRMRepository.ensure_conversation_opportunity`, de modo que los leads creados por webchat/WhatsApp entran directamente al pipeline del CRM con metadatos de conversación y canal. 【backend/app/repositories/crm.py:949-1121】【backend/app/services/storage.py:1788-1880】

### Cierre del plan
- Con la API `/crm` y el RLS completados, el siguiente foco es migrar gradualmente las vistas del panel y ejecutar la fase de datos/UI (doble escritura, migración de leads legacy y corte definitivo) descrita en las Fases 3 y 4.

Con estas definiciones, el plan queda completo respecto a la lista recomendada; la ejecución requiere seguir las migraciones y ajustes de frontend/backend que se describen abajo.

## Migración automática legacy → CRM
- **Script:** `supabase/migrations/20251122_230000_migrate_legacy_to_crm.sql` copia los datos actuales de `clientes`, `lead_etapas`, `lead_tarjetas`, `lead_movimientos`, `lead_recordatorios`, `lead_cotizaciones` y `lead_cotizacion_items` hacia `cuentas`, `etapas_pipeline`, `oportunidades`, `oportunidad_etapas_historial`, `actividades`, `cotizaciones` y `cotizacion_items`, reutilizando los mismos UUID para mantener referencias. También asigna `cuenta_id` en `contactos`.
- **Ejecución:** en un entorno local/staging correr `psql $DATABASE_URL -f supabase/migrations/20251122_230000_migrate_legacy_to_crm.sql` (o `supabase db execute < archivo.sql`). El script es idempotente (`ON CONFLICT DO UPDATE/NOTHING`), pero asume que las tablas nuevas están vacías o que se desea sobreescribir sus valores con los del modelo legacy.
- **Consideraciones:** el código normaliza los códigos/ordenes de `etapas_pipeline` para evitar choques entre tableros, marca en `metadata` los identificadores legacy y conserva la información adicional (responsables, conceptos de cotización, tags). No migra conversaciones ni adjuntos; esos módulos permanecerán en las tablas existentes hasta que definamos su equivalencia en el nuevo modelo.

## Hallazgos en el backup `backups/postgres_20251122_221914`
- La base ya incluye el núcleo multi-tenant completo (`organizaciones`, `cuentas`, `oportunidades`, `actividades`, `tickets`) con `organizacion_id`, metadatos JSONB y pistas de auditoría; por ejemplo `cuentas` y `oportunidades` siguen exactamente el ERD propuesto. 【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L10999-L11017】【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L11784-L11806】【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L10361-L10385】【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L12304-L12321】
- Las políticas RLS basadas en `usuario_organizacion_id()` ya protegen estas tablas nuevas (`actividades`, `cuentas`, `tickets`, etc.), de modo que el aislamiento por tenant existe a nivel SQL. 【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L8178-L8196】【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L17220-L17304】【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L17772-L17791】【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L18619-L18633】
- El ecosistema legacy (`lead_tableros`, `lead_etapas`, `lead_tarjetas`, `lead_movimientos`) permanece intacto —incluso con defaults fijos de `organizacion_id`—, por lo que todavía no se ha migrado la operación diaria hacia `oportunidades`. 【F:backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql†L11084-L11112】

## Hallazgos en el backup `backups/postgres_20251124_003154`
- El esquema sigue sin aplicar la migración `20260705`: `public.clientes` aún depende de `lead_tarjeta_id` como FK primaria y no tiene `cuenta_id` obligatorio, lo que confirma que la propagación de IDs CRM no se ha corrido en este entorno. 【backups/postgres_20251124_003154/postgres_20251124_003154_schema.sql:1258】
- `cliente_documentos` y `cliente_responsables` tampoco exponen `cuenta_id`/`oportunidad_id`, así que los adjuntos y responsables del portal no pueden relacionarse a CRM mientras no se ejecute la migración. 【backups/postgres_20251124_003154/postgres_20251124_003154_schema.sql:9440】【backups/postgres_20251124_003154/postgres_20251124_003154_schema.sql:9551】
- `cliente_portal_tokens` sólo guarda `cliente_id` y carece de `organizacion_id` + `cuenta_id`/`oportunidad_id`; además, las policies RLS siguen llamando `puede_ver_lead(lead_tarjeta_id)`, por lo que debemos aplicar la migración antes de retirar los helpers legacy. 【backups/postgres_20251124_003154/postgres_20251124_003154_schema.sql:9500】【backups/postgres_20251124_003154/postgres_20251124_003154_schema.sql:16330-16351】

## Brechas detectadas en el backend/frontend actuales
- `backend/app/services/storage.py` ya enruta los registros, lecturas y uploads básicos mediante `CRMRepository`; los únicos usos directos del service role pendientes son los reportes masivos/descargas legacy que aún no cuentan con endpoint `/crm`. 【backend/app/services/storage.py:900+】
- El router `/crm` y `CRMRepository` ya abastecen agenda, visitas, prospección, settings, contactos, inbox y cotizaciones; los únicos procesos que siguen hablando directo con Supabase son los de mensajería automática en `storage.py`. Migrarlos permitiría aplicar RLS multi-tenant y observabilidad homogénea. 【backend/app/services/storage.py:50-220】
- En el frontend todo el CRM (embudo, contactos, inbox, settings, visitas) ya usa `callCrmApi` y los endpoints `/crm/*`; no quedan llamadas directas a Supabase fuera de los endpoints de autenticación (`/api/auth/*`). 【frontend/panel/src/lib/api/crm.ts:1-192】【frontend/panel/src/lib/embudo/actions.ts:20-140】【frontend/panel/src/lib/visitas/data.ts:1-360】【frontend/panel/src/lib/inbox/data.ts:1-120】
- Las migraciones históricas (`supabase/migrations_tmp/20251026_210000_leads_kanban.sql`) todavía describen únicamente el tablero legacy; falta generar scripts que documenten la equivalencia final con `etapas_pipeline`/`oportunidades` para facilitar auditorías futuras.

## Estado actual resumido
- **Base de datos:** el dump `backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql` ya contiene el ERD multi-tenant completo con RLS. Los módulos críticos del panel dejaron de usar `lead_*`, pero los procesos automáticos (webchat/WhatsApp) aún escriben directamente usando el service role, por lo que falta cortar definitivamente los accesos a las tablas legacy.
- **Backend:** FastAPI expone `/crm` con un cliente Supabase de servicio y ya cubre pipeline, archivos, notas, clientes/portal, cotizaciones, inbox, agenda, visitas y prospección. El router `panel.py` quedó reducido a exponer únicamente `/panel/env.js`; las únicas llamadas directas pendientes viven en `storage.py`, donde sobreviven reportes masivos/descargas específicas que aún no tienen su contraparte en `/crm`. 【backend/app/services/storage.py:900+】【backend/app/api/routes/panel.py:1-18】
- **Frontend:** el embudo, las vistas de settings (email, formato de cotización, recordatorios y catálogo), contactos, inbox y visitas consumen `callCrmApi`; sólo los endpoints de autenticación (`/api/auth/*`) siguen hablando con Supabase. 【frontend/panel/src/lib/api/crm.ts:1-192】【frontend/panel/src/lib/visitas/data.ts:1-360】【frontend/panel/src/lib/inbox/data.ts:1-120】
- **Infra/RLS:** Las políticas por `organizacion_id` ya se aplican a las tablas nuevas; al migrar los procesos automáticos hacia `/crm` se podrá retirar la anon key y los accesos directos del backend, cerrando la superficie de riesgo multi-tenant.

## Plan de ejecución detallado

### Fase 0 · Preparación operativa
1. **Inventario y respaldos:** congelar un dump completo (ya existe `backups/postgres_20251122_221914`) y documentar qué tablas/vistas tocan los servicios activos (inbox, agenda, clientes). Registrar métricas de volumen para planear migraciones.
2. **Variables y secretos:** validar que `SUPABASE_SERVICE_ROLE`, `SUPABASE_URL`, `PANEL_API_URL` y las llaves utilizadas por backend/frontend estén almacenadas en `.env` o en el gestor correspondiente antes de modificar servicios.
3. **Entorno de staging:** montar un Supabase o Postgres de prueba, apuntar `backend` y `frontend` a ese entorno para validar cada fase sin impactar producción. Documentar la configuración en `supabase/README.md`.

### Fase 1 · Núcleo multi-tenant en la base de datos
1. **Crear tablas de tenant:** `organizaciones`, `roles`, `usuarios`, `usuario_roles` con `organizacion_id` y RLS (`supabase/migrations/20XX..._core_multitenant.sql`). Migrar datos históricos creando una `organizacion` por instancia actual. _Completado en `supabase/migrations/20260601_200000_multitenant_core.sql` y visible en `backups/postgres_20251122_221914`._
2. **Agregar `organizacion_id`:** extender `clientes`, `contactos`, `lead_tableros`, `lead_etapas`, `lead_tarjetas`, `conversaciones`, `llamadas`, `cotizaciones`, etc., rellenando el campo con la organización actual y creando índices (`organizacion_id`, `organizacion_id + estado`). _Realizado en las mismas migraciones (`20260601_200000_multitenant_core.sql`, `20260601_201600_ticket_comments_org.sql`, `20260601_201700_rls_legacy_leads.sql`); resta retirar los defaults fijos una vez que haya más de un tenant._
3. **Tablas nuevas del ERD:** `cuentas`, `etapas_pipeline`, `oportunidades`, `oportunidad_etapas_historial`, `actividades`, `tickets`, `productos`, `cotizaciones`, `campanas`, `leads`, `lead_eventos`, `tags`, `taggings`, `archivos`, `audit_logs`, `notas`. _Implementado en `supabase/migrations/20260601_200500_crm_core_entities.sql`; falta poblarlas con datos reales._
4. **Triggers y vistas:** reescribir los triggers que hoy dependen de `lead_tarjetas` para que actualicen `oportunidades`/`historial`. Crear vistas de compatibilidad (`v_leads_legacy`) para que los servicios actuales sigan funcionando durante la transición.
5. **RLS por tenant:** habilitar políticas `USING (organizacion_id = current_setting('app.organizacion_id')::uuid)` y exponer funciones `set_config('app.organizacion_id', ...)` en los RPC usados por el backend. _`supabase/migrations/20260601_201500_crm_rls_policies.sql` ya define las políticas; tocará propagar `set_config` en los RPC/funciones que aún no reciben `organizacion_id`._

### Fase 2 · Backend FastAPI (/crm)
1. **Cliente Supabase de servicio:** encapsular en `backend/app/repositories/crm_repository.py` todas las llamadas a Supabase usando el service role y el nuevo `organizacion_id`. _Listo; `register_webchat_message` ya usa el repositorio y sólo restan los RPC específicos de WhatsApp/adjuntos que siguen colgándose de `storage.py`._
2. **Endpoints REST `/crm`:** crear routers dedicados (`backend/app/api/routes/crm/accounts.py`, `.../opportunities.py`, etc.) que expongan CRUD filtrado por tenant y traduzcan los modelos Pydantic nuevos (`backend/app/models/crm.py`). _Ya existe `backend/app/api/routes/crm.py`; el pendiente es que los flujos principales del panel consuman esos endpoints._
3. **Integraciones existentes:** actualizar `panel.py` para que el flujo de cotizaciones y el inbox usen `crm_repository` en lugar de pegarle directo a Supabase. _Listo: `panel.py` se vació y sólo deja `/panel/env.js`, por lo que no quedan endpoints heredados que hablen directo con Supabase._ 【backend/app/api/routes/panel.py:1-18】
4. **Sincronización de conversaciones:** migrar los reportes masivos y descargas restantes (por ejemplo world map histórico y exportaciones legacy) para que `storage.py` invoque helpers equivalentes en `/crm`, completando el corte con las tablas legacy.
5. **Validaciones y pruebas:** crear pruebas unitarias/contract en `backend/tests/api/test_crm_*.py` que cubran permisos, filtros por tenant y transiciones de etapas.

### Fase 3 · Frontend Panel
1. **Cliente HTTP CRM:** añadir `frontend/panel/src/lib/api/crm.ts` que use `PANEL_API_URL` (desde `panel.ts`) para llamar al backend con fetch y manejar tokens de sesión. _`callCrmApi` ya existe; falta hacerlo obligatorio para cualquier interacción CRM (creación/edición) y retirar `callSupabaseRest`._
2. **Hooks y stores:** crear hooks (`useCRMAccounts`, `useOpportunitiesPipeline`) que consuman el nuevo cliente y reemplacen gradualmente el acceso directo a Supabase. _Completado en las vistas de CRM, inbox, contactos y visitas; el helper `frontend/panel/src/lib/leads/supabase.ts` fue eliminado._
3. **UI de cuentas/contactos:** migrar `frontend/panel/src/lib/clientes` a `cuentas`, mostrando datos provenientes de `/crm/accounts`. Mantener la pantalla legacy detrás de un feature flag hasta completar la migración.
4. **Embudo y actividades:** rediseñar `frontend/panel/src/lib/embudo` para usar `oportunidades`, `etapas_pipeline` y `actividades`. Reaprovechar componentes de drag & drop, pero colgarse del nuevo API para mover etapas y registrar historial.
5. **Soporte/marketing:** cuando ventas esté estable, activar vistas de tickets, campañas y leads de marketing reutilizando los mismos componentes para tags, archivos y notas.

#### Estado actual del embudo (noviembre 2025)
- **Lecturas:** `frontend/panel/src/lib/embudo/data.ts` ahora consume `/crm/pipeline/overview` y `/crm/pipeline/board` vía `callCrmApi`, dejando de depender del RPC `panel_leads_board`. Los stages y tarjetas se adaptan con helpers puros (`frontend/panel/src/lib/embudo/helpers.ts`), lo que permitió reutilizar los modelos tanto en el server action como en la vista.
- **Acciones:** `frontend/panel/src/lib/embudo/actions.ts` ya usa el backend CRM para todas las operaciones del tablero (`POST /crm/pipeline/opportunities` al crear, `PATCH /crm/pipeline/opportunities/{id}` para editar/mover y `DELETE /crm/pipeline/opportunities/{id}` para eliminar) y también para buscar/crear/actualizar contactos (`/crm/contacts`). Con esto desapareció la doble escritura en `contactos`.
- **UI embudo:** `frontend/panel/src/components/embudo/board-client.tsx` fue actualizado para enviar los nuevos parámetros (por ejemplo `contactoId`) y manejar la metadata resultante del pipeline. La vista ya funciona íntegramente contra `/crm`, validado con `npm run build`.
- **Conflictos de etapa:** los movimientos en el embudo detectan `409 opportunity_stage_conflict`, refrescan la tarjeta desde `/crm/pipeline/cards/{id}` y muestran un mensaje amigable para evitar sobrescribir cambios de otros usuarios.
- **Visitantes alineados:** el contador `visitantes_sin_chat` del tablero ahora se obtiene del mismo dataset que `/crm/visitas/kpis`, por lo que coincide con los dashboards y deja de usar el RPC legacy `embudo_visitantes_contador`.
- **Analytics de catálogo:** las tarjetas del dashboard consultan `/crm/analytics/catalog/ventas|embudo` mediante `callCrmApi`, y los endpoints legacy `/analytics/catalog/*` fueron eliminados de `panel.py`, que ahora sólo conserva `/panel/env.js`; incluso el CSV se genera en el server action usando los datos del CRM para mantener la separación multi-tenant. 【backend/app/api/routes/panel.py:1-18】
- **Dashboard KPIs:** `/crm/dashboard/kpis` expone los agregados usados en la portada (antes `_fetch_dashboard_kpis` en `panel.py`), por lo que los rangos de fechas y los KPIs de visitas ya no dependen de `_sb_post` directo.
- **Exportaciones:** existe `/crm/analytics/catalog/ventas/export` para descargar el CSV firmado desde el backend multi-tenant, reemplazando la lógica custom en `panel.py` y evitando exponer consultas directas a Supabase.
- **Historial/notas:** la vista de historial de cada lead ya consume `/crm/pipeline/opportunities/{id}/history`, leyendo y agregando notas directamente en `oportunidad_etapas_historial`. No quedan llamadas a los RPC `panel_lead_movimientos` / `panel_lead_add_nota`.
- **Settings y catálogo:** las plantillas de email (`/settings/email`), el formato de cotizaciones (`/settings/formato-cotizacion`), los recordatorios (`/settings/reminders`) y el catálogo de productos (`/settings/catalogo`) ya se leen/escriben vía `/crm/settings/*` y `/crm/catalog/items`, eliminando el uso de `callSupabaseRest` en estas secciones.
- **Contactos:** la vista de contactos (`frontend/panel/src/lib/contactos/data.ts`) dejó de llamar los RPC desde el navegador y ahora consume `/crm/contacts/{summary,timeline,list}`, que encapsulan las funciones `panel_contactos_*` usando el token del usuario.
- **Inbox:** el panel de mensajes e hilos ahora consume `/crm/inbox/{summary,threads,messages}` y los server actions (`loadInboxData`, `fetchLatestMessages`, `/api/inbox/threads`) dejaron de usar `callSupabaseRpc`.
- **Pendientes inmediatos:** enlazar los contadores de visitantes (`visitantes_sin_chat`) con los dashboards ahora que `/crm/visitas/*` expone los mismos datos.

#### Automatización de canales conversacionales (enero 2026)
- **Captura automática al primer dato:** los tool calls `set_email` y `set_phone_number` del asistente de webchat invocan `storage.capture_opportunity_if_ready`, que crea/recupera la oportunidad vía `storage.ensure_conversation_opportunity` y promueve la etapa cuando ya hay al menos un medio de contacto. Esto garantiza que las tarjetas de webchat se vean en el embudo sin depender de `lead_tarjetas`. 【backend/app/assistants/tools/lead.py:44-125】【backend/app/services/storage.py:921-991】
- **Promoción controlada:** `storage.promote_opportunity_stage` resuelve el ID de etapa buscando tanto `codigo` como `metadata->>legacy_codigo`, cachea el resultado y evita retrocesos si la oportunidad ya está más adelante. `CRMRepository.get_stage_by_code` encapsula esa búsqueda y comparte cache in-memory para minimizar roundtrips contra `/rest/v1/etapas_pipeline`. 【backend/app/services/storage.py:921-991】【backend/app/repositories/crm.py:1519-1556】
- **Integración con canales existentes:** la lógica reutiliza `ensure_conversation_opportunity`, así que WhatsApp/voz sólo necesitan invocar `capture_opportunity_if_ready` después de actualizar el contacto para alinearse con el nuevo pipeline; no hace falta tocar Postgres ni los RPC legacy.
- **Triggers legacy inactivos:** `supabase/migrations/20260201_120000_disable_legacy_lead_triggers.sql` deshabilita `lead_tarjetas_{before,after}_write`, `lead_tarjetas_auto_precalificado` y `contactos_auto_precalificado`, dejando la tabla legacy como solo lectura. El backend es ahora la única pieza que crea/actualiza oportunidades automáticamente.
- **Catálogo de etapas consistente:** `supabase/migrations/20260201_123000_seed_pipeline_stages.sql` inserta las etapas canónicas (`captado`, `precalificado`, `demo`, `propuesta`, `negociacion`, `cerrado_ganado`, `cerrado_perdido`) en todas las organizaciones que aún no las tengan, marcándolas con `metadata.seed = default_stage` para poder auditarlas o personalizarlas después.
- **Monitor de seeds:** `supabase/migrations/20260201_124500_view_missing_pipeline_stages.sql` crea la vista `organizaciones_missing_etapas_pipeline` y `supabase/migrations/20260201_130500_fn_check_missing_pipeline_stages.sql` expone la función `check_missing_pipeline_stages()`. Ejecuta `select public.check_missing_pipeline_stages();` en un cron/Scheduled Function para alertar cuando un tenant nuevo no tenga `captado`.
- **Observabilidad de auto-promoción:** `capture_opportunity_if_ready` y `promote_opportunity_stage` emiten eventos estructurados (`capture_opportunity.*`, `promote_stage.*`) cada vez que se crea o ignora una oportunidad automática. Estos logs sirven para armar métricas/alertas sobre leads sin datos de contacto, stages faltantes o promociones fallidas.
- **Visibilidad en el embudo:** los metadatos `metadata.auto_stage` se sellan en la oportunidad cuando Tal-IA mueve una tarjeta automáticamente (etapa + timestamp + canal). El frontend muestra un badge “Tal-IA” en las tarjetas movidas automáticamente para que los vendedores distingan esos casos sin revisar el historial.

##### Próximos pasos inmediatos
1. **Alertas de promoción fallida:** aprovechar los eventos `capture_opportunity.*` / `promote_stage.*` para generar métricas o alertas (Counter/OTel) cada vez que falle la promoción automática y reflejarlo en `audit_logs`, garantizando trazabilidad por tenant.

#### Estado actual de clientes y portal (noviembre 2025)
- **Backend unificado:** `backend/app/api/routes/crm.py` concentra los enums/payloads de clientes (`ClienteDocumento*`, `ClientePortalLinkPayload`) y las rutas `/crm/clientes/*` y `/crm/portal/*`, por lo que toda la edición fiscal, documentos, responsables y enlaces del portal pasa por una sola capa y `CRMRepository` controla el acceso con el service role. 【backend/app/api/routes/crm.py:109】【backend/app/api/routes/crm.py:2776】【backend/app/repositories/crm.py:1610】
- **Server actions internas:** los endpoints del panel que editan clientes desde el embudo ya delegan en `/crm` a través de los server actions `/api/embudo/clientes/[clienteId]` y `/api/embudo/clientes/[clienteId]/portal-links`, eliminando fetch directos a Supabase desde React. 【frontend/panel/src/app/api/embudo/clientes/[clienteId]/route.ts:17】【frontend/panel/src/app/api/embudo/clientes/[clienteId]/portal-links/route.ts:17】
- **Portal público:** las rutas `/api/portal/[token]` (estado, fiscales, documentos y responsables) y el loader `loadPortalEstado` consumen los nuevos endpoints del backend (`/crm/portal/clientes/...`), así que el portal ya no conoce la anon key. 【frontend/panel/src/app/api/portal/[token]/route.ts:16】【frontend/panel/src/app/api/portal/[token]/documentos/upload/route.ts:16】【frontend/panel/src/app/api/portal/[token]/responsables/[responsableId]/route.ts:17】【frontend/panel/src/lib/portal/data.ts:6】
- **Limpieza del panel:** la sección legacy de `backend/app/api/routes/panel.py` quedó totalmente eliminada y sólo se mantiene `/panel/env.js` para los bundles estáticos. Con esto evitamos doble implementación y cualquier ajuste vive exclusivamente en `/crm`. 【backend/app/api/routes/panel.py:1-18】

### Fase 4 · Migración de datos y corte
1. **Poblado inicial:** scripts de migración que conviertan `lead_tarjetas` → `oportunidades` (mapeando `tablero` a `pipeline`, `etapa_id` a `etapa_id`, `contacto_id` a `cuenta/contacto`). Guardar IDs legacy en columnas `legacy_id`.
2. **Doble escritura:** durante un periodo, escribir en paralelo en `lead_tarjetas` y `oportunidades` mediante triggers o lógica de backend para asegurar consistencia.
3. **Medición/regresión:** dashboards temporales que comparen conteos entre el modelo viejo y el nuevo para validar que no se pierden registros.
4. **Desactivación legacy:** una vez estabilizado, remover vistas/triggers de compatibilidad, limpiar código que hable directo con Supabase y archivar las tablas `lead_*`.

### Fase 5 · Observabilidad y capacitación
1. **Auditoría:** aprovechar `audit_logs` para registrar acciones sensibles y exponerlas en un endpoint `/crm/audit`.
2. **Alertas:** integrar paneles de métricas (Prometheus/Grafana o Supabase logs) que avisen si fallan las migraciones o si RLS bloquea tráfico legítimo.
3. **Documentación:** actualizar `README.md`, `docs/` y la wiki interna con diagramas ERD, contratos de API y guías de onboarding multi-tenant.
4. **Handoff:** capacitar al equipo de soporte y ventas sobre los nuevos conceptos (`cuentas` vs `clientes`, `oportunidades`, `actividades`) y actualizar scripts de adopción.

### Plan de ejecución · Punto 2 (Embudo/Oportunidades/Cotizaciones)
1. **Backend API**
   - [x] Reemplazar los endpoints `/crm/leads/{id}/{cliente|convertir|quotes|quotes/send}` y `/crm/quotes/{id}/mark` por rutas equivalentes sobre `oportunidades/{id}` y `cotizaciones/{id}`. Actualizar esquemas Pydantic para usar IDs de oportunidad y cuenta en lugar de `tarjeta_id`.
   - [x] Extender `CRMRepository` con métodos nativos (`list_quotes`, `create_quote`, `mark_quote`, `get_opportunity_with_contact`) que lean/escriban `cotizaciones`, `cotizacion_items`, `oportunidades` y `oportunidad_etapas_historial`. Eliminar el bloque legacy que llama `/rest/v1/lead_*` y los RPC `panel_lead_*`.
   - [x] Migrar `storage.ensure_conversation_opportunity` (antes `ensure_lead_tarjeta`), `capture_opportunity_if_ready` y `promote_opportunity_stage` para que creen/actualicen oportunidades CRM directamente (sin `lead_tarjetas`). Ajustar los consumidores de `storage` en `channels/webchat`, `channels/whatsapp`, `assistants/tools/lead`.
   - [x] Preparar migraciones SQL que eliminen la dependencia de `panel_lead_*` (drop de RPCs/funciones y triggers legacy) una vez que las nuevas rutas estén en producción.
2. **Frontend embudo**
   - [x] Actualizar los server actions `/api/embudo/leads/[oportunidadId]/*` para que consuman los nuevos endpoints (`/crm/oportunidades/*`, `/crm/cotizaciones/*`) y renombrar parámetros a `oportunidadId`.
   - [x] Refactorizar `frontend/panel/src/lib/embudo/{data,actions,helpers}.ts` y componentes (`board-client`, `lead-drawer`, `lead-onboarding`, etc.) para usar la forma nueva de las tarjetas (IDs de oportunidad, campos `titulo/monto/estado`) y los DTOs de cotizaciones CRM.
   - [x] Revisar las vistas relacionadas (agenda, visitas, analytics) que aún leen `tarjeta_id` y reemplazarlas por `oportunidad_id`, asegurando compatibilidad con los loaders de nuevas APIs.
   - [x] Añadir pruebas de regresión (unitarias y de integración end-to-end del embudo) que validen creación, movimiento de etapas, generación/envío/marcado de cotizaciones y conversión a cliente usando el pipeline CRM.

### Plan de ejecución · Punto 3 (Clientes y Portal)
1. **Modelo de datos**
- [x] Extender `clientes` para almacenar `cuenta_id` y `oportunidad_id` reales; rellenar esos campos con una migración que mapee los IDs legacy y documente la relación (`legacy_lead_id` sólo para auditoría). Ajustar PK/FK de `cliente_portal_tokens`, `cliente_documentos`, `cliente_responsables` para que dependan de los nuevos IDs.
- [x] Actualizar `_cliente_select_clause` (backend) y los tipos compartidos (`frontend/panel/src/types/clientes.ts`) para remover `lead_tarjeta_id` y exponer los nuevos campos.

 El archivo `supabase/migrations/20260705_110000_clientes_crm_ids.sql` renombra `lead_tarjeta_id` → `legacy_lead_id`, rellena `cuenta_id`/`oportunidad_id` en `clientes` y propaga esos IDs (junto con `organizacion_id`) hacia `cliente_documentos`, `cliente_responsables` y `cliente_portal_tokens`, además de reescribir las policies RLS para basarse en `organizacion_id`. Con esto FastAPI puede leer `cuenta_id`/`oportunidad_id` directo desde `_cliente_select_clause` sin depender del helper legacy.
2. **APIs de clientes/portal**
   - [x] Refactorizar `CRMRepository` (`get_cliente_por_lead`, `convert_lead_en_cliente`, `create_portal_token`, etc.) para usar `cuentas`/`oportunidades` y las rutas CRM nativas; eliminar la resolución por `lead_id`.
   - [x] Ajustar las rutas `/crm/clientes/*` y `/crm/portal/*` para operar con los nuevos identificadores y payloads (incluyendo documentos y responsables).

    Los métodos que dependían de `lead_id` desaparecieron; ahora `get_cliente_por_oportunidad` es la única lectura y `convert_oportunidad_en_cliente` envía el `oportunidad_id` real al RPC de conversión, con lo que se evita la firma `get_cliente_por_lead` y se documenta explícitamente el uso de CRM. 【backend/app/repositories/crm.py:2635-2740】 Las rutas de portal reutilizan `_cliente_context`/`_portal_session_context` para inyectar `organizacion_id`, `cuenta_id` y `oportunidad_id` tanto al emitir tokens como al subir documentos o responsables desde el portal público. 【backend/app/api/routes/crm.py:454-507】【backend/app/api/routes/crm.py:4615-4700】【backend/app/api/routes/crm.py:4728-4805】 Las pruebas `test_crm_pipeline_end_to_end` ya verifican que la conversión devuelve `oportunidad_id`/`legacy_lead_id` consistentes tras aceptar una cotización, y el usuario corrió `poetry run pytest tests/api/test_crm_pipeline_flow.py` para validarlo. 【backend/tests/api/test_crm_pipeline_flow.py:296-453】
3. **Frontend panel + portal público**
   - [ ] Actualizar `frontend/panel/src/lib/clientes/data.ts` y las vistas de clientes para consumir `cuentas` y `clientes` CRM sin referencias a `lead_tarjeta_id`. Revisar formularios (actualización fiscal, documentos, responsables) para que envíen los payloads nuevos.
   - [ ] Modificar los SDK/API del portal (`frontend/panel/src/lib/portal/data.ts` y `/api/portal/*`) para alinearlos con los cambios en el backend y validar expiración de tokens usando los campos actualizados.
4. **Limpieza final**
   - [ ] Retirar triggers/vistas/policies relacionadas a `lead_tarjetas` en Supabase, desmontar los bundles estáticos legacy en `backend/app/public/panel` y cerrar el endpoint `/panel/env.js` cuando no quede consumo.
  - [ ] Documentar en `docs/erd_crm_plan.md` y en la wiki el nuevo flujo end-to-end (creación de oportunidad → cotización → conversión a cliente → portal) y actualizar los runbooks operativos.
