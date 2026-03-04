# Medición post-cambios de latencia

Fecha de medición: 2026-03-04 (UTC)  
Último timestamp observado en logs: `2026-03-04T22:32:16.504+00:00`

## 1) Objetivo

Validar impacto de cambios implementados en:

1. `inbox/threads`
2. `contact-indicadores`
3. `prospectos/queries`
4. `brevo/webhook`

## 2) Baseline de referencia (diagnóstico)

Fuente: `01_Diagnostico_latencia_app_2026-03-04.md`

- `/api/crm/inbox/threads`: p95 `4505.63 ms`
- `/api/crm/prospeccion/prospectos/contact-indicadores`: p95 `2141.59 ms`
- `/api/crm/prospeccion/prospectos/queries`: p95 `7401.74 ms`
- `/api/crm/prospeccion/contacto/brevo/webhook`: p95 `12870.37 ms`

## 3) Medición actual (ventana móvil 1 hora)

Fuente: `/var/www/talia/logs/api.log*` con corte `última_hora` respecto al último evento de log.

Muestra global de `request.completed`: `1844` requests.

1. `/api/crm/inbox/threads`
- count: `66`
- avg: `1283.50 ms`
- p50: `1173.63 ms`
- p90: `2146.40 ms`
- p95: `2442.68 ms`
- max: `3042.11 ms`

2. `/api/crm/prospeccion/prospectos/contact-indicadores`
- count: `89`
- avg: `617.47 ms`
- p50: `609.77 ms`
- p90: `1175.15 ms`
- p95: `1180.51 ms`
- max: `1451.64 ms`

3. `/api/crm/prospeccion/prospectos/queries`
- count: `10`
- avg: `2632.15 ms`
- p50: `1567.65 ms`
- p90: `4361.85 ms`
- p95: `4361.85 ms`
- max: `6036.72 ms`

4. `/api/crm/prospeccion/contacto/brevo/webhook`
- count: `15`
- avg: `27.90 ms`
- p50: `4.80 ms`
- p90: `52.31 ms`
- p95: `88.81 ms`
- max: `140.60 ms`

## 4) Comparación vs baseline (p95)

1. `inbox/threads`
- baseline: `4505.63 ms`
- actual: `2442.68 ms`
- mejora: `-45.79%`

2. `contact-indicadores`
- baseline: `2141.59 ms`
- actual: `1180.51 ms`
- mejora: `-44.88%`

3. `prospectos/queries`
- baseline: `7401.74 ms`
- actual: `4361.85 ms`
- mejora: `-41.07%`

4. `brevo/webhook`
- baseline: `12870.37 ms`
- actual: `88.81 ms`
- mejora: `-99.31%`

## 5) Evidencia de cache hits

Ventana: última hora del corte actual.

- `crm.prospectos.contact_indicadores.cache_hit`: `29` eventos.
- `crm.prospectos.queries.cache_hit`: `0` eventos.

Interpretación:

1. `contact-indicadores` sí está reutilizando cache en tráfico real.
2. En `queries`, aún no hay evidencia de `cache_hit` en esta ventana; probable mezcla de filtros distintos o baja repetición exacta de parámetros.

## 6) Lectura operativa

1. Sí hay mejora medible de latencia en los 4 endpoints comparados por p95.
2. La mejora más fuerte sigue siendo `brevo/webhook` (por ACK asíncrono).
3. `inbox/threads` y `contact-indicadores` ya están en un rango mucho más sano para operación interactiva.
4. `prospectos/queries` mejora, pero sigue siendo el foco a seguir para llevarlo de forma consistente por debajo de ~2s p95.

## 7) Riesgos / límites de esta medición

1. `prospectos/queries` tiene muestra pequeña (`count=10`) en esta hora; puede variar mucho con más tráfico.
2. La ventana es corta (1 hora); conviene consolidar con ventana de `4-8 horas` para confirmar estabilidad.
3. La ausencia de `queries.cache_hit` no prueba falla; solo falta repetición exacta suficiente en esta muestra.

## 8) Próxima verificación recomendada

1. Repetir esta medición al cierre de jornada con ventana `4-8 horas`.
2. Reportar además:
- tasa de requests por endpoint (`rps` aproximado)
- distribución por filtros en `prospectos/queries`
- presencia/ausencia de `queries.cache_hit`
3. Si `queries` mantiene p95 > `3000 ms`, priorizar:
- bajar cardinalidad de filtros en frontend
- forzar reutilización de parámetros normalizados
- instrumentar logs de key de cache (hash) para detectar baja repetición.

## 9) Comando usado para medición de endpoints críticos

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
    prospectos_queries:([$recent[]|select(.path_n=="/api/crm/prospeccion/prospectos/queries")] | stats(.)),
    brevo_webhook:([$recent[]|select(.path_n=="/api/crm/prospeccion/contacto/brevo/webhook")] | stats(.))
  }
' /var/www/talia/logs/api.log*
```

## 10) Medición extendida ejecutada (4h y 8h)

Corte de cálculo: `2026-03-04T22:34:37.245+00:00`.

### 10.1 Ventana 4 horas

Muestra global (`request.completed`): `5063`.

1. `/api/crm/inbox/threads`
- count: `211`
- p95: `3448.69 ms`
- vs baseline (`4505.63 ms`): `-23.46%`

2. `/api/crm/prospeccion/prospectos/contact-indicadores`
- count: `287`
- p95: `1998.16 ms`
- vs baseline (`2141.59 ms`): `-6.70%`

3. `/api/crm/prospeccion/prospectos/queries`
- count: `23`
- p95: `6482.06 ms`
- vs baseline (`7401.74 ms`): `-12.42%`

4. `/api/crm/prospeccion/contacto/brevo/webhook`
- count: `64`
- p95: `1522.96 ms`
- vs baseline (`12870.37 ms`): `-88.17%`

Cache hits en 4h:

- `crm.prospectos.contact_indicadores.cache_hit`: `32`
- `crm.prospectos.queries.cache_hit`: `0`

### 10.2 Ventana 8 horas

Muestra global (`request.completed`): `6498`.

1. `/api/crm/inbox/threads`
- count: `228`
- p95: `3448.69 ms`
- vs baseline (`4505.63 ms`): `-23.46%`

2. `/api/crm/prospeccion/prospectos/contact-indicadores`
- count: `757`
- p95: `2187.10 ms`
- vs baseline (`2141.59 ms`): `+2.13%` (ligeramente peor)

3. `/api/crm/prospeccion/prospectos/queries`
- count: `49`
- p95: `7252.55 ms`
- vs baseline (`7401.74 ms`): `-2.02%`

4. `/api/crm/prospeccion/contacto/brevo/webhook`
- count: `239`
- p95: `12871.68 ms`
- vs baseline (`12870.37 ms`): `+0.01%` (equivalente, mezcla pre/post cambio)

Cache hits en 8h:

- `crm.prospectos.contact_indicadores.cache_hit`: `32`
- `crm.prospectos.queries.cache_hit`: `0`

### 10.3 Interpretación operativa de estabilidad

1. `inbox/threads` mantiene mejora consistente en ventanas largas (p95 ~3.45s vs ~4.51s baseline).
2. `contact-indicadores` mejora fuerte en ventana corta (1h), pero en 8h se diluye por mezcla de periodos y cargas.
3. `prospectos/queries` sigue siendo el endpoint más inestable y de mayor p95; aún sin evidencia de `cache_hit`.
4. `brevo/webhook` muestra mejora extrema en ventana corta post-cambio, pero en 8h vuelve al baseline porque integra tráfico previo al corte asíncrono.

### 10.4 Decisión de siguiente foco

Prioridad inmediata: `prospectos/queries`.

Acciones recomendadas para el siguiente ciclo:

1. Instrumentar log de hash de cache key en endpoint `queries` para confirmar repetición real de filtros.
2. Reducir cardinalidad de filtros en frontend (normalización estricta de parámetros enviados).
3. Forzar reutilización de parámetros cuando no cambie el scope funcional (evitar misses por variación cosmética).

## 11) Comandos para validar `queries` cache (hit/miss/store)

1. Ver secuencia de eventos de cache para `prospectos/queries`:

```bash
cat /var/www/talia/logs/api.log* | jq -R '
  fromjson?
  | select(type=="object" and (
      .message=="crm.prospectos.queries.cache_miss" or
      .message=="crm.prospectos.queries.cache_store" or
      .message=="crm.prospectos.queries.cache_hit"
    ))
  | [.timestamp,.message,.cache_key,.query_signature,.query_filters,.fuente,.has_date_from,.has_date_to,.cache_entries,.queries_rows,.activities_rows]
  | @tsv
' | tail -n 200
```

2. Contar por tipo de evento (hit/miss/store):

```bash
cat /var/www/talia/logs/api.log* | jq -R '
  fromjson?
  | select(type=="object" and (.message|startswith("crm.prospectos.queries.cache_")))
  | .message
' | sort | uniq -c | sort -nr
```

## 12) Ajuste aplicado después de esta medición

Con evidencia de logs:

1. mismas `cache_key` repetidas aproximadamente cada `96-98s`.
2. patrón observado: `cache_miss -> cache_store` sin `cache_hit`, por expiración previa.

Se aplicó ajuste en backend:

- `PROSPECTO_QUERIES_CACHE_TTL_SECONDS`: `30s -> 180s -> 600s`.

Objetivo:

- capturar repeticiones reales de filtros en ciclos de refresh de la UI y aumentar hit-rate de `prospectos/queries`.
