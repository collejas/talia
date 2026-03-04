# Medición inicial post-cambios de latencia

Fecha de medición: 2026-03-04 (UTC)  
Ventana de logs disponible: `2026-03-04T10:14:31Z` a `2026-03-04T21:11:40Z`

## 1) Objetivo

Validar impacto inicial de los cambios implementados en:

1. `inbox/threads` (optimización fallback WhatsApp)
2. `contact-indicadores` (cache backend + cache SQL/RPC)
3. `prospectos/queries` (cache backend)
4. `brevo/webhook` (ACK rápido async)

## 2) Baseline de referencia (diagnóstico)

Fuente: `01_Diagnostico_latencia_app_2026-03-04.md`

- `/api/crm/inbox/threads`: p95 `~4505.63 ms`
- `/api/crm/prospeccion/prospectos/contact-indicadores`: p95 `~2141.59 ms`
- `/api/crm/prospeccion/prospectos/queries`: p95 `~7401.74 ms`
- `/api/crm/prospeccion/contacto/brevo/webhook`: p95 `~12870.37 ms`

## 3) Medición global acumulada (toda la ventana)

Nota: esta vista mezcla periodos antes y después de cambios, por lo que sirve solo como contexto general.

- `/api/crm/inbox/threads`
  - count: `111`
  - p95: `4505.63 ms`
- `/api/crm/prospeccion/prospectos/contact-indicadores`
  - count: `919`
  - p95: `2141.59 ms`
- `/api/crm/prospeccion/prospectos/queries`
  - count: `52`
  - p95: `7401.74 ms`
- `/api/crm/prospeccion/contacto/brevo/webhook`
  - count: `260`
  - p95: `12870.37 ms`

## 4) Medición post-corte técnico (cambios webhook async)

Corte usado: `2026-03-04T21:09:00Z`.

### 4.1 Brevo webhook (comparación directa pre/post)

Antes del corte:

- count: `257`
- avg: `3607.31 ms`
- p50: `1350.88 ms`
- p90: `12447.50 ms`
- p95: `12870.37 ms`
- max: `13500.07 ms`

Después del corte:

- count: `3`
- avg: `3.11 ms`
- p50: `3.50 ms`
- p90/p95: `3.50 ms`
- max: `3.98 ms`

Conclusión inicial:

- El cambio `mode=async` en webhook Brevo reduce drásticamente la latencia HTTP del endpoint.
- Evidencia adicional en logs:
  - `crm.prospeccion.brevo_webhook.async_processed` (eventos procesados en background).

### 4.2 Endpoints críticos post-corte (misma ventana)

Muestra total post-corte: `71 request.completed`.

- `/api/crm/inbox/threads`
  - count: `2`
  - avg: `1275.54 ms`
  - p95: `282.88 ms`
  - max: `2268.2 ms`
- `/api/crm/prospeccion/prospectos/contact-indicadores`
  - count: `0`
- `/api/crm/prospeccion/prospectos/queries`
  - count: `1`
  - avg/p95: `4935.57 ms`
- `/api/crm/prospeccion/contacto/brevo/webhook`
  - count: `3`
  - p95: `3.50 ms`

Interpretación:

- Para `brevo/webhook` sí hay señal clara de mejora.
- Para `inbox/threads`, `contact-indicadores` y `prospectos/queries` la muestra post-corte es insuficiente para declarar mejora estadística.

## 5) Evidencia de cache hits nuevos

- `crm.prospectos.contact_indicadores.cache_hit`: no observado aún en logs de esta ventana.
- `crm.prospectos.queries.cache_hit`: no observado aún en logs de esta ventana.

Esto no implica que el cache no funcione; indica falta de tráfico repetido suficiente (mismo usuario/filtros/IDs) en la ventana medida.

## 6) Estado de validación por cambio

1. Webhook Brevo async:
- Estado: **validado positivamente (impacto alto)**.

2. Optimización Inbox fallback:
- Estado: **implementado, validación estadística pendiente** (muestra post-corte baja).

3. Cache `contact-indicadores` (backend + SQL/RPC):
- Estado: **implementado, validación estadística pendiente**.

4. Cache `/prospectos/queries`:
- Estado: **implementado, validación estadística pendiente**.

## 7) Próxima medición recomendada

Repetir medición con ventana de producción de al menos `4-8 horas` tras despliegue estable, incluyendo:

1. p50/p90/p95 por endpoint crítico.
2. Conteo de `cache_hit` por endpoint.
3. Relación de requests/s para `contact-indicadores` y `queries`.
4. Verificación de que `brevo_webhook.async_failed = 0` (o mínimo y acotado).

## 8) Conclusión

La mejora más contundente ya observable es en `brevo/webhook` (latencia HTTP).  
Para el resto de cambios, se requiere más tráfico post-cambio para confirmar reducción de p95 con significancia operativa.
