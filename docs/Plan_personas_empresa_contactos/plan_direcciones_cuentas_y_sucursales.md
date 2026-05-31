# Plan de direcciones de cuentas y sucursales

Fecha: 2026-05-31 (UTC)
Estado: Propuesta técnica

## 1. Problema a resolver

La tabla `cuentas` hoy concentra campos de dirección que sirven como base operativa/fiscal, pero el negocio requiere distinguir al menos estas piezas:

1. Dirección fiscal.
2. Dirección principal de la empresa.
3. Una o más sucursales.

El riesgo de seguir con un solo bloque de dirección en `cuentas` es que:

- la dirección fiscal y la operativa se mezclen
- una empresa con varias sucursales quede forzada a un solo domicilio
- el formulario de alta/edición se vuelva ambiguo
- el backend siga duplicando lógica para decidir qué dirección “vale”

## 2. Decisión de arquitectura

La decisión propuesta es:

- mantener los campos de dirección actuales en `cuentas` por compatibilidad
- introducir `direcciones` como entidad reutilizable
- usar `cuenta_direcciones` como pivote canónica para asociar varias direcciones a una cuenta
- reservar una dirección fiscal única por cuenta
- permitir una dirección principal de empresa y múltiples sucursales
- no guardar los campos de dirección de negocio en `metadata`; deben existir como columnas explícitas

## 3. Qué hacemos con los campos actuales de `cuentas`

Los campos de dirección existentes en `cuentas` no se eliminan de inmediato.

Se conservan como:

- compatibilidad hacia atrás
- representación fiscal legacy
- respaldo para módulos que todavía no migran a `cuenta_direcciones`

### 3.1 Campos a conservar temporalmente

Los siguientes campos siguen existiendo en `cuentas` mientras dura la migración:

- `direccion`
- `pais`
- `clave_entidad`
- `entidad`
- `clave_municipio`
- `municipio`
- `clave_localidad`
- `localidad`
- `tipo_vialidad`
- `nombre_vialidad`
- `numero_exterior`
- `letra_exterior`
- `edificio`
- `edificio_piso`
- `numero_interior`
- `letra_interior`
- `tipo_asentamiento`
- `nombre_asentamiento`
- `colonia`
- `tipo_centro_comercial`
- `corredor_industrial`
- `numero_local`
- `codigo_postal`
- `latitud`
- `longitud`
- `tipo_establecimiento`

### 3.2 Regla de uso temporal

Durante la transición:

- si la cuenta tiene una sola dirección capturada hoy, esa dirección puede seguir en `cuentas`
- al mismo tiempo debe materializarse en `cuenta_direcciones`
- el frontend debe leer la dirección principal desde la nueva estructura cuando esté disponible
- si todavía no está migrada, puede leer el fallback de `cuentas`

## 4. Modelo objetivo

### 4.1 `direcciones`

Entidad reutilizable para cualquier dirección.

Uso:

- almacena el bloque estructurado de domicilio
- puede reutilizarse por cuenta, contacto o futuros módulos
- los datos de dirección deben existir como columnas explícitas, no como JSON en `metadata`
- `colonia` es el campo canónico; `nombre_asentamiento` queda como compatibilidad/alias durante la transición

### 4.2 `cuenta_direcciones`

Pivote entre cuenta y dirección.

Uso:

- `fiscal`
- `principal`
- `sucursal`

Compatibilidad temporal:

- `operativa` se mantiene como alias interno solo mientras termina la migración
- la combinación fiscal + principal no necesita un cuarto tipo; puede representarse con la misma `direccion_id` ligada dos veces, una como `fiscal` y otra como `principal`

Regla:

- una sola dirección fiscal activa por cuenta
- una dirección principal de empresa
- n sucursales

### 4.3 `cuentas`

Sigue siendo la entidad comercial/fiscal principal, pero ya no debe ser la única fuente para domicilios.

Uso:

- conservar compatibilidad
- exponer la dirección fiscal legacy mientras se migra
- no crecer con más campos de sucursales

## 5. Estrategia de migración

### Fase 1. Esquema

- confirmar/ajustar `direcciones`
- confirmar/ajustar `cuenta_direcciones`
- agregar índices y restricción para una sola fiscal activa por cuenta

### Fase 2. Backfill

- copiar la dirección actual de `cuentas` a `direcciones`
- crear la relación correspondiente en `cuenta_direcciones` con tipo `fiscal`
- si la cuenta ya tiene una dirección operativa distinta, crear un segundo registro tipo `principal`

### Fase 3. Backend

- `POST /cuentas`
  - aceptar dirección fiscal
  - aceptar dirección principal de empresa
- `PATCH /cuentas/{id}`
  - permitir editar fiscal y principal por separado
- endpoints de `cuenta_direcciones`
  - administrar sucursales

### Fase 4. UI

- alta/edición de empresa con dos bloques:
  - `Datos fiscales`
  - `Dirección de la empresa`
- ficha de empresa con bloque de direcciones y sucursales
- listado sin ruido fiscal

### Fase 5. Retiro gradual

- mantener `cuentas` como fallback por un tiempo
- cuando el consumo real esté migrado, deprecar los campos de dirección legacy
- no eliminar columnas hasta cerrar compatibilidad

## 6. Decisión práctica recomendada

Si una empresa tiene hoy una sola dirección capturada:

- esa dirección debe tratarse como fiscal en la compatibilidad legacy
- el usuario debe poder capturar una dirección principal distinta

Si una empresa tiene sucursales:

- esas sucursales viven únicamente en `cuenta_direcciones`

Si fiscal y principal son iguales:

- la UI debe permitir copiar valores
- la persistencia puede guardar dos registros lógicos distintos o una relación explícita de reutilización, según el diseño final del backend

## 7. Riesgos si no se hace así

- seguir duplicando datos en `cuentas`
- confundir facturación con operación
- romper el historial cuando una empresa cambie de domicilio
- limitar el CRM a una sola dirección por empresa

## 8. Fase de deprecación y eliminación final

Los campos de dirección en `cuentas` solo deben eliminarse al final del proceso, nunca antes.

### 8.1 Criterios para poder borrarlos

Se puede iniciar la eliminación final cuando se cumpla todo esto:

- el backfill histórico está completo
- `direcciones` y `cuenta_direcciones` son la fuente real de lectura
- el panel ya no necesita los campos legacy para crear, editar ni listar
- exports y reportes ya consumen el nuevo modelo
- no existen dependencias activas en integraciones o procesos batch

### 8.2 Secuencia recomendada

1. Desplegar compatibilidad dual.
2. Migrar lectura a la nueva estructura.
3. Verificar resultados en producción con un periodo de observación.
4. Marcar columnas legacy como obsoletas en documentación y código.
5. Eliminar columnas de dirección en `cuentas` solo cuando la compatibilidad residual esté cerrada.

### 8.3 Columnas candidatas a eliminación final

Las columnas a retirar al final del refactor son las de domicilio legacy de `cuentas`:

- `direccion`
- `pais`
- `clave_entidad`
- `entidad`
- `clave_municipio`
- `municipio`
- `clave_localidad`
- `localidad`
- `tipo_vialidad`
- `nombre_vialidad`
- `numero_exterior`
- `letra_exterior`
- `edificio`
- `edificio_piso`
- `numero_interior`
- `letra_interior`
- `tipo_asentamiento`
- `nombre_asentamiento`
- `colonia`
- `tipo_centro_comercial`
- `corredor_industrial`
- `numero_local`
- `codigo_postal`
- `latitud`
- `longitud`
- `tipo_establecimiento`

## 9. Siguiente paso de implementación

Antes de tocar UI, definir:

1. qué campos exactos de `cuentas` se consideran legacy
2. cuál será el payload nuevo de alta/edición
3. cómo se representará la dirección fiscal vs la principal en backend
4. cómo se crea la sucursal desde la ficha de empresa

## 10. Checklist de implementación ordenado

La ejecución debe seguir este orden:

1. Base de datos.
2. Backend.
3. UI.

### 10.1 Base de datos

#### 10.1.1 Crear tablas nuevas

- [x] Confirmar/crear `direcciones` con columnas explícitas
- [x] Confirmar/crear `cuenta_direcciones` con columnas explícitas
- [x] Definir tipos válidos de `tipo_relacion` como `fiscal`, `principal` y `sucursal`
- [x] Eliminar `operativa` como valor canónico del backend y dejarlo solo como alias temporal de lectura
- [x] Definir restricción de una sola dirección fiscal activa por cuenta
- [x] Definir índices por `cuenta_id`, `direccion_id`, `tipo_relacion` y `activo`

#### 10.1.2 Campos explícitos esperados en `direcciones`

- [ ] `pais`
- [ ] `clave_entidad`
- [ ] `entidad`
- [ ] `clave_municipio`
- [ ] `municipio`
- [ ] `clave_localidad`
- [ ] `localidad`
- [ ] `tipo_vialidad`
- [ ] `nombre_vialidad`
- [ ] `numero_exterior`
- [ ] `letra_exterior`
- [ ] `edificio`
- [ ] `edificio_piso`
- [ ] `numero_interior`
- [ ] `letra_interior`
- [ ] `tipo_asentamiento`
- [ ] `nombre_asentamiento`
- [ ] `tipo_centro_comercial`
- [ ] `corredor_industrial`
- [ ] `numero_local`
- [ ] `codigo_postal`
- [ ] `latitud`
- [ ] `longitud`

#### 10.1.3 Backfill

- [x] Identificar todas las cuentas con dirección legacy cargada
- [x] Diseñar el criterio para decidir si la dirección legacy representa fiscal, principal o ambas
- [x] Preparar script de backfill de `cuentas` hacia `direcciones`
- [x] Preparar script de backfill de `cuentas` hacia `cuenta_direcciones`
- [x] Validar que el backfill preserve `pais`, `entidad`, `municipio`, `codigo_postal` y geolocalización si existe
- [x] Validar que cada cuenta quede con exactamente una fiscal activa

> Nota de ejecución:
> La migracion `20260531_010000_direcciones_cuentas_backfill_phase1.sql` ya fue aplicada en Supabase y materializa las direcciones fiscales legacy en `direcciones` y `cuenta_direcciones`.

### 10.2 Backend

- [x] Extender los modelos de cuenta para exponer `direccion_fiscal`, `direccion_principal` y `direcciones`
- [x] Exponer `colonia` como campo canónico en `direcciones` y mapear `nombre_asentamiento` solo como alias de compatibilidad
- [x] Ajustar `POST /cuentas` para aceptar dirección fiscal y dirección principal
- [x] Ajustar `PATCH /cuentas/{id}` para editar ambos bloques por separado
- [x] Mantener compatibilidad con el payload legacy mientras dura la migración
- [x] Ajustar `GET /cuentas/{id}` para devolver la estructura nueva
- [x] Ajustar `GET /cuentas/{id}/direcciones` para listar fiscal, principal y sucursales
- [x] Ajustar `POST /cuentas/{id}/direcciones` para crear sucursales
- [x] Ajustar `PATCH /cuentas/{id}/direcciones/{relacion_id}` para edición de sucursales
- [x] Ajustar `DELETE /cuentas/{id}/direcciones/{relacion_id}` para baja lógica o física según el modelo final
- [x] Mantener escritura dual solo mientras exista compatibilidad

### 10.3 UI

- [x] Separar el formulario de alta/edición en `Datos fiscales` y `Dirección de la empresa`
- [x] Capturar `colonia` de forma explícita en la dirección de la empresa y mostrarla en detalle/listado donde aplique
- [x] Agregar una opción para copiar datos de fiscal a principal cuando sean iguales
- [x] Mostrar las sucursales en la ficha de empresa
- [ ] Mantener la vista de listado leyendo solo lo necesario para no añadir latencia
- [ ] Evitar que la UI dependa de los campos legacy una vez que el backend nuevo esté listo

### 10.4 Verificación y corte

- [ ] Validar que no hay datos perdidos después del backfill
- [ ] Validar que la edición de dirección fiscal no rompe la dirección operativa
- [ ] Validar que la creación de sucursales funciona con permisos correctos
- [ ] Validar que los listados de empresas siguen rápidos
- [ ] Marcar columnas legacy como obsoletas en documentación y código
- [ ] Programar la eliminación final de columnas legacy de `cuentas`

### 10.5 Eliminación final

- [ ] Retirar campos de dirección legacy de `cuentas`
- [ ] Dejar `cuenta_direcciones` y `direcciones` como fuente de verdad
- [ ] Limpiar código muerto relacionado con los fallbacks
- [ ] Actualizar documentación final del dominio de direcciones

## 11. Criterio de salida

Este anexo se considera completo cuando:

- la cuenta puede tener dirección fiscal, dirección principal y múltiples sucursales
- la UI permite capturar y editar esas piezas sin ambigüedad
- el backend no depende del bloque legacy para operar
- los campos de dirección en `cuentas` pueden eliminarse sin pérdida funcional ni de datos
