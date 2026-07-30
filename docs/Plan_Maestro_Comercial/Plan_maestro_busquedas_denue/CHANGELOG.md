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
