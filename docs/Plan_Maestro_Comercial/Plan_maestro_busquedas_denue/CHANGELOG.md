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
