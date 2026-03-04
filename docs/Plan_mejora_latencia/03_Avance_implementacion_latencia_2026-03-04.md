# Avance de implementación del plan de latencia

Fecha de corte: 2026-03-04 (UTC)  
Referencia del plan: `docs/Plan_mejora_latencia/02_Plan_ejecucion_latencia_2026-03-04.md`

## 1) Estado ejecutivo

Avance implementado en código:

1. **Día 1 (quick wins frontend):** Completado.
2. **Día 2 (Inbox threads backend):** Parcial completado (optimización de fallback por teléfono).
3. **Día 3 (índices lookup JSON):** Preparado (migración creada, pendiente aplicar).
4. **Día 4 en adelante:** Pendiente.

Actualización adicional (mismo día):

1. **Día 4 (versión incremental):** Parcial completado con cache backend para `contact-indicadores`.
2. **Día 3 (índices):** Completado en base de datos (migración aplicada vía Supabase MCP).
3. **Día 4 (versión estructural):** Completado con cache persistente SQL + RPC cacheado en repositorio.
4. **Día 5 (versión incremental):** Parcial completado con cache backend para endpoint `/prospectos/queries`.
5. **Día 6 (versión incremental):** Parcial completado con ACK rápido en webhook Brevo.
6. **Día 5 (versión estructural):** Completado con RPC + índices para `prospectos/queries`.

## 2) Cambios completados

## 2.1 Prospección frontend (carga y frecuencia)

Archivo: `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx`

Cambios aplicados:

1. Límite inicial de tabla reducido:
   - `limit` inicial de `500` a `200`.
2. Debounce + deduplicación de metadata:
   - debounce `350ms` para `loadQueryOptions`.
   - debounce `350ms` para `loadActivitiesForQueries`.
   - deduplicación por `scopeKey` para evitar relanzamientos idénticos.
3. Carga de indicadores acotada:
   - `contact-indicadores` solo en modo `prospectos`.
   - se limita a un máximo de `120` IDs por ciclo.
   - prioriza incluir seleccionados dentro del tope.

Constantes agregadas:

- `PROSPECTOS_DEFAULT_LIMIT = 200`
- `PROSPECTOS_METADATA_DEBOUNCE_MS = 350`
- `PROSPECTOS_INDICATORS_MAX_IDS = 120`

## 2.2 Prospección frontend (tamaños de página)

Archivo: `frontend/panel/src/app/prospeccion/denue-busqueda/denue-busqueda-view.tsx`

1. `LIST_PAGE_SIZE`: `5000 -> 1000`.
2. Request de resultados para mapa/lista: `limit: 5000 -> 1000`.

Archivo: `frontend/panel/src/app/prospeccion/google-busqueda/google-busqueda-view.tsx`

1. `LIST_PAGE_SIZE`: `5000 -> 1000`.
2. `MAP_RESULTS_LIMIT`: `5000 -> 1000`.

## 2.3 Inbox backend (fallback por teléfono)

Archivo: `backend/app/api/routes/crm.py`

Cambios aplicados:

1. Nuevo cache TTL en memoria para hints de envío por teléfono:
   - TTL: `60s` (`INBOX_THREADS_WHATSAPP_HINT_CACHE_TTL_SECONDS`).
2. Resolución de fallback paralela con concurrencia controlada:
   - `INBOX_THREADS_WHATSAPP_HINT_LOOKUP_CONCURRENCY = 8`.
   - evita `await` secuencial por cada teléfono en `get_inbox_threads`.
3. Flujo optimizado:
   - detecta teléfonos que requieren fallback.
   - primero intenta cache local.
   - para faltantes, resuelve en paralelo (`asyncio.gather + semaphore`).
   - persiste hint en cache y aplica merge en threads.

## 2.4 SQL (preparación de Día 3)

Se creó migración:

- `supabase/migrations/20280424_120000_prospeccion_contacto_envio_lookup_indexes.sql`

Contenido:

1. Índice por teléfono JSON + canal + fecha:
   - `prospeccion_contacto_envio_detalle_phone_canal_creado_idx`
2. Índice por email JSON normalizado + canal + fecha:
   - `prospeccion_contacto_envio_detalle_email_canal_creado_idx`

Estado: **pendiente aplicar en base de datos**.

Actualización:

- Migración aplicada exitosamente en Supabase MCP (`success: true`).
- Índices verificados en `pg_indexes`:
  - `prospeccion_contacto_envio_detalle_phone_canal_creado_idx`
  - `prospeccion_contacto_envio_detalle_email_canal_creado_idx`

## 2.5 Backend `contact-indicadores` (cache incremental)

Archivo: `backend/app/api/routes/crm.py`

Cambios aplicados:

1. Se agregó cache read-through para endpoint:
   - `CONTACT_INDICATORS_CACHE_TTL_SECONDS = 20`
   - `CONTACT_INDICATORS_CACHE_MAX_ENTRIES = 1024`
2. Se agregó key hash por usuario + lista de prospectos:
   - `_build_contact_indicators_cache_key(...)`
3. Se normaliza la entrada:
   - IDs deduplicados y ordenados (`normalized_ids`) antes de consultar.
4. Se agregó log de `cache_hit`:
   - `crm.prospectos.contact_indicadores.cache_hit`

Beneficio esperado:

- bajar presión sobre la vista agregada en lecturas repetidas de la UI en ventanas cortas.

## 2.6 Corrección de cache de WhatsApp hints

Archivo: `backend/app/api/routes/crm.py`

Corrección aplicada:

1. Se corrigió la poda de entradas para que aplique sobre el cache correcto (`_INBOX_THREADS_WHATSAPP_HINT_CACHE`).
2. Se agregó límite explícito:
   - `INBOX_THREADS_WHATSAPP_HINT_CACHE_MAX_ENTRIES = 2048`.

## 2.7 Cache persistente SQL para `contact-indicadores` (estructural)

Se creó y aplicó migración:

- `supabase/migrations/20280424_130000_prospeccion_contacto_indicadores_cache.sql`

Incluye:

1. Tabla cache:
   - `public.prospeccion_prospecto_contacto_stats_cache`
   - PK compuesta: `(organizacion_id, prospecto_id)`
   - índice por actualización: `prospeccion_prospecto_contacto_stats_cache_updated_idx`
2. RLS:
   - habilitado en tabla cache.
   - policy de lectura por tenant (`usuario_organizacion_id(auth.uid())`).
3. Función RPC:
   - `public.prospeccion_contacto_indicadores_cached(uuid[], integer default 120)`
   - `security definer`
   - refresco incremental por `stale/missing` IDs y retorno ordenado.
4. Grants:
   - `authenticated`
   - `service_role`

Estado: **aplicado exitosamente en Supabase MCP** (`success: true`).

## 2.8 Repositorio backend: consumo de RPC cacheado

Archivo: `backend/app/repositories/crm.py`

Cambio aplicado:

1. `list_prospecto_contact_indicators(...)` ahora intenta primero:
   - `POST /rest/v1/rpc/prospeccion_contacto_indicadores_cached`
2. Si falla RPC (compatibilidad/despliegue parcial), hace fallback automático a:
   - `GET /rest/v1/prospeccion_prospecto_contacto_stats` (comportamiento previo)

Beneficio:

- transición segura sin downtime ni ruptura funcional.

## 2.9 Endpoint `/prospeccion/prospectos/queries` (cache backend)

Archivo: `backend/app/api/routes/crm.py`

Cambios aplicados:

1. Cache read-through para respuesta completa del endpoint:
   - `PROSPECTO_QUERIES_CACHE_TTL_SECONDS = 30`
   - `PROSPECTO_QUERIES_CACHE_MAX_ENTRIES = 512`
2. Key por:
   - usuario
   - `query_filters` normalizados
   - `fuente`
   - `date_from` / `date_to`
3. Normalización de entrada:
   - dedupe + sort de `query_filters` antes de consultar repositorio.
4. Log de hit:
   - `crm.prospectos.queries.cache_hit`

Beneficio esperado:

- reducir repeticiones de scans costosos en ráfagas de filtros equivalentes de UI.

## 2.11 `prospectos/queries` versión estructural (RPC + índices)

Archivos:

- `backend/app/api/routes/crm.py`
- `backend/app/repositories/crm.py`
- `supabase/migrations/20280424_140000_prospeccion_queries_resumen_rpc.sql`

Cambios aplicados:

1. Endpoint `GET /crm/prospeccion/prospectos/queries` con key de cache más estable:
   - se elimina dependencia de token efímero en cache key.
   - se usa `organizacion_id` para favorecer reuso de cache por tenant.
2. Repositorio con fast path SQL:
   - `POST /rest/v1/rpc/prospeccion_queries_resumen`
   - `POST /rest/v1/rpc/prospeccion_activities_resumen`
   - fallback automático al flujo legado si RPC falla.
3. Optimización en DB:
   - índices por tenant/fecha/fuente.
   - índice de expresión para query normalizada desde metadata.
4. RPCs en Postgres:
   - `public.prospeccion_queries_resumen(text[], text, timestamptz, timestamptz)`
   - `public.prospeccion_activities_resumen(text[], text, timestamptz, timestamptz)`
   - ambas con `security definer`, grants a `authenticated` y `service_role`.

Estado:

- **aplicado exitosamente en Supabase MCP** (`success: true`).

## 2.10 Webhook Brevo con modo asíncrono por defecto

Archivo: `backend/app/api/routes/crm.py`

Cambio aplicado:

1. Endpoint `POST /prospeccion/contacto/brevo/webhook` ahora soporta:
   - `mode=async` (default): responde rápido y procesa en `BackgroundTasks`.
   - `mode=sync`: conserva comportamiento previo para pruebas/diagnóstico.
2. Se añadió logging para el flujo asíncrono:
   - `crm.prospeccion.brevo_webhook.async_processed`
   - `crm.prospeccion.brevo_webhook.async_failed`

Beneficio esperado:

- bajar latencia p95 del webhook al sacar el procesamiento pesado del tiempo de respuesta HTTP.

## 3) Validaciones ejecutadas

## 3.1 Frontend

1. TypeScript check:
   - comando: `npx tsc --noEmit`
   - resultado: OK
2. ESLint específico en archivos modificados:
   - comando: `npx eslint <archivos>`
   - resultado: OK
3. React Doctor:
   - comando: `npx -y react-doctor@latest . --verbose --diff`
   - resultado: sin issues detectados en cambios, pero lint interno (`oxlint`) falló de forma no fatal.

## 3.2 Backend

1. Compilación de sintaxis Python:
   - comando: `python3 -m py_compile backend/app/api/routes/crm.py`
   - resultado: OK

2. Verificación de índices en DB:
   - consulta a `pg_indexes` para tabla `prospeccion_contacto_envio`
   - resultado: OK (índices nuevos presentes)

3. Verificación de función cacheada en DB:
   - consulta a `pg_proc` para `prospeccion_contacto_indicadores_cached`
   - resultado: OK (`prosecdef = true`)

4. Compilación Python tras cambios adicionales en cache de endpoint `queries`:
   - comando: `python3 -m py_compile backend/app/api/routes/crm.py backend/app/repositories/crm.py`
   - resultado: OK

5. Compilación Python tras cambio de webhook Brevo async:
   - comando: `python3 -m py_compile backend/app/api/routes/crm.py backend/app/repositories/crm.py`
   - resultado: OK
6. Verificación DB de `prospectos/queries` estructural:
   - `pg_proc`: funciones `prospeccion_queries_resumen` y `prospeccion_activities_resumen` presentes con `prosecdef=true`.
   - `pg_indexes`: índices nuevos de `public.prospeccion_prospectos` presentes.
7. Smoke test funcional de RPC:
   - ejecución con `request.jwt.claim.sub` de usuario real.
   - resultado: retorno de filas `{value,label,count,created_at}` correcto.

## 4) Estado de despliegue

- Cambios **implementados localmente** en workspace.
- Migraciones SQL de `contact-indicadores` y `prospectos/queries` **aplicadas** en base de datos (Supabase MCP).
- Se mantiene pendiente confirmar despliegue/restart de backend en ambiente operativo para observar efecto completo.

## 5) Impacto esperado (a verificar post-deploy)

1. Menor frecuencia de llamadas costosas a:
   - `/api/crm/prospeccion/prospectos/queries`
   - `/api/crm/prospeccion/prospectos/contact-indicadores`
2. Menor costo por request en `/api/crm/inbox/threads` al evitar fallback secuencial por teléfono.
3. Menor carga por request en vistas Google/DENUE por reducción de page size.

## 6) Pendientes inmediatos

1. Medir baseline vs post-cambio en ventana real (p50/p90/p95 por endpoint crítico).
2. Confirmar restart/deploy backend para activar fast path RPC en tráfico real.
3. Ajustar TTLs de cache (`contact-indicadores` / `queries`) según patrón real de uso.
4. Evaluar invalidación activa de cache en eventos de alta escritura (contacto/envíos) si se observa desfase.
5. Evaluar mover `BackgroundTasks` a cola persistente (tabla + worker) para robustez ante reinicios.

## 7) Archivos modificados en esta iteración

1. `backend/app/api/routes/crm.py`
2. `backend/app/repositories/crm.py`
3. `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx`
4. `frontend/panel/src/app/prospeccion/denue-busqueda/denue-busqueda-view.tsx`
5. `frontend/panel/src/app/prospeccion/google-busqueda/google-busqueda-view.tsx`
6. `supabase/migrations/20280424_120000_prospeccion_contacto_envio_lookup_indexes.sql`
7. `supabase/migrations/20280424_130000_prospeccion_contacto_indicadores_cache.sql` (nuevo)
8. `supabase/migrations/20280424_140000_prospeccion_queries_resumen_rpc.sql` (nuevo)

## 8) Nota operativa

Este avance documenta implementación técnica previa a despliegue.  
La verificación de cumplimiento de metas p95 del plan requiere captura post-deploy durante tráfico real.

## 9) Comandos operativos para revisar latencias

1. Métrica por endpoint en la última hora (`inbox/threads`, `contact-indicadores`, `prospectos/queries`):

```bash
jq -s '
  def norm: gsub("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";":id");
  def to_epoch: (sub("\\+00:00$";"Z") | sub("\\.[0-9]+Z$";"Z") | fromdateiso8601);
  [.[] | select(.message=="request.completed" and (.duration_ms|type=="number")) | . + {path_n:(.path|norm)}] as $rows |
  ($rows | map(.timestamp) | sort | last) as $last |
  (($last | to_epoch) - 3600) as $cutoff |
  [$rows[] | select((.timestamp|to_epoch) >= $cutoff)] as $recent |
  def pct($arr;$p): ($arr|sort)|.[((($arr|length)-1)*$p|floor)];
  def stats($arr): if ($arr|length)==0 then {count:0} else {
    count:($arr|length),
    avg_ms:(($arr|map(.duration_ms)|add)/($arr|length)),
    p50_ms:(pct(($arr|map(.duration_ms));0.50)),
    p90_ms:(pct(($arr|map(.duration_ms));0.90)),
    p95_ms:(pct(($arr|map(.duration_ms));0.95)),
    max_ms:(($arr|map(.duration_ms)|max))
  } end;
  {
    window_last_timestamp:$last,
    sample_size:($recent|length),
    inbox_threads:([$recent[]|select(.path_n=="/api/crm/inbox/threads")] | stats(.)),
    contact_indicadores:([$recent[]|select(.path_n=="/api/crm/prospeccion/prospectos/contact-indicadores")] | stats(.)),
    prospectos_queries:([$recent[]|select(.path_n=="/api/crm/prospeccion/prospectos/queries")] | stats(.))
  }
' /var/www/talia/logs/api.log*
```

2. Verificación de cache hits en logs:

```bash
cat /var/www/talia/logs/api.log* | jq -R 'fromjson? | select(type=="object" and (.message=="crm.prospectos.contact_indicadores.cache_hit" or .message=="crm.prospectos.queries.cache_hit")) | [.timestamp,.message,.rows,.requested_ids,.query_filters] | @tsv'
```
