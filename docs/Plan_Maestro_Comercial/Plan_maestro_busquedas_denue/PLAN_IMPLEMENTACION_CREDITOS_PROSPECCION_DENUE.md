# Plan de Implementación de Créditos de Prospección DENUE

## Propósito

Extender el Plan Maestro Comercial de TalIA para controlar por tenant el consumo mensual de prospección originada en DENUE.

Este documento define:

- la unidad comercial que se venderá;
- el criterio configurable de contacto;
- el momento exacto en que se consume un crédito;
- la relación con planes, entitlements, overrides y Stripe;
- el modelo de base de datos;
- el enforcement transaccional;
- los contratos de backend;
- los cambios de frontend;
- la observabilidad, seguridad y pruebas;
- la secuencia recomendada de implementación.

Este plan está ligado a:

- `docs/Plan_Maestro_Comercial/PLAN_MAESTRO_COMERCIAL.md`;
- `docs/Plan_Maestro_Comercial/IMPLEMENTACION_ALTA_TENANT_STRIPE.md`;
- `docs/Busqueda_denue/PLAN_DESARROLLO_DENUE.md`.

---

## 1. Decisión comercial

### 1.1 Unidad comercial

El plan Starter incluirá:

> **9,000 créditos de prospección al mes.**

Un crédito permite guardar un prospecto que:

1. tiene al menos correo o teléfono;
2. no está duplicado dentro del lote;
3. no existe previamente para el tenant;
4. se inserta correctamente en `prospeccion_prospectos`.

La comunicación comercial recomendada es:

> **Hasta 9,000 prospectos nuevos y únicos al mes.**

También puede mostrarse:

> **9,000 créditos de prospección al mes. Cada prospecto nuevo guardado consume un crédito.**

### 1.2 Regla de consumo

Cada prospecto nuevo guardado consume **1 crédito**.

La calidad del lote la determina cada usuario mediante los filtros de DENUE:

- teléfono presente;
- correo presente;
- correo y teléfono;
- combinaciones adicionales con sitio web, actividad, ubicación y estrato.

El backend conserva una única protección mínima: no guarda registros que carezcan tanto de correo como de teléfono.
Ya no existe un criterio obligatorio configurable por tenant.

### 1.3 Filtros y consumo

Aplicar un filtro más estricto no cambia el costo. Un prospecto nuevo consume un crédito tanto si tiene:

- sólo teléfono;
- sólo correo;
- correo y teléfono.

La validación o enriquecimiento posterior continúa en cuotas independientes.

### 1.4 Acciones que consumen cero créditos

No consumen créditos:

- ejecutar una búsqueda DENUE;
- consultar o visualizar resultados;
- aplicar filtros;
- resultados sin correo y sin teléfono;
- resultados no seleccionados;
- resultados no guardados;
- duplicados dentro del lote;
- prospectos existentes para el tenant;
- reintentos idempotentes de la misma operación;
- el sitio web como dato adicional;
- registros cuya inserción falle.

### 1.5 Cuotas independientes

Las validaciones deben permanecer separadas:

- `limit.prospeccion.validaciones_phone_month`;
- `limit.prospeccion.validaciones_email_month`;
- `limit.prospeccion.validaciones_website_month`.

El límite técnico de resultados crudos también será independiente:

- `limit.prospeccion.denue_raw_results_month`.

Este último protege almacenamiento, procesamiento y abuso. No sustituye la cuota comercial de prospectos guardados.

---

## 2. Estado actual identificado

### 2.1 Frontend DENUE

La vista `prospeccion/denue-busqueda`:

- permite filtrar por teléfono, correo y sitio web;
- soporta combinación `all` o `any` para filtros de contacto;
- obtiene el total filtrado server-side;
- permite seleccionar filas visibles;
- permite guardar todos los resultados filtrados;
- envía IDs de resultados en lotes al endpoint de prospectos.

El frontend ya distingue entre:

- resultados filtrados;
- IDs procesados;
- prospectos guardados.

Sin embargo, el plan original todavía no contemplaba:

- límite mensual;
- consumo;
- saldo;
- estimación del lote;
- omisiones por límite.

### 2.2 Backend

El backend actual:

- valida permisos para ejecutar búsquedas y guardar prospectos;
- obtiene resultados DENUE por IDs;
- descarta elementos que no tienen correo ni teléfono;
- deduplica dentro del lote;
- deduplica contra prospectos existentes;
- realiza upsert en `prospeccion_prospectos`;
- devuelve `solicitados`, `contactables_encontrados` y `total`.

Todavía no:

- resuelve el entitlement mensual;
- resuelve una política explícita de contacto por tenant;
- reserva cuota;
- registra movimientos comerciales;
- protege el límite frente a concurrencia;
- devuelve consumo y saldo.

### 2.3 Base de datos comercial

Ya existen:

- `commercial_plans`;
- `commercial_plan_prices`;
- `commercial_plan_entitlements`;
- `commercial_plan_defaults`;
- `tenant_billing_accounts`;
- `tenant_plan_overrides`.

Los planes `starter`, `growth`, `pro`, `business` y `enterprise` ya están creados, pero deben configurarse los entitlements de prospección.

### 2.4 Regla de integración

La configuración operativa de DENUE, como token o URL del proveedor, puede continuar en la capa operativa correspondiente.

Las reglas comerciales y medidores no deben guardarse en:

- `organizaciones.config`;
- `metadata`;
- `jsonb`;
- payloads variables.

Deben modelarse en columnas explícitas y tablas auditables.

---

## 3. Entitlements

### 3.1 Entitlement principal

```text
limit.prospeccion.credits_month
```

Starter:

```text
limit.prospeccion.credits_month = 9000
limit_unit = credits
scope = tenant_month
```

### 3.2 Límite técnico DENUE

```text
limit.prospeccion.denue_raw_results_month = 50000
limit_unit = raw_results
scope = tenant_month
```

El valor `50000` debe considerarse inicial y ajustarse con métricas reales. Los modos más restrictivos pueden necesitar explorar más resultados crudos para obtener suficientes prospectos elegibles.

### 3.3 Validaciones

```text
limit.prospeccion.validaciones_phone_month
limit.prospeccion.validaciones_email_month
limit.prospeccion.validaciones_website_month
```

Cada validación debe tener su propio ledger o tipo de movimiento para distinguir costo, reintentos y proveedor.

### 3.4 Precedencia

La resolución efectiva debe respetar:

```text
override vigente del tenant
→ entitlement del plan
→ default seguro del sistema
```

Reglas:

- un override debe tener vigencia y motivo;
- un override vencido no debe aplicarse;
- la ausencia de plan no debe conceder cuota ilimitada;
- los tenants internos deben tener una política explícita, aunque su acceso sea `internal_free`;
- el frontend nunca debe ser la fuente de verdad del límite.

---

## 4. Protección mínima de contacto

### 4.1 Regla vigente

La calidad no se configura por tenant. El usuario selecciona el nivel de información mediante los filtros de cada
búsqueda. Internamente se conserva `any` como valor técnico para mantener compatibilidad con el ledger existente:

```text
correo o teléfono
```

### 4.2 Modelo compatible

Crear una tabla específica:

```text
tenant_prospeccion_policies
```

Columnas:

| Columna | Tipo sugerido | Regla |
|---|---|---|
| `tenant_id` | `uuid` | PK y FK a `organizaciones.id` |
| `required_contact_mode` | `text` | NOT NULL, valor técnico fijo `any` |
| `effective_from` | `timestamptz` | NOT NULL |
| `updated_at` | `timestamptz` | NOT NULL |
| `updated_by` | `uuid` | FK al usuario administrativo, nullable para sistema |

Constraint:

```text
required_contact_mode = 'any'
```

Índices:

- primary key en `tenant_id`;
- índice en `updated_by` si se audita frecuentemente.

### 4.3 Valor técnico

El único valor permitido es:

```text
any
```

Mantiene compatibilidad con operaciones y ledger históricos. No se muestra ni se edita en el panel.

Como todos los modos consumen 1 crédito, el tenant puede cambiar el criterio sin alterar el precio de registros equivalentes.

Aun así:

- cada operación debe tomar un snapshot del modo efectivo;
- el ledger debe registrar el modo aplicado;
- un cambio no debe alterar movimientos anteriores;
- sólo usuarios administrativos autorizados pueden cambiarlo;
- el backend debe resolver el tenant desde el contexto autenticado, no desde un ID libre del cliente.

---

## 5. Modelo de consumo

### 5.1 Periodos mensuales

Crear:

```text
tenant_prospeccion_usage_periods
```

Columnas:

| Columna | Tipo sugerido | Propósito |
|---|---|---|
| `id` | `uuid` | PK |
| `tenant_id` | `uuid` | FK a `organizaciones.id` |
| `period_start` | `timestamptz` | Inicio inclusivo |
| `period_end` | `timestamptz` | Fin exclusivo |
| `credits_limit` | `integer` | Snapshot del límite efectivo |
| `credits_consumed` | `integer` | Contador transaccional |
| `raw_results_limit` | `integer` | Snapshot del límite técnico |
| `raw_results_consumed` | `integer` | Contador técnico |
| `created_at` | `timestamptz` | Auditoría |
| `updated_at` | `timestamptz` | Auditoría |

Constraints:

- `credits_limit >= 0`;
- `credits_consumed >= 0`;
- `credits_consumed <= credits_limit`, salvo política explícita de sobregiro;
- `period_end > period_start`;
- unique en `(tenant_id, period_start, period_end)`.

Índice principal de consulta:

```text
(tenant_id, period_start, period_end)
```

### 5.2 Ledger

Crear:

```text
tenant_prospeccion_credit_ledger
```

Columnas:

| Columna | Tipo sugerido | Propósito |
|---|---|---|
| `id` | `uuid` | PK |
| `tenant_id` | `uuid` | FK |
| `usage_period_id` | `uuid` | FK al periodo |
| `operation_id` | `uuid` | Idempotencia del lote |
| `prospecto_id` | `uuid` | FK al prospecto guardado |
| `resultado_id` | `uuid` | FK al resultado origen |
| `busqueda_id` | `uuid` | FK a la búsqueda |
| `movement_type` | `text` | `consume` o `reversal` |
| `credits_delta` | `integer` | `1` o `-1` |
| `required_contact_mode` | `text` | Snapshot técnico fijo `any` para compatibilidad |
| `created_at` | `timestamptz` | Auditoría |
| `created_by` | `uuid` | Usuario ejecutor |
| `reversal_of_id` | `uuid` | FK nullable al movimiento revertido |

Constraints e índices:

- unique en `(tenant_id, prospecto_id, movement_type)` donde aplique;
- unique en `(tenant_id, operation_id, resultado_id, movement_type)`;
- índice en `(tenant_id, created_at)`;
- índice en `usage_period_id`;
- índice en `prospecto_id`;
- `credits_delta <> 0`;
- `movement_type IN ('consume', 'reversal')`.

### 5.3 Fuente de verdad

El ledger es la fuente de auditoría.

`tenant_prospeccion_usage_periods.credits_consumed` es el contador rápido, actualizado dentro de la misma transacción.

Debe existir una consulta de reconciliación:

```text
credits_consumed = SUM(credits_delta) del ledger del periodo
```

No se debe recalcular el saldo contando filas actuales de `prospeccion_prospectos`, porque:

- un prospecto puede editarse;
- puede existir soft delete;
- puede cambiar su información de contacto;
- el movimiento comercial debe permanecer auditable.

### 5.4 Precisión

La decisión actual usa únicamente créditos enteros:

```text
1 prospecto nuevo guardado = 1 crédito
```

Por lo tanto, se recomienda `integer`.

No se necesita punto flotante ni conversión a medias unidades. Si en el futuro aparecen productos fraccionarios, se migrará a unidades enteras escaladas, nunca a `float`.

---

## 6. Transacción de guardado

### 6.1 Principio

El enforcement debe ocurrir en PostgreSQL mediante una función/RPC transaccional.

No debe implementarse como:

1. consultar saldo;
2. insertar desde FastAPI;
3. actualizar contador después.

Ese patrón permite exceder el límite con solicitudes concurrentes.

### 6.2 Flujo atómico

La operación debe:

1. validar tenant, usuario y permiso;
2. resolver plan, override y periodo efectivo;
3. bloquear la fila del periodo con `SELECT ... FOR UPDATE`;
4. obtener los resultados solicitados que pertenecen al tenant;
5. normalizar correo y teléfono;
6. exigir al menos correo o teléfono;
7. deduplicar el lote;
8. deduplicar contra prospectos existentes;
9. ordenar determinísticamente los candidatos;
10. calcular el saldo disponible;
11. limitar candidatos al saldo;
12. insertar sólo prospectos nuevos;
13. insertar un movimiento por prospecto guardado;
14. actualizar `credits_consumed`;
15. devolver el resumen;
16. confirmar toda la transacción.

Si cualquier parte crítica falla:

- no se inserta el prospecto;
- no se registra el movimiento;
- no se descuenta crédito.

### 6.3 Orden determinístico

Cuando el lote supera el saldo, los candidatos deben ordenarse de forma estable, por ejemplo:

```text
orden solicitado por el usuario
→ resultado_id como desempate
```

Esto evita resultados impredecibles entre reintentos.

### 6.4 Idempotencia

El cliente enviará:

```text
operation_id: UUID
```

Reglas:

- repetir el mismo `operation_id` con el mismo payload devuelve el resultado original;
- repetirlo con contenido diferente devuelve conflicto;
- la unicidad se protege en base de datos;
- un timeout del cliente no debe duplicar prospectos ni créditos;
- la deduplicación actual por tenant, fuente, external ID, correo y teléfono debe mantenerse como defensa adicional.

### 6.5 Lotes parciales

La política recomendada es permitir guardado parcial:

- se guardan los primeros candidatos que caben en el saldo;
- el resto se devuelve como `omitidos_por_limite`;
- la respuesta explica cuántos no se guardaron.

Alternativa futura:

- modo `all_or_nothing` para integraciones que requieran atomicidad completa del lote.

No se recomienda como default porque reduce usabilidad cuando quedan pocos créditos.

---

## 7. Backend

### 7.1 Separación de responsabilidades

Crear componentes equivalentes a:

```text
backend/app/services/prospeccion_entitlements.py
backend/app/services/prospeccion_credit_service.py
backend/app/repositories/prospeccion_usage.py
backend/app/schemas/prospeccion_usage.py
```

Los nombres finales deben adaptarse a la estructura real, evitando ampliar más `crm.py` con lógica compleja.

Responsabilidades:

- resolver entitlement efectivo;
- aplicar la protección mínima de correo o teléfono;
- calcular periodo;
- invocar RPC transaccional;
- mapear errores internos a respuestas seguras;
- publicar eventos de UI;
- registrar métricas sin PII innecesaria.

### 7.2 Endpoint de resumen

```text
GET /crm/prospeccion/usage
```

Auth:

- sesión autenticada;
- tenant resuelto por contexto;
- permiso de consulta de prospección.

Respuesta sugerida:

```json
{
  "ok": true,
  "period": {
    "start": "2026-07-01T00:00:00Z",
    "end": "2026-08-01T00:00:00Z"
  },
  "credits": {
    "limit": 9000,
    "consumed": 6420,
    "remaining": 2580,
    "usage_percentage": 71.33
  },
  "required_contact_mode": "any",
  "raw_results": {
    "limit": 50000,
    "consumed": 28750,
    "remaining": 21250
  }
}
```

### 7.3 Endpoint de estimación

```text
POST /crm/prospeccion/prospectos/estimate
```

Request:

```json
{
  "fuente": "denue",
  "resultado_ids": ["uuid"],
  "operation_id": "uuid"
}
```

Respuesta:

```json
{
  "ok": true,
  "solicitados": 1000,
  "cumplen_criterio_contacto": 800,
  "sin_contacto_requerido": 120,
  "duplicados_lote": 20,
  "duplicados_tenant_estimados": 60,
  "nuevos_estimados": 740,
  "creditos_estimados": 740,
  "creditos_disponibles": 700,
  "omitidos_por_limite_estimados": 40,
  "required_contact_mode": "any",
  "estimate_expires_at": "2026-07-30T12:05:00Z"
}
```

La estimación no reserva saldo. Debe mostrarse como aproximada porque:

- otro usuario puede consumir créditos;
- otro lote puede guardar los mismos prospectos;
- la fuente de verdad es la transacción final.

### 7.4 Endpoint de guardado

Mantener:

```text
POST /crm/prospeccion/prospectos
```

Agregar:

```json
{
  "operation_id": "uuid",
  "fuente": "denue",
  "resultado_ids": ["uuid"],
  "segmento": "Restaurantes"
}
```

Respuesta mínima:

```json
{
  "ok": true,
  "operation_id": "uuid",
  "solicitados": 1000,
  "cumplen_criterio_contacto": 800,
  "sin_contacto_requerido": 120,
  "duplicados_lote": 20,
  "duplicados_tenant": 60,
  "nuevos_guardados": 700,
  "creditos_consumidos": 700,
  "creditos_restantes": 0,
  "omitidos_por_limite": 40,
  "required_contact_mode": "any",
  "period_start": "2026-07-01T00:00:00Z",
  "period_end": "2026-08-01T00:00:00Z",
  "prospectos": []
}
```

No utilizar `costo_por_prospecto` como campo principal porque la regla comercial ya es fija: un prospecto nuevo equivale a un crédito.

### 7.5 Errores

Errores sugeridos:

```text
prospeccion_plan_not_configured
prospeccion_credits_not_configured
prospeccion_credits_exhausted
prospeccion_operation_payload_conflict
prospeccion_results_not_owned
prospeccion_usage_period_invalid
```

Los errores:

- no deben incluir SQL;
- no deben incluir stack traces;
- no deben exponer IDs o datos de otro tenant;
- deben ser consumibles por el frontend.

### 7.6 Compatibilidad

Durante la transición:

- todas las políticas se normalizan a `any`;
- tenants internos deben recibir un entitlement explícito;
- el endpoint anterior puede aceptar temporalmente payloads sin `operation_id`, generándolo server-side;
- antes de enforcement estricto se recomienda una fase de medición en sombra.

---

## 8. Frontend administrativo

### 8.1 Vista del tenant

Ruta:

```text
/settings/tenants/[tenantId]
```

Agregar una sección:

```text
Prospección y créditos
```

Contenido:

- plan comercial efectivo;
- límite mensual base;
- override vigente;
- créditos utilizados;
- créditos disponibles;
- periodo actual;
- límite técnico DENUE;
- estado de validaciones.

### 8.2 Calidad del lote

No existe selector de criterio por tenant. La vista administrativa explica que:

> Cada usuario define la calidad del lote con los filtros de DENUE. Sólo se guardan registros con al menos correo o teléfono.

### 8.3 Permisos

Los límites y overrides sólo son editables por plataforma/admin autorizado. La protección mínima se valida en backend
y no depende de controles visibles en frontend.

### 8.4 Estados UI

Contemplar:

- cargando;
- sin plan;
- sin entitlement;
- sin periodo;
- error;
- límite agotado;
- override activo;
- actualización exitosa.

---

## 9. Frontend DENUE

### 9.1 Resumen de consumo

En `prospeccion/denue-busqueda`, mostrar una tarjeta compacta:

```text
Prospección mensual
6,420 de 9,000 créditos utilizados
2,580 disponibles
```

La tarjeta debe:

- priorizar saldo;
- evitar saturar la búsqueda;
- incluir una barra de progreso;
- actualizarse después de guardar;
- mostrar periodo actual.

### 9.2 Calidad definida por el usuario

Al abrir una búsqueda:

- no imponer filtros de contacto automáticamente;
- permitir que el usuario elija teléfono, correo o ambos;
- aplicar los filtros también al flujo “Guardar filtrados”;
- permitir filtros adicionales de sitio web, actividad, ubicación y estrato;
- volver a validar en backend que cada registro tenga al menos correo o teléfono.

El usuario puede explorar todos los resultados y decide la calidad del lote antes de guardarlo.

### 9.3 Estimación antes de guardar

Antes de confirmar:

> Se estiman 800 prospectos nuevos que cumplen el criterio. La operación consumiría 800 créditos. Tienes 900 créditos disponibles.

Cuando excede el saldo:

> Se estiman 800 prospectos nuevos, pero sólo hay 500 créditos disponibles. Se guardarán hasta 500 y el resto se omitirá.

La UI debe usar lenguaje de estimación hasta recibir la respuesta final.

### 9.4 Advertencias

- 80%: informativa;
- 90%: advertencia visible;
- 100%: bloqueo de guardado con CTA comercial.

Ejemplos:

```text
Has utilizado el 80% de tus créditos de prospección.
```

```text
Te quedan 900 créditos de prospección este mes.
```

```text
Agotaste tus créditos de prospección. Solicita un paquete adicional o cambia de plan.
```

### 9.5 Estados de la operación

Mostrar:

- estimando;
- guardando;
- guardado parcial;
- guardado completo;
- sin elegibles;
- sólo duplicados;
- saldo agotado;
- error reintentable.

El resultado final debe distinguir claramente:

- seleccionados;
- sin contacto requerido;
- duplicados;
- guardados;
- omitidos por límite;
- créditos consumidos.

---

## 10. Límite de resultados crudos

### 10.1 Momento de medición

El consumo técnico debe registrarse al persistir resultados DENUE nuevos.

No debe sumar:

- filas repetidas que el upsert no crea;
- reintentos del mismo lote;
- resultados rechazados antes de persistencia.

### 10.2 Enforcement

Antes de iniciar o continuar un job:

1. calcular saldo técnico;
2. limitar el siguiente lote;
3. persistir sólo lo permitido;
4. actualizar consumo de forma transaccional;
5. marcar el job como `completed_with_limit` si se alcanza el máximo.

### 10.3 UX

Este límite puede presentarse como uso técnico o política de uso justo.

No debe confundirse con créditos comerciales:

- resultados crudos: capacidad de exploración/procesamiento;
- créditos: prospectos nuevos guardados.

### 10.4 Riesgo comercial

El rendimiento de contacto cambia por giro y región. Antes de bloquear estrictamente en 50,000:

- medir rendimiento por tenant;
- medir porcentaje contactable;
- medir porcentaje deduplicado;
- evaluar qué combinaciones de filtros usan los tenants y su impacto técnico;
- considerar advertencia o soft limit antes de hard limit.

---

## 11. Validaciones independientes

### 11.1 Regla

Guardar un prospecto no implica validar automáticamente:

- correo;
- teléfono;
- sitio web.

### 11.2 Consumo

Cada verificación debe:

1. resolver su entitlement;
2. detectar si ya existe una verificación vigente;
3. aplicar regla de reintento;
4. reservar cuota;
5. ejecutar proveedor;
6. registrar resultado y consumo.

### 11.3 Reintentos

Debe definirse por proveedor:

- error técnico antes de llamar al proveedor: 0 consumo;
- llamada facturable completada: puede consumir aunque el dato resulte inválido;
- reconsulta solicitada: puede consumir una nueva unidad;
- repetición idempotente: 0 consumo adicional.

Este detalle se implementará en un plan complementario de validaciones.

---

## 12. Seguridad

### 12.1 Estado requerido

La funcionalidad no se considera segura hasta que el enforcement sea backend/DB.

### 12.2 Reglas

- resolver tenant desde usuario autenticado;
- validar ownership de todos los `resultado_ids`;
- no aceptar `tenant_id`, límite, consumo o modo desde el frontend de prospección;
- aplicar RLS a tablas de política, periodos y ledger;
- restringir escrituras directas al ledger;
- permitir consumo únicamente mediante función controlada;
- proteger funciones con `search_path` explícito;
- revisar `SECURITY DEFINER` y revocar ejecución pública;
- usar service role sólo donde sea imprescindible;
- no registrar correo, teléfono o payloads completos en logs comerciales;
- auditar cambios administrativos de política y overrides;
- validar que los endpoints administrativos requieran plataforma/admin.

### 12.3 RLS

Política conceptual:

- usuarios del tenant pueden leer su resumen agregado si tienen permiso;
- sólo administradores autorizados pueden modificar la política;
- ningún usuario normal puede insertar o actualizar ledger/periodos directamente;
- workers/backend pueden operar con el contexto controlado requerido;
- plataforma puede auditar todos los tenants mediante rutas administrativas protegidas.

### 12.4 Concurrencia y abuso

Probar:

- dos guardados simultáneos con saldo insuficiente para ambos;
- reenvío de `operation_id`;
- IDs mezclados de otro tenant;
- modificación del modo durante una operación;
- job DENUE reintentado;
- intentos de escribir directamente al ledger.

---

## 13. Observabilidad y reportes

### 13.1 Métricas

Registrar sin PII:

- búsquedas ejecutadas;
- resultados crudos persistidos;
- resultados con contacto;
- resultados elegibles por modo;
- duplicados de lote;
- duplicados del tenant;
- prospectos nuevos guardados;
- créditos consumidos;
- operaciones parciales;
- operaciones bloqueadas por cuota;
- rendimiento crudo → elegible → nuevo.

### 13.2 Logs

Eventos sugeridos:

```text
prospeccion.usage_resolved
prospeccion.save_estimated
prospeccion.credits_consumed
prospeccion.save_partially_limited
prospeccion.credits_exhausted
prospeccion.operation_replayed
prospeccion.raw_limit_reached
prospeccion.usage_reconciliation_mismatch
```

No incluir:

- token DENUE;
- Authorization headers;
- correos;
- teléfonos;
- respuesta completa del proveedor.

### 13.3 Reconciliación

Crear una tarea operativa que compare:

- contador del periodo;
- suma del ledger.

Si hay diferencia:

- emitir alerta;
- no corregir silenciosamente;
- registrar investigación y ajuste mediante movimiento auditable.

---

## 14. Migración y despliegue progresivo

### Fase 0: medición en sombra

- instrumentar el funnel actual;
- calcular elegibles según los cuatro modos;
- medir duplicación y rendimiento por tenant;
- no bloquear;
- validar si 9,000 y 50,000 son adecuados.

### Fase 1: esquema comercial

- crear `tenant_prospeccion_policies`;
- crear `tenant_prospeccion_usage_periods`;
- crear `tenant_prospeccion_credit_ledger`;
- agregar constraints, índices y RLS;
- configurar entitlements;
- crear default `any`;
- backfill de tenants existentes.

### Fase 2: resolución de runtime

- implementar resolución de plan, override y periodo;
- implementar resumen de consumo;
- agregar pruebas de precedencia;
- manejar tenants internos y sin plan.

### Fase 3: guardado transaccional

- implementar RPC atómica;
- integrar deduplicación;
- agregar `operation_id`;
- devolver desglose;
- probar concurrencia e idempotencia;
- mantener feature flag sin enforcement inicialmente.

### Fase 4: administración

- agregar política y consumo a `/settings/tenants/[tenantId]`;
- mostrar plan, override y periodo;
- proteger edición por permisos;
- registrar auditoría.

### Fase 5: UX DENUE

- mostrar tarjeta de consumo;
- alinear filtros con el criterio;
- implementar estimación;
- mostrar confirmación;
- mostrar resultado final y guardado parcial;
- agregar alertas 80/90/100.

### Fase 6: enforcement

- activar primero en un tenant controlado;
- ejecutar matriz positiva y negativa;
- revisar métricas;
- activar Starter;
- activar progresivamente otros planes;
- documentar rollback.

### Fase 7: límite crudo y validaciones

- activar medición de resultados crudos;
- decidir soft limit u hard limit;
- implementar cuotas independientes de validación;
- conectar paquetes adicionales o upgrades con Stripe.

---

## 15. Estrategia de pruebas

### 15.1 Matriz de contacto

| Datos | Resultado backend |
|---|---:|
| Sólo teléfono | guarda |
| Sólo correo | guarda |
| Ambos | guarda |
| Ninguno | omite |

Cada fila guardada consume exactamente 1 crédito.

### 15.2 Deduplicación

- duplicado dentro del mismo request;
- mismo external ID;
- mismo correo normalizado;
- mismo teléfono normalizado;
- prospecto ya existente;
- duplicado enviado por dos usuarios concurrentes;
- mismo resultado en búsquedas distintas.

Todos deben consumir como máximo un crédito por prospecto nuevo real.

### 15.3 Cuota

- saldo exacto;
- saldo mayor al lote;
- saldo menor al lote;
- saldo cero;
- cambio de periodo;
- override vigente;
- override vencido;
- tenant sin entitlement;
- tenant interno;
- dos solicitudes concurrentes.

### 15.4 Idempotencia

- repetir mismo `operation_id`;
- mismo `operation_id` con payload distinto;
- timeout después del commit;
- retry del proxy Next.js;
- retry del usuario;
- retry del worker.

### 15.5 Seguridad

- usuario sin permiso;
- resultado de otro tenant;
- manipulación de headers;
- lectura de ledger de otro tenant;
- escritura directa al ledger;
- función RPC invocada sin contexto válido;
- respuesta sin datos sensibles.

### 15.6 Frontend

- estados de carga, vacío y error;
- criterio visible;
- estimación visible;
- alertas 80/90/100;
- parcial por límite;
- actualización de saldo después de guardar;
- mensajes claros en móvil y escritorio.

---

## 16. Rollback

El despliegue debe incluir feature flags:

```text
prospeccion_credits_measurement_enabled
prospeccion_credits_enforcement_enabled
prospeccion_raw_limit_enforcement_enabled
```

Rollback recomendado:

1. desactivar enforcement;
2. mantener medición y ledger;
3. no borrar movimientos;
4. restaurar temporalmente el guardado anterior;
5. reconciliar cualquier operación parcial;
6. corregir antes de reactivar.

Nunca:

- borrar ledger para “reiniciar” consumo;
- reducir contadores manualmente sin movimiento de reversa;
- deshabilitar RLS como solución operativa.

---

## 17. Archivos y áreas previstas

### Base de datos

```text
supabase/migrations/
```

Áreas:

- tablas;
- constraints;
- índices;
- RLS;
- RPC transaccional;
- seeds de entitlements;
- backfill de políticas.

### Backend

```text
backend/app/api/routes/crm.py
backend/app/api/routes/admin.py
backend/app/repositories/
backend/app/services/
backend/app/schemas/
backend/tests/
```

### Frontend

```text
frontend/panel/src/app/prospeccion/denue-busqueda/
frontend/panel/src/app/settings/tenants/[tenantId]/
frontend/panel/src/app/settings/commercial-plans/
frontend/panel/src/lib/prospeccion/
```

Los archivos finales deben ajustarse a patrones existentes y evitar componentes o servicios monolíticos.

---

## 18. Criterio de terminado

La implementación se considera terminada cuando:

- Starter tiene `9,000` créditos configurados;
- el criterio por tenant está persistido en columnas explícitas;
- los cuatro modos cumplen la matriz definida;
- cada prospecto nuevo consume exactamente 1 crédito;
- duplicados consumen 0;
- registros no guardados consumen 0;
- la operación es transaccional;
- la concurrencia no permite exceder el límite;
- los reintentos son idempotentes;
- el ledger y el contador concilian;
- el frontend muestra límite, consumo, saldo y criterio;
- la estimación se distingue del resultado final;
- el tenant no puede leer o afectar consumo ajeno;
- existen pruebas backend, SQL y frontend;
- se validó una operación real controlada;
- se documentó el despliegue y rollback;
- Stripe/planes pueden resolver el entitlement sin depender de `organizaciones.config`.

---

## 19. Pendientes comerciales antes de activar cobro

Definir:

1. límites de Growth, Pro, Business y Enterprise;
2. precio y tamaño de paquetes adicionales;
3. si los créditos no utilizados vencen o se acumulan;
4. zona horaria y fecha de corte del periodo;
5. comportamiento al cambiar de plan a mitad del periodo;
6. tratamiento de cancelaciones y reembolsos;
7. política de reversa si un prospecto se elimina;
8. soft limit u hard limit para resultados crudos;
9. cuotas iniciales de validación;
10. mensajes comerciales exactos para checkout y pricing.

Recomendaciones iniciales:

- no acumular créditos entre meses en Starter;
- usar el periodo de billing de Stripe cuando exista;
- usar periodo calendario sólo para tenants internos o manuales;
- no devolver automáticamente un crédito por borrar un prospecto;
- realizar ajustes mediante movimientos de reversa auditables;
- permitir paquetes adicionales sin cambiar el plan base.

---

## 20. Decisión final

TalIA controlará la prospección DENUE mediante créditos mensuales.

La regla base será:

> **Un prospecto nuevo, único, elegible y guardado correctamente consume un crédito.**

El tenant podrá elegir el requisito mínimo:

- correo o teléfono;
- teléfono;
- correo;
- correo y teléfono.

El modo modifica la elegibilidad, no el precio del mismo registro.

Los resultados crudos, duplicados, registros rechazados, consultas y reintentos idempotentes no consumen créditos comerciales.

Las validaciones de teléfono, correo y sitio web tendrán cuotas independientes.

El enforcement será:

- tenant-scoped;
- resuelto desde planes y overrides;
- ejecutado en backend y PostgreSQL;
- transaccional;
- concurrente e idempotente;
- auditable mediante ledger;
- visible y comprensible desde el panel.
