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

## 4) Estado de despliegue

- Cambios **implementados localmente** en workspace.
- No se ha registrado aún despliegue productivo dentro de este avance.
- La migración SQL está creada pero no aplicada.

## 5) Impacto esperado (a verificar post-deploy)

1. Menor frecuencia de llamadas costosas a:
   - `/api/crm/prospeccion/prospectos/queries`
   - `/api/crm/prospeccion/prospectos/contact-indicadores`
2. Menor costo por request en `/api/crm/inbox/threads` al evitar fallback secuencial por teléfono.
3. Menor carga por request en vistas Google/DENUE por reducción de page size.

## 6) Pendientes inmediatos

1. Medir baseline vs post-cambio en ventana real (p50/p90/p95 por endpoint crítico).
2. Ejecutar siguiente bloque del plan:
   - Día 4: cache/preagregado de `contact-indicadores`.

## 7) Archivos modificados en esta iteración

1. `backend/app/api/routes/crm.py`
2. `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx`
3. `frontend/panel/src/app/prospeccion/denue-busqueda/denue-busqueda-view.tsx`
4. `frontend/panel/src/app/prospeccion/google-busqueda/google-busqueda-view.tsx`
5. `supabase/migrations/20280424_120000_prospeccion_contacto_envio_lookup_indexes.sql` (nuevo)

## 8) Nota operativa

Este avance documenta implementación técnica previa a despliegue.  
La verificación de cumplimiento de metas p95 del plan requiere captura post-deploy durante tráfico real.
