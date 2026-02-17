# DENUE: diseño, estado actual y plan (Talia)

Documento vivo para la vista `prospeccion/denue-busqueda` (panel) y su integración con:
- API DENUE (INEGI)
- Backend (FastAPI) en `backend/app`
- Supabase (PostgREST + RPC)

## 1) Estado actual (implementado)

### Búsqueda
- **Búsqueda normal (radio)**: usa DENUE `Buscar` (palabra clave + centro + radio).
- **Búsqueda avanzada** (modal “Búsqueda avanzada”):
  - Permite ejecutar sin “palabra clave o giro” (ya no fuerza `todos`).
  - Permite filtros por:
    - **Actividad económica** (SCIAN) con selección múltiple.
    - **Tamaño de establecimiento** (estratos 1..7) con selección múltiple.
    - **Área geográfica** (estados/municipios) con selección múltiple.
  - Modos soportados:
    - `entidad` → DENUE `BuscarEntidad` (requiere texto + estados).
    - `area_act` → DENUE `BuscarAreaAct` (actividad + geo opcional + texto opcional).
    - `area_act_estr` → DENUE `BuscarAreaActEstr` (actividad + estrato + geo opcional + texto opcional).
  - **Combinaciones**: cuando hay múltiples actividades/geo/estratos, el backend ejecuta el producto cartesiano con un **límite de 20 combinaciones** para evitar consultas explosivas.

### Resultados (almacenados)
- “Búsquedas recientes” se muestra como **tabla con scroll** (en lugar de tarjetas):
  - Columnas: `Búsqueda / App`, `Registros`, `Radio`, `Estado / Municipio`, `Fecha`, `Acciones`.
  - Los **códigos** se resuelven a **nombres** (estado/municipio + SCIAN) y el campo muestra tooltip con el listado completo cuando hay múltiples.
- Los filtros de resultados se aplican **sobre el total** de la búsqueda (server-side vía RPC), no sólo sobre la página visible.
- Se agregaron filtros **Estado** y **Municipio** (select “Todos”, cascada Estado→Municipio).

### Mapa
- El mapa consume un endpoint por **viewport (bbox)** y regresa **puntos o clusters**.
- Se implementó:
  - `fitBounds` usando un endpoint de `bounds` (centra/encuadra resultados).
  - Clusters con el **total dentro del círculo** y **colores por volumen** (estilo similar a Google Maps).
  - Manejo de resize (`invalidateSize`) para evitar “zona gris/corte” al redimensionar.
- Tooltip de marcadores:
  - Muestra **todos los campos útiles** del registro en múltiples líneas.
  - Excluye campos de **ID** (últimos dos), y excluye **Distancia** y **Maps**.

## 2) Arquitectura (end-to-end)

### Panel (Next.js)
- La UI llama a rutas internas `GET /api/prospeccion/denue/...` (Next) que **proxyean** al backend.
- Rutas agregadas (antes faltaban y causaban `404` y reintentos infinitos):
  - `frontend/panel/src/app/api/prospeccion/denue/resultados/map/route.ts`
  - `frontend/panel/src/app/api/prospeccion/denue/resultados/bounds/route.ts`
  - `frontend/panel/src/app/api/prospeccion/denue/actividades/route.ts`

### Backend (FastAPI)
Rutas principales (prefijo real del backend: `/crm`):
- `POST  /crm/prospeccion/denue/busquedas` (ejecuta búsqueda y guarda resultados)
- `GET   /crm/prospeccion/denue/busquedas` (historial)
- `DELETE /crm/prospeccion/denue/busquedas/{busqueda_id}`
- `GET   /crm/prospeccion/denue/resultados` (lista paginada + **total exacto** via RPC)
- `GET   /crm/prospeccion/denue/resultados/map` (bbox → puntos/clusters)
- `GET   /crm/prospeccion/denue/resultados/bounds` (extent para `fitBounds`)
- `GET   /crm/prospeccion/denue/actividades` (faceta de actividades para filtros)
- `GET   /crm/prospeccion/denue/catalogos` (catálogos SCIAN + geo)

### Supabase (RPC)
- `crear_busqueda` (crea registro en `busquedas`)
- `upsert_resultados_lote` (inserta/actualiza resultados en `resultados`)
- `denue_resultados_list` (lista con filtros globales + `total_count`)
- `denue_resultados_map` (bbox + clustering)
- `denue_resultados_bounds` (min/max lat/lng + `total_count`)
- `denue_resultados_actividades` (actividades distintas con búsqueda)

Parámetros agregados para filtros geo en resultados almacenados:
- `p_geo_estado` (2 dígitos, `"01"`..`"32"`, o `null`)
- `p_geo_municipio` (3 dígitos, `"001"`.., o `null`)

Nota: el geo se obtiene de `AreaGeo` dentro de `resultados.raw` (DENUE), por ejemplo `010010001` (estado+municipio+localidad).

## 3) Detalles de comportamiento (búsqueda avanzada)

### 3.1 “Área act” y “Área act + estrato”
- Para `BuscarAreaAct` / `BuscarAreaActEstr`, la API DENUE recibe **Entidad** (2 dígitos) y **Municipio** (3 dígitos).
- Cuando el usuario selecciona múltiples estados/municipios, el backend genera targets `[(estado, municipio|None), ...]`.
- Si el usuario elige **Municipios**, se usa (estado + municipio).
- Si el usuario elige sólo **Estados**, se usa (estado + municipio=0) para “todos los municipios”.
- Si no elige geo, se usa entidad/municipio “todo el país” (según reglas de la API DENUE).

### 3.2 Límite de combinaciones (20)
El backend limita el total de combinaciones para proteger:
- Tiempo total de ejecución
- Costo/volumen de datos a insertar
- Riesgo de timeout en DB

Si el usuario selecciona más, se recorta y se registra en logs como `denue.combo_limit_reached`.

## 4) Filtros de resultados (globales)

### 4.1 Por qué los filtros deben ser server-side
Si una búsqueda tiene miles de resultados:
- Filtrar sólo “lo paginado” distorsiona totales, clusters y bounds.
- El mapa debe representar el subconjunto filtrado (no sólo lo visible).

Por eso los endpoints `resultados`, `map`, `bounds`, `actividades` aceptan los mismos filtros y los aplican en SQL/RPC.

### 4.2 Filtros disponibles
- Texto `q` (busca en display/actividad/dirección)
- Presencia de contacto: `phone_present`, `email_present`, `website_present`
- Estrato agrupado `estrato_group`
- Actividades (lista) `actividades`
- Geo: `geo_estado`, `geo_municipio`

## 5) Observabilidad y troubleshooting

### 5.1 Logs
- `logs/busquedas/busquedas.log`: progreso por lotes DENUE (`registro_inicial/final`, `batch_processed`, `search_failed`).
- `logs/api.log`: errores de Supabase/PostgREST (por ejemplo 500 en RPC).

### 5.2 Errores comunes
- `denue_http_404`: la ruta proxy del panel no existe o el backendPath no coincide.
- `denue_invalid_response`: la respuesta no tiene el JSON esperado.
- Supabase `57014 canceling statement due to statement timeout`:
  - Significa que Postgres canceló una consulta/función por exceder `statement_timeout`.

## 6) Rendimiento: evitar timeouts al guardar resultados

### 6.1 Síntoma
En búsquedas grandes (por ejemplo “todo el país”), al insertar resultados:
- La RPC `upsert_resultados_lote` puede tardar demasiado y Supabase responde 500 con `57014`.

### 6.2 Mitigación aplicada
- `upsert_resultados_lote` se ajustó para ser **set-based** (un `INSERT ... SELECT ... ON CONFLICT`) en vez de insertar fila por fila.
- Se deduplican items dentro del mismo lote para evitar conflictos dobles en el mismo `ON CONFLICT`.

### 6.3 Mitigaciones adicionales recomendadas
- Reducir `denue_batch_size` (menos filas por lote) si el tenant está haciendo consultas masivas.
- En el worker async, insertar resultados en **chunks** (por ejemplo 200→100→50) y hacer “adaptive split” automático cuando Supabase regrese `57014 statement timeout`.
- Agregar “confirmación previa” usando `Cuantificar` (DENUE) para estimar total antes de ejecutar.
- Implementar procesamiento **asíncrono** (siguiente sección) para evitar que la request HTTP viva minutos.

## 7) Plan de implementación asíncrona (DENUE)

Objetivo: que `POST /crm/prospeccion/denue/busquedas` no ejecute toda la búsqueda dentro de la request, sino que:
1) cree la `busqueda`
2) encole un “job”
3) responda inmediatamente
4) un worker procese lotes y actualice progreso/estado

### 7.1 Beneficios
- Evita timeouts de Nginx/Next/cliente por requests largas.
- Permite **progreso**, **cancelación**, **reintentos**, y control de concurrencia.
- Aísla los picos (múltiples usuarios ejecutando búsquedas masivas).
- Permite reanudar desde el último lote insertado si falla.

### 7.2 Requisitos de infraestructura (tu caso)
- El servidor donde corre el backend/panel **no requiere hardware especial** para “async”; basta con:
  - poder ejecutar un proceso adicional (worker) y mantenerlo vivo (systemd).
  - CPU/RAM afectan **velocidad** y **concurrencia**, no la viabilidad.
- Aunque Supabase está en otro servidor, el worker sólo necesita conectividad HTTP hacia Supabase/PostgREST y hacia DENUE.

Con tu instancia (2 vCPU / 2 GB RAM) es viable si se limita concurrencia (por ejemplo 1 job a la vez) y se hace batching.

### 7.3 Diseño propuesto (cola en Supabase)
Implementado (fase 1):
- Tabla `public.prospeccion_denue_jobs` (Supabase) con:
  - `id uuid`
  - `organizacion_id uuid`
  - `busqueda_id uuid`
  - `status text` (`pending|running|completed|failed|canceled`)
  - `params jsonb` (payload de la búsqueda)
  - `progress jsonb` (por ejemplo `{"batches":3,"registro_inicial":2001,"upserted":...}`)
  - `error text`
  - `created_at`, `started_at`, `finished_at`, `duration_ms`
  - Migración: `supabase/migrations/20280217_120000_prospeccion_denue_jobs.sql` + `supabase/migrations/20280217_120100_prospeccion_denue_jobs_grants.sql`

Ejecución:
- En fase 1, el job se ejecuta en background (async task) dentro del backend al encolarse; el estado/progreso se persiste en Supabase.
- Fase 2 (opcional): worker dedicado con “claim” atómico para reintentos/reanudación post-restart.

### 7.4 Cambios en API (backend)
- `POST /crm/prospeccion/denue/busquedas`:
  - modo “async” (flag `async_mode=true` en payload)
  - crea la búsqueda (`crear_busqueda`) y el job (`prospeccion_denue_jobs`)
  - responde `{ ok:true, busqueda_id, job_id, status:'queued' }`
- `GET /crm/prospeccion/denue/jobs/{job_id}`:
  - devuelve estado + progreso + errores
- `POST /crm/prospeccion/denue/jobs/{job_id}/cancel`:
  - marca `canceled` (worker lo respeta entre lotes)

### 7.5 Worker (systemd)
Fase 1 (implementada):
- Job manager `DENUE_SEARCH_JOB_MANAGER` (backend) ejecuta el trabajo en background y actualiza `prospeccion_denue_jobs` y `busquedas.meta`.

Fase 2 (recomendada para máxima resiliencia):
- Servicio `talia-denue-worker.service`:
  - loop: claim job → procesar en batches → upsert → actualizar progreso/total → finalizar.
  - agrega reintentos y permite continuar jobs “huérfanos” si el backend se reinicia.

### 7.6 Estrategia de reintentos
- Reintentar:
  - errores temporales de red (DENUE/Supabase)
  - 5xx de Supabase (incluye `57014` si se ajusta batch size)
- Backoff exponencial con jitter.
- Marcar `failed` con `error` cuando exceda reintentos.

### 7.7 Idempotencia y consistencia
- El worker debe poder reiniciarse sin duplicar:
  - usar `upsert_resultados_lote` (ON CONFLICT) y una clave estable (`fuente + busqueda_id + clee/id`).
- Guardar en `progress` el último `registro_inicial` procesado para reanudar.

### 7.8 UI (panel)
- Al crear búsqueda async:
  - mostrar estado `queued/running` y progreso.
  - permitir “refrescar” y “cancelar”.
- La tabla de “Búsquedas recientes” puede mostrar `status` en `meta.status` o en un campo extra.

## 8) Referencias internas (código)
- Backend rutas DENUE: `backend/app/api/routes/crm.py`
- Cliente DENUE: `backend/app/services/denue.py`
- RPC wrapper: `backend/app/repositories/crm.py`
- Panel DENUE view: `frontend/panel/src/app/prospeccion/denue-busqueda/denue-busqueda-view.tsx`
- Cliente panel DENUE: `frontend/panel/src/lib/prospeccion/denue-client.ts`
- Mapa: `frontend/panel/src/app/prospeccion/google-busqueda/google-results-map.tsx`
