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
2. [x] Añadir `organizacion_id` a tablas existentes y migrar datos actuales respetando el aislamiento. _`20260601_200000_multitenant_core.sql` agrega y rellena `organizacion_id` en `contactos`, `lead_*`, `clientes`; `20260601_201600_ticket_comments_org.sql` hace lo propio para `ticket_comentarios`. Falta aplicar RLS equivalente en las tablas legacy (`lead_*`, `clientes`, etc.) para cerrar la fase._
3. [x] Crear tablas del núcleo CRM (`cuentas`, `contactos`, `etapas_pipeline`, `oportunidades`, `oportunidad_etapas_historial`). _`supabase/migrations/20260601_200500_crm_core_entities.sql` crea todas las entidades del ERD central._
4. [ ] Introducir `actividades` y/o `tareas`, agregando `prioridad`, `fecha_vencimiento`, `sla_horas` y `recordatorio_en`, y migrar llamadas/conversaciones a este modelo.
   - _Estado actual:_ tablas y endpoints `/crm/actividades` ya existen (`backend/app/api/routes/crm.py` + `CRMRepository`), pero aún faltan migraciones de datos desde `conversaciones/llamadas` y la exposición en frontend.
5. [ ] Implementar `tickets` y `ticket_comentarios` si aplica al soporte actual.
   - _Estado actual:_ tablas, RLS y endpoints `/crm/tickets` + `/crm/tickets/{id}/comentarios` están disponibles; resta migrar los tickets legacy (si los hay) y conectar el frontend.
6. [ ] Incorporar `productos`, `cotizaciones`, `cotizacion_items` cuando se active ventas/cobranzas.
7. [ ] Añadir `campanas`, `leads`, `lead_eventos` para captación y alimentar el funnel.
8. [ ] Integrar `tags`, `archivos`, `audit_logs` y ajustar APIs para exponer CRUD filtrados por `organizacion_id` y `propietario_usuario_id`.
   - _Estado actual:_ `archivos`, `tags` y `taggings` ya tienen endpoints polimórficos en `/crm` y cobertura de pruebas; falta exponer `audit_logs` y conectar el frontend.
9. [ ] Crear `notas` polimórficas con flag de visibilidad y conectarlas a las entidades (cuentas, contactos, oportunidades, tickets, actividades) respetando RLS.
10. [ ] Publicar endpoints polimórficos para `archivos`, `taggings` y `notas`, validando el catálogo de `relacion_tipo` y adoptando componentes frontend reutilizables con visibilidad y permisos por tenant.

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

- ### Avance actual (backend)
  - `backend/app/api/routes/crm.py` cubre `cuentas`, `etapas`, `oportunidades`, `actividades`, `tickets` (con comentarios), `archivos`, `tags/taggings`; todo respaldado por `backend/app/repositories/crm.py`.
  - Falta incorporar `productos`, `cotizaciones`, `campanas`, `leads`, `notas`, `audit_logs` y exponerlos via `/crm`, así como migrar los endpoints del panel legacy (`panel.py`) para dejar de depender de `/rest/v1/lead_*`.

### Cierre del plan
- Completar los endpoints restantes `/crm/...` (ventas, marketing, notas, auditoría) y trasladar el frontend al nuevo cliente HTTP; en paralelo, aplicar RLS multi-tenant en las tablas legacy y planear la migración de datos/UI.
- El frontend carece de un cliente `crm.ts`; sólo existe `frontend/panel/src/lib/api/panel.ts`, por lo que habrá que añadir un wrapper que consuma los nuevos endpoints y migrar gradualmente los componentes del embudo hacia ese cliente.

Con estas definiciones, el plan queda completo respecto a la lista recomendada; la ejecución requiere seguir las migraciones y ajustes de frontend/backend que se describen abajo.

## Brechas detectadas en el backup `backups/postgres_20251122_164957`
- Las tablas actuales clave (`clientes`, `contactos`, `usuarios`, `roles`, `usuarios_roles`) no tienen columna de tenant ni RLS, por lo que el plan debe añadir `organizacion_id` y políticas de aislamiento antes de exponerlas como multi-tenant. 【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L1225-L1247】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L10735-L10751】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L10793-L10802】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L11847-L11891】
- El pipeline vigente está centrado en `lead_tableros`/`lead_etapas`/`lead_tarjetas` y su historial (`lead_movimientos`), sin entidades de `cuentas` u `oportunidades`; el plan debe incluir migraciones de esos tableros y movimientos hacia el nuevo modelo de oportunidades y etapas. 【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L11264-L11298】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L11325-L11336】
- Las actividades actuales se reparten entre `conversaciones` (mensajería) y `llamadas`, sin unificarse en una tabla polimórfica; se requiere una estrategia de consolidación hacia `actividades` con enlaces a cuentas/contactos/oportunidades y campos de SLA. 【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L10758-L10775】【F:backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql†L11379-L11392】

## Brechas detectadas en el backend/frontend actuales
- `backend/app/api/routes/panel.py` sigue consultando Supabase con `lead_tarjetas`, `lead_etapas` y `contactos` para componer cotizaciones y movimientos (por ejemplo, el helper `_fetch_lead_for_quote` en las líneas 1589-1607). No hay endpoints que sirvan `cuentas`/`oportunidades`, así que la primera fase del plan debe introducir un módulo `/crm` paralelo que oculte las nuevas tablas detrás del backend antes de tocar el frontend.
- `backend/app/services/storage.py:1792-1854` crea o actualiza tarjetas directamente en `/rest/v1/lead_tarjetas` para sincronizar conversaciones; esta dependencia obliga a definir cómo se mapearán chats/llamadas hacia `actividades` y `oportunidades` para no romper el inbox durante la migración.
- En el frontend, `frontend/panel/src/lib/leads/supabase.ts:67-193` encapsula el consumo directo de Supabase (`callSupabaseRest`/`callSupabaseRpc`), sin noción de `organizacion_id`. Cualquier multi-tenant serio debe mover esta lógica al backend o, al menos, incluir filtros por tenant antes de exponer los datos al navegador.
- La creación y actualización de leads (`frontend/panel/src/lib/embudo/actions.ts:423-520`) inserta filas en `lead_tarjetas` y ejecuta RPC como `panel_lead_update`; habrá que reescribir estas acciones para crear `oportunidades` y su historial en lugar de tarjetas del tablero.
- La vista de clientes (`frontend/panel/src/lib/clientes/data.ts:22-48`) obtiene `clientes` y sus responsables directamente desde Supabase, por lo que el nuevo modelo de `cuentas` deberá exponer un endpoint equivalente antes de migrar la pantalla.
- El único helper HTTP del frontend es `frontend/panel/src/lib/api/panel.ts:1-18`, que únicamente resuelve `PANEL_API_URL`; no existe `frontend/panel/src/lib/api/crm.ts`, por lo que se necesita crear dicho cliente (o ampliar el existente) para consumir los endpoints que se añadan en FastAPI.
- Las migraciones vivas (`supabase/migrations_tmp/20251026_210000_leads_kanban.sql:128-190`) definen `lead_tarjetas`, `lead_movimientos` y `lead_recordatorios` sin `organizacion_id`, reafirmando que habrá que introducir nuevas tablas o columnas —y migraciones de datos— antes de habilitar RLS multi-tenant.

## Estado actual resumido
- **Base de datos:** respalda `backups/postgres_20251122_164957/postgres_20251122_164957_schema.sql` muestran un CRM basado en leads (tarjetas de tablero), sin entidades de cuentas/u oportunidades ni `organizacion_id`. Existen múltiples vistas y triggers acoplados a `lead_tarjetas`.
- **Backend:** FastAPI (ruta `backend/app/api/routes/panel.py`) expone endpoints que actúan como pasarela hacia Supabase, sin capa de dominio para CRM; la sincronización de conversaciones (`backend/app/services/storage.py`) también depende de `lead_tarjetas`.
- **Frontend:** Next.js (`frontend/panel`) se conecta directo a Supabase mediante `callSupabaseRest` y `callSupabaseRpc`, usa componentes diseñados para un tablero kanban y carece de cliente HTTP hacia el backend para CRM.
- **Infra/RLS:** existen políticas parciales para `lead_tarjetas`, pero no para las tablas clave (`clientes`, `contactos`, `usuarios`). No hay control por tenant.

## Plan de ejecución detallado

### Fase 0 · Preparación operativa
1. **Inventario y respaldos:** congelar un dump completo (ya existe `backups/postgres_20251122_164957`) y documentar qué tablas/vistas tocan los servicios activos (inbox, agenda, clientes). Registrar métricas de volumen para planear migraciones.
2. **Variables y secretos:** validar que `SUPABASE_SERVICE_ROLE`, `SUPABASE_URL`, `PANEL_API_URL` y las llaves utilizadas por backend/frontend estén almacenadas en `.env` o en el gestor correspondiente antes de modificar servicios.
3. **Entorno de staging:** montar un Supabase o Postgres de prueba, apuntar `backend` y `frontend` a ese entorno para validar cada fase sin impactar producción. Documentar la configuración en `supabase/README.md`.

### Fase 1 · Núcleo multi-tenant en la base de datos
1. **Crear tablas de tenant:** `organizaciones`, `roles`, `usuarios`, `usuario_roles` con `organizacion_id` y RLS (`supabase/migrations/20XX..._core_multitenant.sql`). Migrar datos históricos creando una `organizacion` por instancia actual.
2. **Agregar `organizacion_id`:** extender `clientes`, `contactos`, `lead_tableros`, `lead_etapas`, `lead_tarjetas`, `conversaciones`, `llamadas`, `cotizaciones`, etc., rellenando el campo con la organización actual y creando índices (`organizacion_id`, `organizacion_id + estado`).
3. **Tablas nuevas del ERD:** `cuentas`, `etapas_pipeline`, `oportunidades`, `oportunidad_etapas_historial`, `actividades`, `tickets`, `productos`, `cotizaciones`, `campanas`, `leads`, `lead_eventos`, `tags`, `taggings`, `archivos`, `audit_logs`, `notas`.
4. **Triggers y vistas:** reescribir los triggers que hoy dependen de `lead_tarjetas` para que actualicen `oportunidades`/`historial`. Crear vistas de compatibilidad (`v_leads_legacy`) para que los servicios actuales sigan funcionando durante la transición.
5. **RLS por tenant:** habilitar políticas `USING (organizacion_id = current_setting('app.organizacion_id')::uuid)` y exponer funciones `set_config('app.organizacion_id', ...)` en los RPC usados por el backend.

### Fase 2 · Backend FastAPI (/crm)
1. **Cliente Supabase de servicio:** encapsular en `backend/app/repositories/crm_repository.py` todas las llamadas a Supabase usando el service role y el nuevo `organizacion_id`.
2. **Endpoints REST `/crm`:** crear routers dedicados (`backend/app/api/routes/crm/accounts.py`, `.../opportunities.py`, etc.) que expongan CRUD filtrado por tenant y traduzcan los modelos Pydantic nuevos (`backend/app/models/crm.py`).
3. **Integraciones existentes:** actualizar `panel.py` para que el flujo de cotizaciones y el inbox usen `crm_repository` en lugar de pegarle directo a Supabase. Mientras no exista UI nueva, mapear `lead_tarjetas` ⇄ `oportunidades` mediante vistas temporales.
4. **Sincronización de conversaciones:** modificar `backend/app/services/storage.py` para que `ensure_lead_tarjeta` evolucione a `ensure_opportunity_activity`, creando registros en `actividades` y manteniendo referencias a `conversaciones`.
5. **Validaciones y pruebas:** crear pruebas unitarias/contract en `backend/tests/api/test_crm_*.py` que cubran permisos, filtros por tenant y transiciones de etapas.

### Fase 3 · Frontend Panel
1. **Cliente HTTP CRM:** añadir `frontend/panel/src/lib/api/crm.ts` que use `PANEL_API_URL` (desde `panel.ts`) para llamar al backend con fetch y manejar tokens de sesión.
2. **Hooks y stores:** crear hooks (`useCRMAccounts`, `useOpportunitiesPipeline`) que consuman el nuevo cliente y reemplacen gradualmente el acceso directo a Supabase (`frontend/panel/src/lib/leads/supabase.ts`).
3. **UI de cuentas/contactos:** migrar `frontend/panel/src/lib/clientes` a `cuentas`, mostrando datos provenientes de `/crm/accounts`. Mantener la pantalla legacy detrás de un feature flag hasta completar la migración.
4. **Embudo y actividades:** rediseñar `frontend/panel/src/lib/embudo` para usar `oportunidades`, `etapas_pipeline` y `actividades`. Reaprovechar componentes de drag & drop, pero colgarse del nuevo API para mover etapas y registrar historial.
5. **Soporte/marketing:** cuando ventas esté estable, activar vistas de tickets, campañas y leads de marketing reutilizando los mismos componentes para tags, archivos y notas.

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
