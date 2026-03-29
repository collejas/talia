# Plan costos OpenAI

Fecha: 2026-03-29

## Objetivo

Diseñar e implementar una trazabilidad completa de uso y costos OpenAI por:

- request
- conversación
- asistente/prompt
- canal (`whatsapp`, `webchat`, `messenger`, `voice`, jobs internos)
- tenant
- organización/proyecto OpenAI
- tenant maestro vs tenants clientes

El objetivo no es solo estimar costo agregado mensual, sino poder responder con precisión:

- cuánto costó una conversación puntual
- cuánto costó un tenant en un rango
- cuánto costó un asistente/prompt/canal
- cuánto del gasto pertenece al tenant maestro y cuánto a tenants contratantes
- qué parte del costo viene de input, cached input, output, reasoning o tools facturables

## Fuentes oficiales OpenAI revisadas

Referencias oficiales relevantes:

- Responses API y campo `usage` por request:
  - https://platform.openai.com/docs/api-reference/responses/create
- Conteo de input tokens previo a enviar una respuesta:
  - https://platform.openai.com/docs/api-reference/responses/input_tokens
- Pricing oficial por modelo y modalidades:
  - https://platform.openai.com/pricing
- Guías/model cards por modelo, incluyendo pricing y capacidades:
  - https://developers.openai.com/api/docs/models/gpt-5.1
- API de costos/usage agregados a nivel organización/proyecto:
  - https://platform.openai.com/docs/api-reference/usage/costs

## Lo que OpenAI sí ofrece hoy

### 1. `usage` por request

Cada llamada a Responses puede devolver `usage`, con al menos:

- `input_tokens`
- `input_tokens_details.cached_tokens`
- `output_tokens`
- `output_tokens_details.reasoning_tokens`
- `total_tokens`

Esto permite persistir el uso exacto bruto por request al momento de responder.

### 2. pricing oficial por modelo

OpenAI publica precios oficiales por modelo, y en algunos casos por:

- input
- cached input
- output
- tool calls facturables

Esto permite calcular costo estimado por request si se conoce:

- modelo efectivo
- tokens de input
- tokens de input cacheado
- tokens de output
- tool usage facturable, si aplica

### 3. APIs agregadas de Usage/Costs

OpenAI tiene endpoints de uso/costos agregados por buckets de tiempo, con filtros/grupos como:

- `project_id`
- `model`
- `api_key_id`
- `user_id`
- rango temporal

Esto sirve para conciliación y auditoría.

## Lo que OpenAI no resuelve solo

OpenAI no resuelve automáticamente, dentro de tu app, la trazabilidad de negocio por:

- tenant de tu SaaS
- canal
- conversación CRM
- oportunidad/contacto
- prompt/assistant lógico del negocio

Para eso debes persistir telemetría propia en tu base.

## Hallazgos en tu sistema actual

## Base de datos actual

### Sí existe hoy

- `public.organizaciones`: tenants del SaaS
- `public.secretos`: secretos por tenant, incluyendo OpenAI
- `public.conversaciones`, `public.mensajes`, `public.contactos`, `public.oportunidades`
- `public.agentes`, `public.prompts`, `public.prompt_versions`, `public.prompt_bindings` (hoy vacías)
- `public.ejecuciones_asistente` existe pero hoy está vacía y no parece ser el ledger principal de OpenAI

### No existe hoy

No existe una tabla dedicada para ledger de uso/costos OpenAI, por ejemplo:

- `openai_request_usage`
- `openai_cost_ledger`
- `openai_project_reconciliation`
- `openai_pricing_catalog`

Tampoco existe evidencia de una tabla histórica por request con:

- `response_id`
- `usage`
- `model`
- `project_id`
- costo calculado

## Configuración multi-tenant actual

En Supabase y UI ya existe soporte para resolver por tenant:

- `organizaciones.config.webchat.assistant_id`
- `organizaciones.config.whatsapp.prompt_id` y `prompt_version`
- `organizaciones.config.openai.general.project_id`
- secretos por tenant:
  - `openai.api_key`
  - `openai.general.api_key`
  - `openai.voice.api_key`

Pero el estado actual observado es mixto:

- la UI sí soporta `openai.general.project_id`
- el secreto `openai.general.api_key` sí existe al menos en el tenant maestro
- las filas actuales consultadas de `public.organizaciones` muestran `config->'openai'` como `null`
- `public.prompts`, `public.prompt_versions`, `public.prompt_bindings` y `public.agentes` siguen vacías hoy

Conclusión:

- la capacidad de segregación por tenant ya está parcialmente modelada
- pero `project_id` por tenant no está todavía poblado/operando de forma consistente en la data actual

## Backend actual

### Sí hace hoy

- resuelve `assistant_id` / `prompt_id` por tenant/canal
- resuelve API key por tenant desde `public.secretos`
- persiste `response_id` y `openai_conversation_id` en conversación/mensajes
- usa `store: true` en Responses

### Gap crítico 1: no persiste `usage`

Hoy no se está extrayendo ni guardando `response.model_dump()["usage"]` después de `client.responses.create(...)` ni después de `run_tool_loop(...)`.

Resultado:

- tienes trazabilidad conversacional
- pero no trazabilidad económica

### Gap crítico 2: `project_id` se guarda pero no parece aplicarse al cliente

Hallazgo del código actual:

- `AssistantConfig` tiene `project_id`
- `tenant_runtime` devuelve `project_id`
- UI guarda `openai.general.project_id`

Pero el cliente actual se construye así:

- `AsyncOpenAI(api_key=api_key)`

No se ve uso explícito de `project=...` ni un header equivalente aplicado en `app/services/openai.py`.

Implicación:

- aunque guardes `project_id` por tenant, hoy es probable que las llamadas no estén segregadas por proyecto OpenAI
- eso debilita la conciliación con Usage/Costs API

### Gap crítico 3: no existe reconciliación con Usage/Costs API

No hay proceso visible que:

- consulte costos agregados oficiales de OpenAI
- compare contra el ledger interno por request
- detecte diferencias

## Frontend actual

La UI sí permite administrar por tenant:

- `openai.general.project_id`
- `openai.general.api_key`
- settings de voz
- settings de webchat/whatsapp

Pero no existe hoy una UI de observabilidad/costos OpenAI por:

- tenant
- canal
- conversación
- modelo
- proyecto OpenAI

## Principio de diseño recomendado

Debe haber dos capas de medición:

### Capa A. Ledger interno por request

Fuente primaria para operación diaria.

Sirve para responder:

- cuánto costó este mensaje
- cuánto costó esta conversación
- cuánto costó este tenant
- cuánto costó este canal

### Capa B. Reconciliación oficial OpenAI

Fuente de auditoría/conciliación.

Sirve para responder:

- cuánto facturó realmente OpenAI por proyecto/modelo/rango
- si el ledger interno cuadra con OpenAI
- si hay requests no instrumentadas o pricing desactualizado

Las dos capas deben coexistir.

## Estrategia multi-tenant recomendada

## Escenario objetivo

### Tenant maestro

Tu tenant maestro controla:

- organización OpenAI principal
- catálogo global de precios usado para cálculo interno
- jobs de conciliación con Usage/Costs API
- dashboards globales multi-tenant

### Tenants clientes

Cada tenant cliente debe poder operar en uno de estos modos:

#### Modo 1. Proyecto OpenAI dedicado por tenant

Cada tenant tiene:

- su `openai.general.api_key`
- su `openai.general.project_id`

Ventajas:

- mejor segregación real en OpenAI
- conciliación más limpia
- límites y gasto más auditables

Desventaja:

- mayor complejidad operativa

#### Modo 2. Proyecto compartido del tenant maestro

Varios tenants comparten key/proyecto, pero la app etiqueta internamente cada request.

Requiere persistir sí o sí:

- `tenant_id`
- `channel`
- `assistant logical key`
- `response_id`
- `metadata` interna

Ventaja:

- operación más simple

Desventaja:

- la separación por tenant vive principalmente en tu BD, no en OpenAI

## Recomendación pragmática

- Tenant maestro y tenants enterprise: proyecto OpenAI dedicado
- Tenants pequeños: proyecto compartido al inicio, pero con ledger interno completo
- La arquitectura debe soportar ambos modos

## Medibilidad obligatoria por tenant

## Regla de producto

Cada tenant debe ser medible de punta a punta en:

- requests
- tokens
- costos internos
- costos oficiales OpenAI
- latencia
- retries y fallbacks
- canal
- asistente lógico
- conversación
- proyecto OpenAI

No se debe permitir que un tenant quede parcialmente instrumentado.

## Configuración mínima obligatoria por tenant

Cada tenant que use OpenAI debe tener configurado, como mínimo:

- `openai.general.project_id`
- `openai.general.api_key` o `openai.general.api_key_id`

Y además debe tener instrumentados todos los caminos que llamen OpenAI, por ejemplo:

- `webchat`
- `whatsapp`
- `summary`
- `voice`
- jobs internos que usen Responses, Assistants, Embeddings o similares

## Riesgo operativo observado

Ya se observó un caso real donde un tenant generó tráfico interno en el ledger con:

- `organizacion_id` correcto
- costo interno correcto
- pero `openai_project_id = null`

Resultado:

- el tenant sí aparece en costos internos
- pero no puede reconciliarse correctamente contra el costo oficial por proyecto OpenAI
- la vista de reconciliación muestra `internal_requests_count = 0` aunque sí hubo requests internas

Este caso confirma que la medición incompleta por tenant rompe la trazabilidad.

## Enforcement recomendado

### 1. Auditoría de configuración

Crear una auditoría periódica que detecte tenants con configuración OpenAI incompleta:

- sin `project_id`
- sin `api_key` o `api_key_id`
- con features OpenAI habilitadas pero sin configuración medible completa

Resultado esperado:

- lista clara de tenants no reconciliables
- warning operativo antes de que el problema llegue a facturación o soporte

### 2. Warning visible en UI

Mostrar en settings/admin un estado explícito de medición por tenant:

- `medición completa`
- `medición incompleta`
- `no reconciliable`

Y mostrar la causa exacta, por ejemplo:

- falta `openai.general.project_id`
- falta `openai.general.api_key`
- el canal usa OpenAI pero no reporta `project_id`

### 3. Endurecimiento en runtime

Cuando un request OpenAI se ejecute sin configuración medible completa:

- persistir el incidente en logs/telemetría
- marcar la request como `measurement_incomplete=true`
- evitar que el problema quede silencioso

Opcionalmente, en tenants que deban ser totalmente auditables, permitir bloqueo duro del request hasta corregir la configuración.

### 4. Reconciliación como criterio de salud

La reconciliación por proyecto no debe verse como reporte opcional, sino como señal de salud del tenant:

- si un tenant produce requests internas sin `project_id`, está en estado degradado de medición
- si el delta oficial/interno crece por tráfico no atribuible, debe investigarse

## Política operativa recomendada

- ningún tenant productivo debe quedar con `project_id` nulo si usa OpenAI
- ningún tenant con features OpenAI habilitadas debe quedar sin key/proyecto resolubles
- el tenant maestro debe poder auditar qué tenants son reconciliables y cuáles no
- la plataforma debe distinguir entre:
  - tenant completamente medible
  - tenant parcialmente medible
  - tenant no reconciliable

## Diseño de datos propuesto

Crear estas tablas nuevas en Supabase.

## 1. `public.openai_request_usage`

Ledger atómico por request OpenAI.

Campos propuestos:

- `id uuid pk`
- `created_at timestamptz not null default now()`
- `organizacion_id uuid not null`
- `source_tenant_mode text not null`
  - `master_shared`
  - `tenant_dedicated`
- `channel text not null`
  - `whatsapp`, `webchat`, `messenger`, `voice`, `summary`, `embeddings`, etc.
- `feature text null`
  - `sales_chat`, `followup`, `conversation_summary`, `catalog_embeddings`, etc.
- `conversation_id uuid null`
- `message_id uuid null`
- `contact_id uuid null`
- `opportunity_id uuid null`
- `openai_response_id text null`
- `openai_conversation_id text null`
- `openai_project_id text null`
- `openai_api_key_fingerprint text null`
- `openai_model text not null`
- `openai_provider text not null default 'openai'`
- `assistant_kind text not null`
  - `prompt`, `assistant`, `raw_model`
- `assistant_ref text null`
  - `pmpt_...`, `asst_...`, logical assistant key
- `prompt_version text null`
- `request_purpose text null`
  - `reply`, `quality_retry`, `summary`, `tool_loop_iteration`, `followup`, etc.
- `request_metadata jsonb not null default '{}'::jsonb`
- `input_tokens integer not null default 0`
- `cached_input_tokens integer not null default 0`
- `output_tokens integer not null default 0`
- `reasoning_tokens integer not null default 0`
- `total_tokens integer not null default 0`
- `estimated_input_cost_usd numeric(18,8) not null default 0`
- `estimated_cached_input_cost_usd numeric(18,8) not null default 0`
- `estimated_output_cost_usd numeric(18,8) not null default 0`
- `estimated_reasoning_cost_usd numeric(18,8) not null default 0`
- `estimated_tools_cost_usd numeric(18,8) not null default 0`
- `estimated_total_cost_usd numeric(18,8) not null default 0`
- `latency_ms integer null`
- `http_status integer null`
- `request_status text not null default 'completed'`
- `error_code text null`
- `error_message text null`
- `fallback_used boolean not null default false`
- `quality_retry_used boolean not null default false`

Índices mínimos:

- `(organizacion_id, created_at desc)`
- `(organizacion_id, channel, created_at desc)`
- `(openai_project_id, created_at desc)`
- `(openai_model, created_at desc)`
- `(conversation_id, created_at asc)`
- unique parcial por `openai_response_id` cuando no sea null

## 2. `public.openai_pricing_catalog`

Catálogo versionado de precios usados por el cálculo interno.

Campos:

- `id uuid pk`
- `provider text`
- `model text`
- `effective_from timestamptz`
- `effective_to timestamptz null`
- `input_per_1m_usd numeric(18,8)`
- `cached_input_per_1m_usd numeric(18,8)`
- `output_per_1m_usd numeric(18,8)`
- `reasoning_per_1m_usd numeric(18,8) null`
- `tool_call_unit_usd numeric(18,8) null`
- `notes text null`
- `source_url text null`

Objetivo:

- calcular costo histórico correctamente aunque OpenAI cambie precios

## 3. `public.openai_cost_reconciliation`

Buckets de conciliación con OpenAI Usage/Costs API.

Campos:

- `id uuid pk`
- `bucket_start timestamptz not null`
- `bucket_end timestamptz not null`
- `openai_project_id text null`
- `openai_api_key_id text null`
- `openai_model text null`
- `line_item text null`
- `official_cost_usd numeric(18,8) not null`
- `internal_cost_usd numeric(18,8) not null`
- `delta_cost_usd numeric(18,8) not null`
- `raw_payload jsonb not null`
- `reconciled_at timestamptz not null default now()`

## 4. Vista/materialized view de agregados

Ejemplos:

- `public.openai_costs_by_tenant_day`
- `public.openai_costs_by_channel_day`
- `public.openai_costs_by_assistant_day`
- `public.openai_costs_by_project_day`

## Instrumentación backend propuesta

## Punto de captura correcto

Persistir telemetría inmediatamente después de cada `responses.create(...)` o de cada iteración del tool loop.

Fuentes exactas disponibles hoy:

- `response.model_dump()` ya se usa
- ahí debe extraerse `usage`
- ya tienes `response_id`, `conversation_id`, `assistant/prompt`, `channel`, `tenant`, `timings`

## Lugares del backend a instrumentar

### 1. `app/assistants/tool_runtime.py`

Es el mejor punto central para el turno principal del modelo.

Agregar persistencia por cada iteración de:

- respuesta inicial
- respuesta posterior a tool call

Ventaja:

- no duplicas lógica en `whatsapp`, `webchat`, `messenger`

### 2. `app/channels/whatsapp/service.py`

Persistir requests auxiliares fuera del tool loop:

- `quality_retry`
- cualquier request directo adicional

### 3. `app/channels/webchat/service.py`

Persistir `quality_retry` y requests directos fuera del loop.

### 4. `app/services/conversation_summary.py`

Persistir consumo del resumen, porque hoy usa OpenAI fuera del flujo principal.

### 5. servicios de embeddings o jobs batch

Ejemplos:

- `catalog_embeddings`
- cualquier job que use embeddings/responses fuera de chat en vivo

## Servicio nuevo recomendado

Crear un servicio único, por ejemplo:

- `backend/app/services/openai_usage_ledger.py`

Responsabilidades:

- recibir contexto de negocio
- extraer `usage`
- resolver pricing vigente
- calcular costo estimado
- persistir en Supabase

API interna sugerida:

- `record_response_usage(...)`
- `record_failed_request(...)`
- `estimate_request_cost(...)`
- `get_api_key_fingerprint(...)`

## Gap a corregir antes de confiar en la segregación

## Aplicar `project_id` realmente al cliente OpenAI

Hoy hay evidencia de que `project_id` se guarda pero no se usa.

Se debe corregir para que `AsyncOpenAI` se cree con el `project` efectivo del tenant cuando exista.

Sin esto:

- la conciliación por proyecto OpenAI no será confiable
- todos los costos pueden terminar mezclados en el proyecto default de la key

## API keys y proyecto

Recomendación:

- el ledger interno debe guardar `openai_project_id`
- también un fingerprint no reversible de la API key efectiva
- nunca guardar la key en claro

## Estrategia de cálculo de costo

## Regla principal

Calcular costo al momento del request usando:

- `usage`
- `model`
- pricing vigente en `openai_pricing_catalog`

## Fórmula base

- input cost = `input_tokens_no_cache / 1_000_000 * input_per_1m_usd`
- cached input cost = `cached_input_tokens / 1_000_000 * cached_input_per_1m_usd`
- output cost = `output_tokens / 1_000_000 * output_per_1m_usd`
- total = suma de componentes

Donde:

- `input_tokens_no_cache = input_tokens - cached_input_tokens`

## Regla de auditoría

No depender solo del costo calculado interno.

Siempre comparar luego con Usage/Costs API oficial, porque:

- puede haber cambios de pricing
- tool billing especial
- retries no instrumentados
- requests fuera del flujo principal

## Modelo de segregación por tenant maestro y tenants clientes

## Regla de ownership

Cada fila de `openai_request_usage` debe pertenecer a un `organizacion_id` del SaaS, aunque use una key/proyecto compartidos del maestro.

### Si tenant usa proyecto dedicado

Guardar:

- `organizacion_id = tenant cliente`
- `openai_project_id = proyecto del tenant`
- `source_tenant_mode = tenant_dedicated`

### Si tenant usa proyecto compartido maestro

Guardar:

- `organizacion_id = tenant cliente`
- `openai_project_id = proyecto maestro compartido`
- `source_tenant_mode = master_shared`

Así el gasto sigue segregado por tenant de negocio, aunque técnicamente comparta proyecto OpenAI.

## Frontend recomendado

Agregar una sección nueva de observabilidad/costos, idealmente en panel admin.

## Vistas sugeridas

### 1. Resumen global OpenAI

- costo hoy
- costo 7d / 30d
- tokens input/output
- costo por modelo
- costo por tenant
- costo por canal

### 2. Costo por tenant

- tabla por tenant
- filtros por rango
- costo total
- tokens
- requests
- costo por conversación
- costo por modelo

### 3. Costo por conversación

- timeline de requests OpenAI
- response_id
- modelo
- tokens
- costo
- latencia
- retries
- fallback

### 4. Conciliación

- internal ledger vs OpenAI official cost
- delta por proyecto/modelo/rango

## Fases de implementación

## Fase 1. Fundaciones mínimas

1. Crear tabla `openai_pricing_catalog`
2. Crear tabla `openai_request_usage`
3. Crear servicio `openai_usage_ledger.py`
4. Instrumentar:
   - `tool_runtime.py`
   - `conversation_summary.py`
   - `quality_retry` de `whatsapp` y `webchat`
5. Guardar costo estimado por request

Resultado esperado:

- ya puedes medir costo por conversación, canal, tenant y asistente

## Fase 2. Segregación correcta por proyecto

1. Corregir cliente OpenAI para usar `project_id` efectivo
2. Confirmar que cada tenant enterprise pueda usar proyecto dedicado
3. Guardar fingerprint de key y `openai_project_id` en el ledger

Resultado esperado:

- conciliación seria por proyecto OpenAI

## Fase 3. Reconciliación oficial

1. Crear job server-side para consultar Usage/Costs API
2. Persistir buckets en `openai_cost_reconciliation`
3. Comparar costo oficial vs ledger interno
4. Alertar deltas anómalos

Resultado esperado:

- auditoría confiable y cierre financiero

## Fase 4. UI operativa

1. Dashboard global OpenAI
2. vista por tenant
3. vista por conversación
4. vista por modelo/proyecto

## Decisiones de diseño recomendadas

1. Persistir siempre el uso bruto por request
- no solo cálculos agregados

2. Persistir también costo estimado ya calculado
- para consultas rápidas

3. Mantener catálogo de precios versionado
- no hardcodear precios dispersos en backend

4. Reconciliar con OpenAI periódicamente
- no asumir que el cálculo interno basta

5. Separar costo de negocio de costo técnico
- `organizacion_id` del SaaS
- `openai_project_id` técnico

6. No depender de `response_id` como única clave de negocio
- usar además `conversation_id`, `message_id`, `channel`, `assistant_ref`

## Gaps actuales que deben quedar explícitos

Hoy tu sistema tiene estos vacíos principales:

- no persiste `usage` por request
- no calcula costo por request
- no tiene ledger de costos OpenAI
- no reconcilia con OpenAI Costs API
- guarda `project_id` por tenant pero no hay evidencia clara de que lo aplique al cliente OpenAI
- no tiene UI de costos por tenant/canal/asistente

## Orden de implementación recomendado

1. Confirmar y corregir uso real de `project_id`
2. Crear ledger `openai_request_usage`
3. Instrumentar requests reales del backend
4. Cargar pricing oficial en `openai_pricing_catalog`
5. Exponer agregados SQL/API
6. Construir dashboards
7. Agregar reconciliación oficial con Usage/Costs API

## Validación inicial completada

- Se generó tráfico controlado de `webchat` después de instrumentar el ledger.
- Se confirmó inserción real en `public.openai_request_usage`.
- Ejemplo validado:
  - `channel`: `webchat`
  - `openai_model`: `gpt-4.1-2025-04-14`
  - `input_tokens`: `3332`
  - `cached_input_tokens`: `2048`
  - `output_tokens`: `38`
  - `estimated_total_cost_usd`: `0.00389600`
- Se corrigió el lookup de pricing para modelos versionados, por ejemplo:
  - `gpt-4.1-2025-04-14` -> `gpt-4.1`
- Quedó evidenciado un primer registro previo con costo `0` por falta de normalización; ese comportamiento ya quedó corregido para tráfico nuevo.
- Validaciones adicionales completadas:
  - `whatsapp` registró `tool_loop_iteration` y `quality_retry` con costo estimado correcto.
  - `summary` registró ejecución real sobre `conversation_summary` con costo estimado correcto.
  - Ejemplos validados:
    - `whatsapp / tool_loop_iteration`: `gpt-5-nano-2025-08-07`, `estimated_total_cost_usd=0.00086615`
    - `whatsapp / quality_retry`: `gpt-5-nano-2025-08-07`, `estimated_total_cost_usd=0.00033731`
    - `summary / summary`: `gpt-4o-mini`, `estimated_total_cost_usd=0.00004845`

## Vistas SQL implementadas

- `public.v_openai_usage_enriched`
  - Base enriquecida con organización, familia de modelo, proyecto normalizado, `pricing_found`, `usage_date` y `usage_month`.
- `public.v_openai_costs_daily`
  - Agregado diario por tenant, canal, feature, proyecto y familia de modelo.
- `public.v_openai_costs_by_conversation`
  - Agregado por conversación para costo total, modelos usados, retries y fallbacks.
- `public.v_openai_costs_by_model`
  - Agregado mensual por tenant/canal/modelo para análisis comparativo de modelos.
- `public.v_openai_costs_by_project`
  - Agregado mensual por tenant/proyecto OpenAI para reconciliación por proyecto.

## Endpoints backend implementados

Tenant actual:
- `GET /api/crm/analytics/openai/costs/daily`
- `GET /api/crm/analytics/openai/costs/conversations`
- `GET /api/crm/analytics/openai/costs/models`
- `GET /api/crm/analytics/openai/costs/projects`
- `GET /api/crm/analytics/openai/costs/assistants`

Master cross-tenant:
- `GET /api/crm/analytics/openai/master/costs/daily`
- `GET /api/crm/analytics/openai/master/costs/conversations`
- `GET /api/crm/analytics/openai/master/costs/models`
- `GET /api/crm/analytics/openai/master/costs/projects`
- `GET /api/crm/analytics/openai/master/costs/assistants`
- `POST /api/crm/analytics/openai/master/catalog/sync`

Notas:
- Los endpoints del tenant actual operan con `user_token` y RLS.
- Los endpoints master usan lectura service-role y exigen `owner/admin` del tenant maestro.

## Backlog priorizado

1. Modo master cross-tenant
   - Ya implementado en primera versión: backend protegido, frontend con alcance `tenant actual` vs `master global` y soporte de filtro por `tenant-context`.
   - Ya implementado además el selector visual explícito de tenant/organización dentro de la pantalla.

2. Desglose por assistant_ref / assistant_kind
   - Ya implementado en primera versión: vista SQL, endpoints backend y tabla frontend.
   - Actualizado además con nombres legibles para proyecto, asistente y conversación.
   - Ya implementados además los filtros dedicados de `assistant_kind` y `project_key` en la pantalla.
   - Pendiente fino: export por assistant.

3. Export CSV
   - Ya implementado en primera versión desde la pantalla de costos.
   - Exporta el dataset visible con los filtros activos para diario, proyectos, modelos, asistentes y conversaciones.

4. Reconciliación con Usage/Costs API de OpenAI
   - Ya implementada en primera versión para `organization/costs`.
   - Persiste buckets diarios oficiales por proyecto y compara contra el ledger interno por día/proyecto.
   - Queda pendiente extender el mismo patrón a `organization/usage/completions` si se requiere reconciliación de tokens y requests oficiales.

5. Alertas de costo o presupuesto
   - Definir umbrales por tenant, proyecto o canal.
   - Disparar alertas cuando el gasto diario/mensual supere presupuesto o cuando cambie anómalamente la latencia/costo por request.

## Avance actual
- `master cross-tenant` ya implementado en primera versión:
  - Backend con rutas protegidas `owner/admin` del tenant maestro.
  - Frontend con selector de alcance `tenant actual` vs `master global`.
  - Soporte para filtrar por `tenant_id` cuando existe contexto de tenant seleccionado.
- `assistant_ref / assistant_kind` ya implementado:
  - vista SQL, endpoints y tabla frontend.
- Nombres legibles ya implementados para:
  - proyecto OpenAI
  - asistente lógico
  - conversación
- Sync de catálogo OpenAI ya implementado:
  - tablas de catálogo locales
  - sincronización manual protegida
  - resolución real de nombres de proyecto vía OpenAI admin API cuando existe `project_id`.
- Reconciliación oficial OpenAI ya implementada en primera versión:
  - tabla `openai_cost_api_buckets`
  - vista `v_openai_cost_reconciliation_daily`
  - sync manual protegido desde backend
  - tabla frontend visible en `master global`

Estado al 2026-03-29:

### Ya implementado

- Se crearon y aplicaron las migraciones SQL:
  - `supabase/migrations/20280429_120000_openai_usage_ledger.sql`
  - `supabase/migrations/20280429_121500_openai_usage_views.sql`
  - `supabase/migrations/20280429_122500_openai_assistant_views.sql`
  - `supabase/migrations/20280429_124500_openai_catalogs.sql`
  - `supabase/migrations/20280429_125500_openai_catalog_enrichment.sql`
- Ya existen en Supabase:
  - `public.openai_pricing_catalog`
  - `public.openai_request_usage`
- Se crearon los servicios backend:
  - `backend/app/services/openai_usage_ledger.py`
  - `backend/app/services/openai_catalog_sync.py`
- El cliente OpenAI ya soporta `project_id` efectivo en runtime:
  - `backend/app/services/openai.py`
- `tenant_runtime` ya expone `project_id` para webchat/whatsapp:
  - `backend/app/services/tenant_runtime.py`
- Ya se instrumentó el guardado de `usage` por request en:
  - `backend/app/assistants/tool_runtime.py`
  - `backend/app/channels/webchat/service.py`
  - `backend/app/channels/whatsapp/service.py`
  - `backend/app/services/conversation_summary.py`
- El backend fue reiniciado y validado:
  - `talia-api.service` activo
  - `GET /api/health` responde `ok`
- El frontend `/settings/openai-costs` ya está operativo para tenant actual y `master global`.

### Qué captura ya el ledger

Para tráfico nuevo, `public.openai_request_usage` ya puede guardar:

- tenant (`organizacion_id`)
- canal
- feature
- `response_id`
- `openai_conversation_id`
- `openai_project_id`
- fingerprint de API key
- modelo
- assistant/prompt lógico
- `input_tokens`
- `cached_input_tokens`
- `output_tokens`
- `reasoning_tokens`
- `total_tokens`
- latencia
- `fallback_used`
- `quality_retry_used`
- `assistant_kind` / `assistant_ref`
- nombre legible de proyecto/asistente/conversación vía vistas enriquecidas

### Pendiente inmediato

- Agregar export CSV.
- Evaluar si conviene llevar el filtro de `assistant_kind` al backend agregado completo o mantenerlo acotado a la vista de asistentes.
- Si se requiere, agregar selector/buscador más robusto de organización para instalaciones con muchos tenants.
- Agregar auditoría de tenants con OpenAI incompleto (`project_id`, `api_key`, canales instrumentados).
- Agregar estado visible de medibilidad/reconciliación por tenant en UI/admin.
- Definir si el runtime solo advierte o también bloquea requests para tenants no medibles.

### Riesgos/observaciones vigentes

- La segregación por `project_id` ya quedó soportada en código, pero depende de que cada tenant realmente tenga configurado su `openai.general.project_id`.
- Los nombres reales de proyecto ya pueden obtenerse desde OpenAI cuando existe `project_id` y `admin key` con `api.management.read`.
- Los prompts `pmpt_...` todavía no tienen una resolución oficial estable por nombre en la integración actual; hoy usan catálogo/alias local.
- Las filas históricas previas a configurar `project_id` seguirán apareciendo como `shared-default` hasta que se haga backfill.
- Ya existe reconciliación con `organization/costs`; sigue pendiente decidir si se amplía a `organization/usage/completions`.
- Ya quedó evidenciado que un tenant puede generar costo interno con `openai_project_id = null`; esto debe tratarse como incidencia de medición, no como caso aceptable.

### Siguiente hito recomendado

1. agregar alertas y presupuestos
2. decidir si se amplía la reconciliación a `organization/usage/completions`
3. evaluar backfill histórico de `shared-default` a proyectos reales cuando aplique
   - Ya aplicado para el histórico del tenant maestro que correspondía a `TALIA`.

## Resultado esperado final

Al terminar este plan, el sistema debe poder responder de forma confiable:

- costo total OpenAI del tenant maestro
- costo total por tenant cliente
- costo por canal (`whatsapp`, `webchat`, `voice`, etc.)
- costo por prompt/asistente/modelo
- costo por conversación y por oportunidad
- diferencia entre costo estimado interno y costo oficial OpenAI

## Criterio de éxito

El plan se considera bien implementado cuando:

- cada request OpenAI relevante deja una fila en `openai_request_usage`
- cada fila tiene `usage`, `model`, `project_id`, `tenant`, `channel` y costo estimado
- existe reconciliación contra OpenAI Costs API
- el panel puede mostrar costos por tenant/canal/asistente/conversación
- es posible separar claramente gasto del tenant maestro y de tenants clientes
