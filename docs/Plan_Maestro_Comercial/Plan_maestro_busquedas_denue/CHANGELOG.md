# Changelog · Créditos de Prospección DENUE

Registro cronológico de la implementación definida en:

- `PLAN_IMPLEMENTACION_CREDITOS_PROSPECCION_DENUE.md`;
- `../PLAN_MAESTRO_COMERCIAL.md`;
- `../../Busqueda_denue/PLAN_DESARROLLO_DENUE.md`.

## Reglas de mantenimiento

- Agregar las entradas más recientes primero.
- Usar fechas en formato `YYYY-MM-DD`.
- No registrar una tarea como implementada hasta verificar el cambio.
- Distinguir entre desarrollo local, migración remota y despliegue productivo.
- Incluir archivos, migraciones, endpoints y vistas afectados.
- Registrar pruebas ejecutadas y su resultado.
- Documentar riesgos, decisiones pendientes y rollback cuando aplique.
- No incluir secretos, tokens, credenciales ni datos personales.

## Estados

- `Planificado`: decisión documentada, sin implementación.
- `En progreso`: trabajo iniciado, todavía incompleto.
- `Implementado localmente`: código terminado y validado en el repositorio.
- `Migrado`: cambio de base de datos aplicado al entorno indicado.
- `Desplegado`: versión publicada en el entorno indicado.
- `Validado`: interacción o flujo completo comprobado.
- `Bloqueado`: existe un impedimento documentado.

## Plantilla de entrada

```md
## YYYY-MM-DD · Título

**Estado:** Planificado | En progreso | Implementado localmente | Migrado | Desplegado | Validado | Bloqueado

### Alcance

- ...

### Base de datos

- Migraciones:
- Tablas/columnas:
- Constraints e índices:
- RLS y grants:
- Entorno aplicado:

### Backend

- Endpoints:
- Servicios/repositorios:
- Validaciones:
- Idempotencia y concurrencia:

### Frontend

- Vistas/componentes:
- Estados UX:
- Permisos:

### Pruebas y validación

- Comandos:
- Casos:
- Resultado:

### Seguridad

- Ownership/tenant scope:
- RLS:
- Datos sensibles/logs:

### Operación

- Feature flags:
- Despliegue:
- Verificación posterior:
- Rollback:

### Archivos modificados

- `ruta/al/archivo`

### Pendientes y riesgos

- ...
```

---

## 2026-07-31 · Calidad del lote definida mediante filtros DENUE

**Estado:** Implementado localmente

### Alcance

- Cada usuario determina la calidad del lote con los filtros de correo, teléfono o ambos.
- Se elimina el criterio obligatorio configurable por tenant.
- Se mantiene una protección técnica mínima: no guardar registros sin correo y sin teléfono.
- Todos los prospectos nuevos guardados consumen 1 crédito.

### Base de datos

- Migración local: `supabase/migrations/20280731_000000_prospeccion_filters_define_quality.sql`.
- Normaliza las políticas existentes a `any`.
- Restringe `required_contact_mode` al único valor técnico compatible `any`.
- No elimina historial ni movimientos existentes.

### Backend

- La respuesta de uso resuelve siempre la protección mínima `any`.
- La actualización administrativa sólo admite el valor técnico `any`.
- El guardado transaccional conserva deduplicación, tenant scope e idempotencia.

### Frontend

- Se retiró el selector de contacto obligatorio en `/settings/tenants/[tenantId]`.
- Se retiró “Contacto requerido” del medidor de `/prospeccion/denue-busqueda`.
- Los filtros DENUE permanecen como la herramienta para definir la calidad del lote.

### Operación

- El cambio está preparado localmente.
- El usuario realizará el despliegue.
- La migración debe aplicarse antes o junto con el backend.

---

## 2026-07-30 · Búsquedas DENUE en segundo plano y upsert optimizado

**Estado:** Migrado

### Alcance

- Las búsquedas radiales y avanzadas del panel se envían al worker en segundo plano.
- El modal deja de bloquearse en `Procesando solicitud` y confirma que el usuario puede seguir navegando.
- Los errores visibles ya no exponen la respuesta interna completa de Supabase.

### Base de datos

- Migración local y remota: `supabase/migrations/20280730_150000_optimize_upsert_resultados_lote.sql`.
- `upsert_resultados_lote` cambió de un bucle con un `INSERT` por registro a un único `INSERT ... SELECT` por chunk.
- La función valida que la búsqueda, fuente y organización correspondan al mismo tenant.
- Conserva `SECURITY INVOKER`; `anon` no puede ejecutarla.

### Diagnóstico verificado

- Supabase registró `57014 canceling statement due to statement timeout` en los dos intentos del tenant Sinergia Lidera.
- La función desplegada procesaba fila por fila una tabla con aproximadamente 240,748 resultados.
- Los intentos fallidos dejaron dos búsquedas vacías, sin resultados insertados.

### Pruebas y validación

- Benchmark remoto de 200 resultados dentro de una transacción revertida: sin timeout.
- `poetry run pytest -q tests/services/test_denue.py tests/api/test_crm_routes.py -k 'denue or prospeccion'`: 16 pruebas aprobadas.
- `npx tsc --noEmit`: aprobado.
- React Doctor: 100/100, sin hallazgos.

### Operación

- La migración de Supabase está aplicada.
- El panel requiere despliegue para activar el nuevo comportamiento del modal y `async_mode=true`.

---

## 2026-07-30 · Límites por plan y excepciones por tenant

**Estado:** Migrado

### Alcance

- Se agregó administración dedicada para los límites mensuales de prospección por plan.
- El tenant maestro puede establecer una excepción individual y volver a heredar el plan.
- El criterio de contacto `any`, `phone`, `email` o `both` se administra por tenant; todos consumen 1 crédito por prospecto nuevo guardado.

### Base de datos

- Migración local y remota: `supabase/migrations/20280730_140000_prospeccion_admin_limits.sql`.
- RPC `admin_set_prospeccion_plan_limits` para actualizar los dos entitlements base del plan.
- RPC `admin_set_tenant_prospeccion_limits` para política, overrides y periodo mensual activo.
- Los overrides sustituidos se cierran con `ends_at`; no se elimina el historial.
- Se rechaza bajar un límite efectivo por debajo del consumo del periodo activo.
- Sólo `service_role` puede ejecutar las RPC y cada función valida que el actor exista en `platform_admins`.

### Backend

- `GET/PUT /admin/commercial-plans/{plan_id}/prospeccion-limits`.
- `GET/PUT /admin/tenants/{organizacion_id}/prospeccion-limits`.
- Contratos tipados, enteros no negativos, motivo obligatorio para excepciones y errores de negocio controlados.

### Frontend

- `/settings/commercial/plans`: pestaña de límites de prospección para editar créditos y resultados crudos mensuales por plan.
- `/settings/tenants/[tenantId]`: tarjeta `Prospección DENUE` con criterio de contacto, herencia, excepciones y consumo actual.
- Los controles sólo se consultan y muestran al administrador maestro.

### Pruebas y validación

- `poetry run pytest -q tests/api/test_admin_prospeccion_limits.py tests/api/test_admin_tenant_flow.py tests/services/test_prospeccion_usage.py tests/repositories/test_crm_prospeccion_credits.py`: 13 pruebas aprobadas.
- `npx tsc --noEmit`: aprobado.
- `npx -y react-doctor@latest . --verbose --diff`: 100/100, sin hallazgos.
- Prueba remota transaccional con rollback de ambas RPC: aprobada.
- Grants remotos confirmados: `anon=false`, `authenticated=false`, `service_role=true`.

### Operación

- La migración de Supabase está aplicada.
- Backend y panel de esta fase requieren un nuevo despliegue.

### Archivos principales

- `supabase/migrations/20280730_140000_prospeccion_admin_limits.sql`
- `backend/app/api/routes/admin.py`
- `backend/app/repositories/platform_admin.py`
- `backend/tests/api/test_admin_prospeccion_limits.py`
- `frontend/panel/src/app/settings/commercial-plans/prospeccion-plan-limits.client.tsx`
- `frontend/panel/src/app/settings/tenants/[tenantId]/tenant-prospeccion-limits-card.tsx`

---

## 2026-07-30 · Guardado DENUE transaccional e idempotente

**Estado:** Migrado

### Alcance

- Se implementó la RPC que guarda prospectos DENUE, deduplica y consume créditos dentro de una sola transacción.
- Se integró el backend y el cliente del panel detrás de un feature flag desactivado.
- La migración está aplicada en Supabase, pero el enforcement productivo todavía no está habilitado.

### Base de datos

Migración creada y aplicada:

- `supabase/migrations/20280730_130000_prospeccion_guardar_denue_transaccional.sql`;
- migración remota `prospeccion_guardar_denue_transaccional`.

RPC:

```text
prospeccion_guardar_denue_transaccional(
  p_tenant_id,
  p_created_by,
  p_operation_id,
  p_resultado_ids,
  p_segmento,
  p_metadata
)
```

La transacción:

1. valida tenant, actor, lote y acceso comercial;
2. calcula un hash canónico del payload;
3. serializa guardados mediante advisory lock tenant-scoped;
4. resuelve plan, override, política y periodo;
5. crea y bloquea el periodo mensual;
6. valida ownership de todos los resultados;
7. aplica el criterio `any`, `phone`, `email` o `both`;
8. deduplica dentro del lote;
9. deduplica contra el tenant;
10. limita candidatos al saldo disponible;
11. inserta prospectos;
12. registra operación y ledger;
13. actualiza el contador del periodo;
14. devuelve el desglose comercial.

Se permite guardado parcial cuando el saldo no alcanza para todo el lote.

### Idempotencia y concurrencia

- El mismo `operation_id` y payload devuelve la respuesta persistida con `replayed=true`.
- El mismo `operation_id` con otro payload devuelve `prospeccion_operation_payload_conflict`.
- Los locks se adquieren siempre por tenant antes de crear o bloquear el periodo.
- El contador rápido y el ledger se actualizan dentro de la misma transacción.
- Un error revierte prospectos, operación, ledger y contador.

### Backend

- Se agregó `save_denue_prospectos_transactional` al repositorio CRM.
- `POST /crm/prospeccion/prospectos` acepta `operation_id`.
- Si el feature flag está habilitado y la fuente es DENUE, el endpoint invoca la RPC.
- Google Places conserva temporalmente el flujo anterior.
- Los errores SQL desconocidos se ocultan detrás de `prospeccion_transaction_failed`.
- Los códigos de negocio conocidos se transforman en respuestas `400`, `403` o `409`.

Feature flag:

```text
TALIA_PROSPECCION_CREDITS_ENFORCEMENT_ENABLED=false
```

El valor por defecto es `false`.

### Frontend

- Cada lote DENUE genera un `operation_id` con `crypto.randomUUID()`.
- Los reintentos HTTP reutilizan el mismo ID porque forma parte del cuerpo de la solicitud.
- El cliente acepta el nuevo desglose comercial sin romper el contrato anterior basado en `total` y `prospectos`.
- Todavía no se muestran saldo, estimación ni advertencias en la interfaz.

### Pruebas y validación

- Prueba remota con rollback:
  - 5 solicitados;
  - 5 elegibles;
  - 2 duplicados del tenant;
  - 3 prospectos que habrían sido guardados;
  - 3 créditos que habrían sido consumidos;
  - saldo resultante de 8,997.
- Se confirmó después del rollback:
  - 0 operaciones de prueba;
  - 0 periodos de prueba;
  - 0 prospectos de prueba.
- Se comprobó replay idempotente con mismo total y saldo.
- Se comprobó rechazo del mismo `operation_id` con payload diferente.
- `poetry run pytest tests/services/test_prospeccion_usage.py tests/repositories/test_crm_prospeccion_credits.py -q`: 7 pruebas aprobadas.
- `npx tsc --noEmit`: aprobado.
- `react-doctor --verbose --diff`: aprobado sin diagnósticos.
- `python -m compileall` y `git diff --check`: aprobados.

### Seguridad

- La RPC es `SECURITY DEFINER` con `search_path` fijo y referencias calificadas.
- `anon` y `authenticated` no pueden ejecutarla.
- Sólo `service_role` tiene `EXECUTE`.
- El endpoint mantiene autenticación, permiso `ejecutar_busquedas` y resolución tenant-aware.
- La RPC verifica que el actor pertenezca al tenant.
- Todos los resultados deben pertenecer al tenant y ser fuente DENUE.
- No se exponen mensajes SQL o stack traces al frontend.

El advisor de Supabase no reportó un hallazgo nuevo sobre esta función. Permanecen hallazgos preexistentes fuera del alcance:

- RLS deshabilitado en `tenant_mailbox_sync_state` y `spatial_ref_sys`;
- funciones antiguas con privilegios amplios o `search_path` mutable;
- protección de contraseñas filtradas deshabilitada.

### Archivos modificados

- `supabase/migrations/20280730_130000_prospeccion_guardar_denue_transaccional.sql`.
- `backend/app/core/config.py`.
- `backend/app/repositories/crm.py`.
- `backend/app/api/routes/crm.py`.
- `backend/.env.staging.example`.
- `backend/tests/repositories/test_crm_prospeccion_credits.py`.
- `frontend/panel/src/lib/prospeccion/prospectos-client.ts`.
- `frontend/panel/src/app/prospeccion/denue-busqueda/denue-busqueda-view.tsx`.
- `docs/Plan_Maestro_Comercial/Plan_maestro_busquedas_denue/CHANGELOG.md`.

### Pendientes

- Probar concurrencia real con solicitudes simultáneas en un entorno aislado.
- Implementar endpoint de estimación.
- Mostrar cuota, criterio y advertencias en DENUE.
- Configurar los cuatro tenants que todavía no tienen plan.
- Desplegar backend y panel.
- Activar el feature flag sólo después de validación end-to-end.

---

## 2026-07-30 · Resolución runtime de cuota comercial

**Estado:** Implementado localmente

### Alcance

- Se implementó la lectura tenant-scoped del plan, entitlements, overrides vigentes, política de contacto y periodo actual.
- Se agregó un resumen de consumo para que backend y frontend utilicen una única resolución comercial.
- Esta fase es informativa: todavía no reserva, descuenta ni bloquea créditos.

### Backend

- Nuevo servicio `app/services/prospeccion_usage.py`.
- Nuevo método de repositorio `get_prospeccion_commercial_context`.
- Nuevo endpoint `GET /crm/prospeccion/usage`, protegido por:
  - contexto autenticado del tenant mediante `X-Organizacion-Id`;
  - permiso `busquedas.view`.
- El límite efectivo aplica esta precedencia:
  1. override vigente del tenant;
  2. entitlement activo del plan.
- El periodo usa:
  - periodo de billing cuando contiene la fecha actual;
  - mes calendario UTC para tenants internos o manuales.
- La respuesta incluye plan, estado de acceso, periodo, política, límites, consumo, saldo y porcentaje utilizado.
- Los límites y contadores deben ser enteros no negativos; no se acepta punto flotante.
- Los errores del repositorio se transforman en una respuesta segura sin exponer detalles internos.

### Validación de datos remotos

- Se verificó mediante una consulta de sólo lectura que las 7 organizaciones tienen política de prospección.
- Los tenants `5CC INMOBILIARIA`, `Sinergia Lidera` y `GEOACTIV` tienen Starter con acceso `internal_free`.
- Cuatro tenants todavía no tienen cuenta comercial ni plan asignado; el endpoint responderá `409 prospeccion_plan_not_configured` hasta que se configure explícitamente su plan.
- No se alteraron datos remotos durante esta fase.

### Pruebas y validación

- `poetry run pytest tests/services/test_prospeccion_usage.py -q`: 4 pruebas aprobadas.
- Casos cubiertos:
  - periodo de billing y consumo persistido;
  - fallback a mes calendario UTC;
  - precedencia de override;
  - tenant sin plan;
  - rechazo de límites fraccionarios.
- `python -m compileall` y `git diff --check`: sin errores.
- La suite existente `tests/api/test_crm_routes.py` conserva un fallo no relacionado en `test_list_accounts`: el doble `DummyCRMRepository` intenta usar `_base_url`.

### Seguridad

- El tenant no se acepta como parámetro libre de consulta; se resuelve con la dependencia tenant-aware existente.
- Las lecturas comerciales se ejecutan server-side y se filtran por `tenant_id`.
- No se registran correos, teléfonos, tokens ni resultados DENUE.
- No se habilitaron escrituras directas desde el cliente.

### Archivos modificados

- `backend/app/services/prospeccion_usage.py`.
- `backend/app/repositories/crm.py`.
- `backend/app/api/routes/crm.py`.
- `backend/tests/services/test_prospeccion_usage.py`.
- `docs/Plan_Maestro_Comercial/Plan_maestro_busquedas_denue/CHANGELOG.md`.

### Pendientes

- Asignar explícitamente plan a los cuatro tenants que aún no tienen cuenta comercial.
- Crear el periodo al iniciar el primer consumo, dentro de la futura RPC transaccional.
- Implementar estimación y guardado transaccional idempotente.
- Integrar el endpoint en las vistas de administración y búsqueda DENUE.
- Desplegar y validar el endpoint contra el servicio activo.

---

## 2026-07-30 · Fundación de base de datos para créditos DENUE

**Estado:** Migrado

### Alcance

- Se implementó la fase inicial de base de datos para políticas, periodos, operaciones idempotentes y ledger de créditos.
- Se aplicaron las migraciones en la base Supabase conectada.
- Esta fase todavía no activa enforcement en backend ni modifica el frontend.

### Base de datos

Migraciones creadas:

- `supabase/migrations/20280730_120000_prospeccion_credits_foundation.sql`;
- `supabase/migrations/20280730_121000_prospeccion_credits_least_privilege.sql`.

Migraciones remotas registradas:

- `prospeccion_credits_foundation`;
- `prospeccion_credits_least_privilege`.

Tablas creadas:

- `tenant_prospeccion_policies`;
- `tenant_prospeccion_usage_periods`;
- `tenant_prospeccion_credit_operations`;
- `tenant_prospeccion_credit_ledger`.

### Política por tenant

- Se agregó `required_contact_mode` como columna explícita.
- Valores permitidos:
  - `any`;
  - `phone`;
  - `email`;
  - `both`.
- Se aplicó default `any`.
- Se crearon políticas para los 7 tenants existentes.
- No se utilizó `organizaciones.config`, metadata ni JSONB para esta regla.

### Periodos y límites

- Se agregaron snapshots explícitos de:
  - límite de créditos;
  - créditos consumidos;
  - límite de resultados crudos;
  - resultados crudos consumidos.
- Se agregaron checks para impedir valores negativos y consumo mayor al límite.
- Se agregó una exclusión GiST para impedir periodos solapados del mismo tenant.
- Se agregaron FKs e índices tenant-scoped.

### Operaciones e idempotencia

- Se agregó una cabecera por `operation_id`.
- Se agregó `request_hash` para detectar reutilización del mismo ID con un payload diferente.
- Se modelaron en columnas explícitas:
  - solicitados;
  - elegibles;
  - sin contacto requerido;
  - duplicados de lote;
  - duplicados del tenant;
  - guardados;
  - créditos consumidos;
  - omitidos por límite;
  - saldo final.
- Se restringió la fuente inicial a `denue`.

### Ledger

- Se habilitaron movimientos `consume` y `reversal`.
- Un consumo equivale exactamente a `1` crédito.
- Una reversa equivale exactamente a `-1` crédito.
- Se agregaron índices únicos para impedir:
  - doble consumo del mismo prospecto;
  - doble consumo del mismo resultado dentro de una operación;
  - doble consumo del mismo identificador externo DENUE;
  - más de una reversa del mismo movimiento.
- Se conservarán referencias auditables a periodo, operación, prospecto, resultado y búsqueda.

### Entitlements

Se configuraron para Starter:

```text
limit.prospeccion.credits_month = 9000
limit.prospeccion.denue_raw_results_month = 50000
```

Configuración:

- `value_type = integer`;
- `scope = tenant_month`;
- unidades `credits` y `raw_results`.

También se agregó unicidad para:

```text
(plan_id, entitlement_key)
```

### RLS y privilegios

- Las cuatro tablas tienen RLS habilitado.
- Sólo existe política directa para `service_role`.
- `anon` y `authenticated` no tienen privilegios directos.
- Políticas, periodos y operaciones permiten a `service_role`:
  - `SELECT`;
  - `INSERT`;
  - `UPDATE`;
  - `DELETE`.
- El ledger inmutable permite a `service_role` únicamente:
  - `SELECT`;
  - `INSERT`.
- Se agregó una segunda migración correctiva porque los privilegios por defecto de Supabase habían concedido permisos más amplios al crear las tablas.

### Validación remota

- Se confirmaron las cuatro tablas y todas tienen RLS activo.
- Se confirmaron:
  - 7 políticas con modo `any`;
  - 0 periodos iniciales;
  - 0 operaciones iniciales;
  - 0 movimientos iniciales.
- Se verificaron constraints, FKs, índices parciales y exclusión de periodos.
- Se verificaron los dos entitlements de Starter.
- Se verificaron los privilegios finales del ledger: `{INSERT, SELECT}`.
- `git diff --check` no reportó errores antes de aplicar.

### Seguridad

- El tenant queda ligado mediante FKs explícitas.
- Periodos y operaciones usan FKs compuestas `(tenant_id, id)` para evitar cruces entre tenants.
- El ledger no puede actualizarse ni eliminarse mediante `service_role`.
- El enforcement transaccional todavía debe implementarse mediante una RPC controlada.
- Hallazgo preexistente fuera de esta migración: `tenant_mailbox_sync_state` continúa con RLS deshabilitado y requiere una revisión separada de políticas antes de corregirse.

### Pendientes

- Implementar resolución runtime de plan, override, política y periodo.
- Crear la RPC transaccional de guardado.
- Integrar backend.
- Agregar administración en `/settings/tenants/[tenantId]`.
- Agregar resumen y estimación en `prospeccion/denue-busqueda`.
- Definir entitlements para Growth, Pro, Business y Enterprise.
- Definir cuándo comienza el primer periodo según billing de Stripe o tenant interno.

---

## 2026-07-30 · Definición del plan de implementación

**Estado:** Planificado

### Alcance

- Se documentó el modelo comercial de créditos mensuales para prospección DENUE.
- Se estableció que Starter tendrá `9,000` créditos de prospección al mes.
- Se definió que un prospecto nuevo, único, elegible y guardado correctamente consume `1` crédito.
- Se descartó cobrar `1.5` créditos por el modo `both`.
- Se separó la elegibilidad del prospecto de las cuotas de validación y enriquecimiento.

### Decisiones funcionales

- `required_contact_mode` admitirá:
  - `any`;
  - `phone`;
  - `email`;
  - `both`.
- El modo determina el requisito mínimo de contacto.
- Un registro con correo y teléfono cumple los cuatro modos.
- Todos los modos consumen un crédito por prospecto nuevo guardado.
- Los duplicados consumen cero créditos.
- Los registros que no cumplen el criterio consumen cero créditos.
- Las búsquedas, consultas, filtros y visualizaciones consumen cero créditos comerciales.
- El sitio web no modifica el consumo.
- Las validaciones de correo, teléfono y sitio web tendrán cuotas independientes.

### Entitlements planificados

- `limit.prospeccion.credits_month`.
- `limit.prospeccion.denue_raw_results_month`.
- `limit.prospeccion.validaciones_phone_month`.
- `limit.prospeccion.validaciones_email_month`.
- `limit.prospeccion.validaciones_website_month`.

Configuración inicial propuesta para Starter:

```text
limit.prospeccion.credits_month = 9000
limit.prospeccion.denue_raw_results_month = 50000
```

El límite de `50000` resultados crudos queda sujeto a medición en sombra antes de convertirse en bloqueo estricto.

### Base de datos planificada

Se propusieron tablas con columnas explícitas:

- `tenant_prospeccion_policies`;
- `tenant_prospeccion_usage_periods`;
- `tenant_prospeccion_credit_ledger`.

Se definieron:

- foreign keys;
- constraints;
- índices;
- RLS;
- contador mensual;
- ledger auditable;
- reconciliación;
- movimientos de consumo y reversa;
- idempotencia mediante `operation_id`.

No se aplicaron migraciones ni cambios en Supabase en esta entrada.

### Backend planificado

- Resolver entitlement efectivo por plan y override.
- Resolver la política de contacto del tenant.
- Crear resumen mensual de uso.
- Crear estimación previa de consumo.
- Aplicar el consumo mediante RPC transaccional.
- Bloquear la fila del periodo para evitar sobregiro concurrente.
- Mantener deduplicación de lote y tenant.
- Permitir guardado parcial cuando el saldo sea insuficiente.
- Devolver desglose de elegibles, duplicados, guardados, consumo y saldo.

No se modificaron endpoints ni servicios en esta entrada.

### Frontend planificado

En `/settings/tenants/[tenantId]`:

- administrar el criterio obligatorio de contacto;
- mostrar plan, límite, override, consumo, saldo y periodo;
- proteger edición mediante permisos administrativos.

En `/prospeccion/denue-busqueda`:

- mostrar créditos utilizados y disponibles;
- mostrar el criterio efectivo;
- alinear filtros visuales;
- estimar consumo antes de guardar;
- advertir al 80%, 90% y 100%;
- mostrar guardado completo o parcial.

No se modificaron componentes del panel en esta entrada.

### Seguridad planificada

- Enforcement en backend y PostgreSQL, nunca sólo en frontend.
- Tenant resuelto desde el contexto autenticado.
- Validación de ownership de resultados.
- RLS para políticas, periodos y ledger.
- Escritura de consumo únicamente mediante una función controlada.
- Protección contra concurrencia, replay y payloads idempotentes inconsistentes.
- Logs sin correos, teléfonos, tokens ni payloads sensibles.

### Implementación por fases

1. Medición en sombra.
2. Esquema comercial.
3. Resolución de runtime.
4. Guardado transaccional.
5. Administración del tenant.
6. UX DENUE.
7. Enforcement progresivo.
8. Límite crudo y validaciones independientes.

### Documentación creada

- `PLAN_IMPLEMENTACION_CREDITOS_PROSPECCION_DENUE.md`.
- `CHANGELOG.md`.

### Pruebas y validación

- Se validó el formato Markdown mediante `git diff --check`.
- No se ejecutaron pruebas de backend, frontend o base de datos porque esta entrada sólo documenta el plan.
- No se realizó despliegue.

### Pendientes

- Aprobar límites de Growth, Pro, Business y Enterprise.
- Definir paquetes adicionales y precios.
- Definir fecha de corte y zona horaria.
- Definir comportamiento en upgrades y downgrades.
- Definir cuotas iniciales de validación.
- Implementar medición en sombra antes del enforcement.
- Implementar y validar cada fase antes de cambiar su estado en este changelog.
