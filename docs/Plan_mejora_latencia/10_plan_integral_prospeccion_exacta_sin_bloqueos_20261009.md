# Plan integral de Prospección: datos exactos sin bloquear la interfaz

Fecha: 2026-10-09 (UTC)  
Estado: **En implementación; Fase A y cola de Fase C aplicadas**

## 1. Objetivo

La vista `/prospeccion/prospectos` debe entregar simultáneamente:

- Datos correctos y consistentes entre resumen, filtros, paginación y selección.
- Respuesta rápida para la navegación normal.
- Aislamiento entre tenants y entre tráfico interactivo y procesos pesados.
- Cero `502` causados por cálculos secundarios.
- Ningún cálculo histórico largo dentro de una petición del usuario.

La meta no es ocultar la latencia con un conteo aproximado. La meta es mover
los cálculos costosos fuera del camino crítico y servir resultados exactos desde
estructuras preparadas para lectura.

## 2. Incidentes que originan el plan

### 2.1 Conteo del listado diferente al resumen

El resumen superior obtiene un total exacto de `31,197` prospectos. El listado
obtuvo `30,459` porque solicitó `count=planned`, que es una estimación de
Postgres, no el total real.

La diferencia no representa pérdida de datos. Es una inconsistencia de contrato:
dos componentes presentan el mismo concepto con fuentes de conteo distintas.

### 2.2 Refresh histórico dentro de navegación

Cuando no existía un snapshot de atribución, la API ejecutaba
`prospeccion_campana_atribucion_cache_refresh` dentro de la petición. Esa
función recorría envíos, logs y sesiones históricas, provocando `57014` y
bloqueando otras consultas.

Regla definitiva: una petición de usuario nunca inicia un refresh histórico.

### 2.3 Filtros de correo y supresiones

El estado de supresión por correo se conserva en una columna explícita y debe
ser la fuente común para disponibilidad, selección de campañas, contadores,
reportes y prevención de reenvíos.

## 3. Arquitectura objetivo

```text
Panel /prospeccion
        │
        ▼
API de listado ───────► Filas indexadas
        │
        └──────────────► Contadores exactos precalculados

Cálculos históricos ─► Cola durable por tenant
                              │
                              ▼
                       Worker con claim, lease,
                       lock y backoff
                              │
                              ▼
                       Snapshots de métricas
```

## 4. Conteos exactos sin scans en cada navegación

### 4.1 Tabla de contadores por tenant

Crear una tabla explícita, por ejemplo `prospeccion_prospectos_resumen`, con
una fila por `organizacion_id` y columnas de negocio, no un JSON genérico:

- `total_prospectos`.
- Teléfonos por estado: verificados, pendientes, errores y sin dato.
- Correos por estado: válidos, pendientes, inválidos, dudosos, errores y sin dato.
- `correos_suprimidos` y `correos_disponibles`.
- Totales por canal de envíos e intentos.
- `actualizado_en` y `version`.

El dato debe mantenerse exacto mediante una operación transaccional controlada
al insertar o actualizar un prospecto, o mediante una reconstrucción durable
con una marca explícita de estado. No se debe presentar como exacto un valor
que todavía esté pendiente de reconstrucción.

### 4.2 Reconciliación

Un job periódico comparará los contadores contra agregados reales y corregirá
desalineaciones. Registrará tenant, contador, valor anterior, valor nuevo,
motivo, duración y resultado.

## 5. Listado y contrato de API

```json
{
  "items": [],
  "total": 31197,
  "total_exact": true,
  "has_more": false,
  "count_source": "summary|indexed_query|snapshot",
  "degraded": false
}
```

Reglas:

- `summary`: filtros estándar resueltos por contadores precalculados.
- `indexed_query`: filtros combinados que se pueden resolver con índices.
- `snapshot`: datos históricos o atribución.
- `degraded=true`: sólo cuando un bloque secundario no está listo.
- El listado nunca debe esperar indicadores detallados, atribución o refreshes.

## 6. Índices y consultas

Validar con `EXPLAIN (ANALYZE, BUFFERS)` antes y después:

- `(organizacion_id, creado_en DESC, id)` para orden y paginación.
- `(organizacion_id, email_lookup_status, id)`.
- `(organizacion_id, correo_suprimido_activo, id)`.
- `(organizacion_id, lookup_status, id)`.
- `(organizacion_id, website_lookup_status, id)`.
- `(organizacion_id, envios_correo_intentos_total, id)`.
- Índices parciales para correo válido y disponible.
- Índices de foreign keys usadas por envíos, batches y logs.

No se agregará un índice sin confirmar que corresponde a una consulta real y
sin revisar su costo de escritura.

## 7. Paginación

La compatibilidad con `limit/offset` se mantendrá durante la transición, pero
las páginas profundas migrarán a cursor/keyset:

- Orden estable por `creado_en, id`.
- Cursor validado por tenant y filtros.
- Sin aceptar cursores de otro tenant.
- Fallback temporal a offset para vistas guardadas antiguas.

## 8. Métricas de campañas y atribución

La navegación sólo leerá el último snapshot válido. Si no existe o está vencido:

1. Responderá rápidamente con el último snapshot disponible, si existe.
2. Si no existe, devolverá lista vacía con advertencia explícita.
3. Encolará una reconstrucción idempotente.
4. La UI mostrará `Actualizando métricas` y permitirá actualizar después.

La reconstrucción se ejecutará en un worker separado con cola durable, clave
tenant + periodo + campaña, `SKIP LOCKED`, lease, lock por tenant/periodo,
concurrencia global limitada, backoff y conservación del último snapshot válido.

Nunca se elevará globalmente `statement_timeout` como solución de rendimiento.

## 9. Multi-tenant y presión del servidor

- Límite global de jobs de métricas.
- Límite por tenant.
- Backpressure cuando crezca la cola de envíos.
- Prioridad para tenants con una solicitud visible reciente.
- Postmark, WhatsApp, Brevo y métricas con workers separados.
- Ningún worker reclama simultáneamente el mismo tenant y operación.
- Logs agregados sin tokens, correos ni payloads sensibles.

## 10. Experiencia esperada

- La vista inicial carga prospectos sin esperar métricas auxiliares.
- El resumen superior y el total filtrado representan el mismo universo exacto.
- Los filtros estándar no muestran estimaciones engañosas.
- Las métricas históricas no bloquean la pantalla.
- Si una métrica está calculándose, se muestra su estado, no un `502`.
- Los filtros de correo excluyen siempre supresiones activas.
- La selección de envío sólo permite prospectos elegibles para el canal.

## 11. Plan de implementación

### Fase A — Contención inmediata

- Mantener fuera del request el refresh de atribución.
- Eliminar fallbacks que escaneen toda la tabla.
- Medir p50, p95, p99 y errores por endpoint.
- Confirmar que no aparecen nuevos `57014` durante navegación.

### Fase B — Exactitud y lectura rápida

- Crear tabla de resumen por tenant.
- Poblarla en lotes controlados.
- Crear triggers/RPCs de actualización explícita.
- Agregar índices validados con planes.
- Alinear resumen, listado y filtros a la misma fuente.

#### Implementado en el segundo corte (2026-10-09)

- Tabla `prospeccion_prospectos_resumen` con contadores explícitos por tenant
  para total, teléfonos, correos, sitios, supresiones y correo disponible.
- Reconstrucción idempotente y trigger de deltas para no recalcular el universo
  completo después de cada alta o actualización.
- RPC de lectura rápida para el checklist y los conteos simples del listado.
- Los estados de teléfono, correo y sitio web ya resuelven su total desde el
  resumen; la combinación habitual `correo válido + sin envío de correo`
  utiliza `correos_disponibles` e ignora correctamente parámetros de WhatsApp
  que no aplican al canal correo.
- El orden base `organizacion_id, creado_en DESC, id` tiene un índice alineado
  con el `NULLS FIRST` implícito del endpoint; la página general y la página
  profunda dejaron de usar `Incremental Sort` en la medición de PostgreSQL.
- El API identifica `count_source=summary` cuando usa esa fuente; los filtros
  complejos conservan la ruta exacta/planificada compatible mientras se migra
  su paginación a cursor.

La reconciliación periódica del resumen y la validación de todos los filtros
combinados siguen siendo parte de la etapa de pruebas de carga.

### Fase C — Cola de métricas

- Crear tabla de jobs de snapshots.
- Crear worker de atribución.
- Implementar deduplicación, lease, reintentos y backoff.
- Cambiar la UI a stale-while-revalidate.

#### Implementado en el primer corte (2026-10-09)

- Migración `20261009_020000_prospeccion_atribucion_jobs.sql` aplicada en
  Supabase.
- Cola idempotente por tenant, período y campaña, con `SKIP LOCKED`, lease de
  cinco minutos, máximo de ocho intentos y backoff.
- El request sólo lee el snapshot; ante miss encola el cálculo y devuelve el
  estado degradado existente. Un snapshot vencido se entrega como stale y se
  revalida en segundo plano.
- La caché en memoria utiliza lock por tenant/período/campaña; no bloquea
  rangos independientes mientras espera a Supabase. También detecta snapshots
  viejos después de reiniciar el API y vuelve a encolarlos.
- Un cache miss sólo aplica cinco segundos de cooldown para permitir que el
  panel lea el snapshot recién terminado; los errores reales conservan cinco
  minutos de backoff.
- Worker independiente:
  `talia-prospeccion-atribucion-worker.service`. No comparte concurrencia con
  el worker de Postmark.

La instalación controlada del unit file queda encapsulada en
`scripts/install_prospeccion_atribucion_worker.sh`; debe ejecutarse en el host
de producción con la cuenta autorizada de deploy.

En la verificación del host, `talia-email-worker.service` y
`talia-postmark-preparer.service` permanecieron `active/enabled`; el refactor
no cambia ni detiene la entrega Postmark.

Prueba operativa realizada: el worker reclamó y completó el job
`3c4247d6-c4a7-40e2-b76c-41f14aaa0722` en un intento, generando 35 filas de
snapshot en aproximadamente 5.2 segundos, sin error.

Queda pendiente activar/reiniciar ese servicio en producción y verificar los
tiempos reales después del redeploy.

### Fase D — Cursor y carga

- Introducir cursor en API y cliente.
- Ejecutar pruebas multi-tenant y lotes simultáneos.
- Medir CPU, conexiones, locks, tiempos de Postgres y memoria.

## 12. Criterios de terminado

- El total global y el total filtrado son exactos.
- La consulta base cumple el SLO acordado en carga real.
- No existen `57014` por refreshes en peticiones interactivas.
- Un fallo del worker no borra el último snapshot válido.
- Existen pruebas de aislamiento entre tenants.
- Existen pruebas de duplicidad, reintento y recuperación de jobs.
- La selección de correo respeta `correo_suprimido_activo`.
- Se documentan métricas antes/después y evidencia de despliegue.

## 13. Restricciones

- No usar `metadata/jsonb` para contadores o estados consultables.
- No resolver el problema aumentando indiscriminadamente timeouts.
- No devolver conteos aproximados con `total_exact=true`.
- No ejecutar cálculos históricos en endpoints de navegación.
- No mezclar la concurrencia de Postmark con workers de métricas.
