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
- Prospección (Google Places y DENUE) expone `/crm/prospeccion/*` y los clientes (`frontend/panel/src/lib/prospeccion/*`) consumen esos endpoints mediante los proxies `/api/prospeccion/*`, por lo que ya no se llama a Supabase directo para crear/listar/borrar búsquedas y resultados; además, el router legacy (`backend/app/api/routes/panel.py`) ya no publica rutas `/prospeccion/*`, evitando doble implementación. 【backend/app/api/routes/crm.py:2139-2491】【backend/app/repositories/crm.py:1572-1664】【backend/app/api/routes/panel.py:5380-5438】
- La configuración de branding dejó de depender del panel legacy: `/crm/settings/logos` ya escribe/lee la tabla `logos` con control de admin y subida a Storage (`backend/app/api/routes/crm.py:2413-2474`, `backend/app/repositories/crm.py:549-573`). El proxy del panel (`frontend/panel/src/app/api/settings/logos/route.ts`) ahora usa `callCrmApi`, así que los formularios de plantillas (correo/cotización) consultan y suben logos únicamente a través del CRM.
- El catálogo que usa el embudo para seleccionar productos/cargos también consume `/crm/catalog/items`; el endpoint Next.js `/api/catalog/items` quedó como un simple proxy hacia `callCrmApi`, eliminando las llamadas directas a Supabase en el navegador (`frontend/panel/src/app/api/catalog/items/route.ts:1-48`).
- El inbox dejó de depender del backend legacy: `/crm/inbox/{summary,threads,messages,conversations/*}` ahora expone cambio de modo manual, respuestas y carga de adjuntos (`backend/app/api/routes/crm.py:3322-3704`), y los proxies de Next.js (`frontend/panel/src/app/api/inbox/*`) junto con `fetchLatestMessages` consumen exclusivamente `callCrmApi`, por lo que se eliminó `buildBackendTargets`, los endpoints `/conversaciones/*` del panel y el fallback a `/panel`. 【backend/app/api/routes/crm.py:3322-3704】【frontend/panel/src/app/api/inbox/[conversationId]/reply/route.ts:1-148】【frontend/panel/src/app/api/inbox/uploads/route.ts:1-64】【frontend/panel/src/lib/inbox/messages-server.ts:1-64】
- La conversión de leads, la vinculación con clientes y todo el flujo de cotizaciones (listar, crear, enviar, marcar estados) ocurre únicamente vía `/crm/leads/*` y los proxies `callCrmApi`, por lo que se eliminaron las rutas legacy `/leads/{id}/cliente`, `/leads/{id}/convertir` y `/leads/{id}/quotes` de `panel.py`. Esto evita la doble implementación sobre `lead_tarjetas` y reutiliza el mismo `CRMRepository` que usa el resto del panel. 【backend/app/api/routes/crm.py:4031-4270】【frontend/panel/src/app/api/embudo/leads/[tarjetaId]/cliente/route.ts:1-48】【frontend/panel/src/app/api/embudo/leads/[tarjetaId]/convertir/route.ts:1-38】
- `CRMRepository` incorporó `_rpc` y `register_webchat_message`, por lo que `storage.register_webchat_message` dejó de invocar `_call_supabase_rpc` directo y ahora registra mensajes/adjuntos del chat embebido mediante el cliente centralizado y el service role controlado. 【backend/app/repositories/crm.py:1142-1181】【backend/app/repositories/crm.py:2671-2693】【backend/app/services/storage.py:58-82】
- Las automatizaciones de conversación (`storage.ensure_lead_tarjeta`) dejaron de escribir en `lead_tarjetas` y ahora reutilizan `CRMRepository.ensure_conversation_opportunity`, de modo que los leads creados por webchat/WhatsApp entran directamente al pipeline del CRM con metadatos de conversación y canal. 【backend/app/repositories/crm.py:949-1121】【backend/app/services/storage.py:1788-1880】

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

## Brechas detectadas en el backend/frontend actuales
- `backend/app/services/storage.py` ya enruta `register_webchat_message` mediante `CRMRepository`, pero `register_whatsapp_message`, `fetch_conversation`, `get_webchat_contact_id`, `fetch_webchat_session_id` y `_call_supabase_rpc` siguen usando el service role directo; falta llevar esos caminos a `/crm` para completar el aislamiento multi-tenant. 【backend/app/services/storage.py:58-220】
- El router `/crm` y `CRMRepository` ya abastecen agenda, visitas, prospección, settings, contactos, inbox y cotizaciones; los únicos procesos que siguen hablando directo con Supabase son los de mensajería automática en `storage.py`. Migrarlos permitiría aplicar RLS multi-tenant y observabilidad homogénea. 【backend/app/services/storage.py:50-220】
- En el frontend todo el CRM (embudo, contactos, inbox, settings, visitas) ya usa `callCrmApi` y los endpoints `/crm/*`; no quedan llamadas directas a Supabase fuera de los endpoints de autenticación (`/api/auth/*`). 【frontend/panel/src/lib/api/crm.ts:1-192】【frontend/panel/src/lib/embudo/actions.ts:20-140】【frontend/panel/src/lib/visitas/data.ts:1-360】【frontend/panel/src/lib/inbox/data.ts:1-120】
- Las migraciones históricas (`supabase/migrations_tmp/20251026_210000_leads_kanban.sql`) todavía describen únicamente el tablero legacy; falta generar scripts que documenten la equivalencia final con `etapas_pipeline`/`oportunidades` para facilitar auditorías futuras.

## Estado actual resumido
- **Base de datos:** el dump `backups/postgres_20251122_221914/postgres_20251122_221914_schema.sql` ya contiene el ERD multi-tenant completo con RLS. Los módulos críticos del panel dejaron de usar `lead_*`, pero los procesos automáticos (webchat/WhatsApp) aún escriben directamente usando el service role, por lo que falta cortar definitivamente los accesos a las tablas legacy.
- **Backend:** FastAPI expone `/crm` con un cliente Supabase de servicio y ya cubre pipeline, archivos, notas, clientes/portal, cotizaciones, inbox, agenda, visitas y prospección. El router `panel.py` quedó reducido a settings heredados y utilerías; las únicas llamadas directas pendientes viven en `storage.py`, donde aún se usa Supabase REST para registrar mensajes/adjuntos de WhatsApp y leer `conversaciones` directamente. 【backend/app/services/storage.py:85-220】
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
3. **Integraciones existentes:** actualizar `panel.py` para que el flujo de cotizaciones y el inbox usen `crm_repository` en lugar de pegarle directo a Supabase. Mientras no exista UI nueva, mapear `lead_tarjetas` ⇄ `oportunidades` mediante vistas temporales.
4. **Sincronización de conversaciones:** migrar los RPC de mensajería y bitácoras pendientes (`registrar_mensaje_whatsapp`, carga de adjuntos y lectura de `conversaciones`) para que `storage.py` invoque helpers equivalentes en `/crm`, completando el corte con las tablas legacy.
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
- **Analytics de catálogo:** las tarjetas del dashboard consultan `/crm/analytics/catalog/ventas|embudo` mediante `callCrmApi`, y los endpoints legacy `/analytics/catalog/*` fueron eliminados de `panel.py`; incluso el CSV se genera en el server action usando los datos del CRM para mantener la separación multi-tenant.
- **Dashboard KPIs:** `/crm/dashboard/kpis` expone los agregados usados en la portada (antes `_fetch_dashboard_kpis` en `panel.py`), por lo que los rangos de fechas y los KPIs de visitas ya no dependen de `_sb_post` directo.
- **Exportaciones:** existe `/crm/analytics/catalog/ventas/export` para descargar el CSV firmado desde el backend multi-tenant, reemplazando la lógica custom en `panel.py` y evitando exponer consultas directas a Supabase.
- **Historial/notas:** la vista de historial de cada lead ya consume `/crm/pipeline/opportunities/{id}/history`, leyendo y agregando notas directamente en `oportunidad_etapas_historial`. No quedan llamadas a los RPC `panel_lead_movimientos` / `panel_lead_add_nota`.
- **Settings y catálogo:** las plantillas de email (`/settings/email`), el formato de cotizaciones (`/settings/formato-cotizacion`), los recordatorios (`/settings/reminders`) y el catálogo de productos (`/settings/catalogo`) ya se leen/escriben vía `/crm/settings/*` y `/crm/catalog/items`, eliminando el uso de `callSupabaseRest` en estas secciones.
- **Contactos:** la vista de contactos (`frontend/panel/src/lib/contactos/data.ts`) dejó de llamar los RPC desde el navegador y ahora consume `/crm/contacts/{summary,timeline,list}`, que encapsulan las funciones `panel_contactos_*` usando el token del usuario.
- **Inbox:** el panel de mensajes e hilos ahora consume `/crm/inbox/{summary,threads,messages}` y los server actions (`loadInboxData`, `fetchLatestMessages`, `/api/inbox/threads`) dejaron de usar `callSupabaseRpc`.
- **Pendientes inmediatos:** (1) agregar manejo de conflictos de etapa (`409 opportunity_stage_conflict`) en la UI para soportar edición concurrente; (2) enlazar los contadores de visitantes (`visitantes_sin_chat`) con los dashboards ahora que `/crm/visitas/*` expone los mismos datos.

#### Estado actual de clientes y portal (noviembre 2025)
- **Backend unificado:** `backend/app/api/routes/crm.py` concentra los enums/payloads de clientes (`ClienteDocumento*`, `ClientePortalLinkPayload`) y las rutas `/crm/clientes/*` y `/crm/portal/*`, por lo que toda la edición fiscal, documentos, responsables y enlaces del portal pasa por una sola capa y `CRMRepository` controla el acceso con el service role. 【backend/app/api/routes/crm.py:109】【backend/app/api/routes/crm.py:2776】【backend/app/repositories/crm.py:1610】
- **Server actions internas:** los endpoints del panel que editan clientes desde el embudo ya delegan en `/crm` a través de los server actions `/api/embudo/clientes/[clienteId]` y `/api/embudo/clientes/[clienteId]/portal-links`, eliminando fetch directos a Supabase desde React. 【frontend/panel/src/app/api/embudo/clientes/[clienteId]/route.ts:17】【frontend/panel/src/app/api/embudo/clientes/[clienteId]/portal-links/route.ts:17】
- **Portal público:** las rutas `/api/portal/[token]` (estado, fiscales, documentos y responsables) y el loader `loadPortalEstado` consumen los nuevos endpoints del backend (`/crm/portal/clientes/...`), así que el portal ya no conoce la anon key. 【frontend/panel/src/app/api/portal/[token]/route.ts:16】【frontend/panel/src/app/api/portal/[token]/documentos/upload/route.ts:16】【frontend/panel/src/app/api/portal/[token]/responsables/[responsableId]/route.ts:17】【frontend/panel/src/lib/portal/data.ts:6】
- **Limpieza del panel:** la sección legacy de `backend/app/api/routes/panel.py` ya no define `ClienteDocumento*` ni rutas `/clientes/*` o `/portal/*`; el archivo pasa directamente de `LeadConversionPayload` a `CatalogItem` y sólo conserva los endpoints de settings/analytics. Con esto evitamos doble implementación y cualquier ajuste vive exclusivamente en `/crm`. 【backend/app/api/routes/panel.py:254】【backend/app/api/routes/panel.py:263】

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
