# Mapa de migración tabla por tabla

Fecha: 2026-04-11 (UTC)
Estado: Borrador técnico

## 1. Objetivo

Definir la migración gradual desde el modelo actual hacia una estructura separada de:

- `personas`
- `cuenta_direcciones`
- `cuentas`
- `cuenta_personas`
- `direcciones`

sin romper el CRM actual ni perder datos.

Este documento aterriza el plan general y especifica:

- qué columnas actuales se conservan
- qué columnas se mueven
- qué columnas se derivan
- qué entidades nuevas se crean
- cómo convivir temporalmente con el esquema viejo

## 2. Principio de migración

No se hará una sustitución total en un solo paso.

La estrategia correcta es:

1. Crear el nuevo modelo.
2. Escribir en viejo y nuevo durante una transición controlada.
3. Leer con compatibilidad hacia atrás.
4. Migrar histórico.
5. Retirar columnas redundantes.

## 3. Estado actual del CRM

### 3.1 `contactos`

Hoy esta tabla mezcla:

- identidad de persona
- datos de empresa
- datos fiscales
- dirección
- vínculo con empresa

### 3.2 `cuentas`

Hoy esta tabla ya representa la empresa o entidad comercial/fiscal, pero todavía conviene limpiarla y hacerla más explícita.

### 3.3 Relaciones directas existentes

- `contactos.cuenta_id -> cuentas.id`

No existe una tabla intermedia hoy.

## 4. Nuevo modelo objetivo

### 4.1 `personas`

Fuente de verdad para la identidad humana.

### 4.2 `cuentas`

Fuente de verdad para la entidad comercial/fiscal.

### 4.3 `cuenta_personas`

Relación entre personas y cuentas.

### 4.4 `direcciones`

Entidad reutilizable para no repetir direcciones.

### 4.5 `cuenta_direcciones`

Relación entre cuentas y direcciones.

## 5. Mapeo de columnas actual -> destino

## 5.1 `contactos` -> `personas`

Estas columnas deben vivir en `personas`:

- `id`
- `organizacion_id`
- `nombre_nombres`
- `apellido_paterno`
- `apellido_materno`
- `nombre_completo`
- `correo`
- `email` si se usa como alias del principal
- `telefono_e164`
- `telefono` si existe como alias operativo
- `puesto`
- `area`
- `rol_decision`
- `origen`
- `notes`
- `notas`
- `estado`
- `propietario_usuario_id`
- `contacto_datos` si se conserva como metadata humana
- `creado_en`
- `actualizado_en` si aplica

### Regla

La persona no debe cargar datos fiscales ni datos de cuenta.
- `nombre_completo` debe seguir existiendo, pero como campo derivado o materializado.
- `puesto` en `personas` representa el puesto general o habitual de la persona.

## 5.2 `contactos` -> `cuentas`

Estas columnas deben vivir en `cuentas`:

- `persona_fisica_moral`
- `razon_social`
- `rfc`
- `uso_cfdi`
- `metodo_pago`
- `forma_pago`
- `email_facturacion`
- `tipo_industria`
- `tamano`
- `company_name`
- `website`
- `tipo_establecimiento`
- dirección completa:
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
  - `tipo_centro_comercial`
  - `corredor_industrial`
  - `numero_local`
  - `codigo_postal`
  - `clave_entidad`
  - `entidad`
  - `clave_municipio`
  - `municipio`
  - `clave_localidad`
  - `localidad`
  - `pais`
  - `latitud`
  - `longitud`

### Regla

Todo lo fiscal/comercial debe vivir en la cuenta, no en la persona.
- `persona_fisica_moral` no debe quedarse en `personas`; pertenece a la clasificación de la cuenta.
- La dirección no debe quedar anclada solo a dos columnas fijas; el diseño final debe ir hacia `cuenta_direcciones`.

## 5.3 `contactos.cuenta_id` -> `cuenta_personas`

La relación actual no desaparece, se transforma.

### Mapeo

- `contactos.cuenta_id` -> `cuenta_personas.cuenta_id`
- `contactos` -> `personas`

### Campos de relación sugeridos

- `cuenta_id`
- `persona_id`
- `rol_en_cuenta`
- `rol_catalogo_id`
- `puesto`
- `es_contacto_principal`
- `es_contacto_facturacion`
- `es_representante_legal`
- `activo`
- `fecha_inicio`
- `fecha_fin`
- `notas`

Regla:

- `rol_en_cuenta` debe ser texto flexible, no un `check` rígido.
- `puesto` aquí es el puesto específico de esa persona dentro de esa cuenta.

## 5.4 `contactos` -> campos derivados o calculados

Estos campos no deberían ser fuente de verdad en el modelo nuevo:

- `nombre_completo` puede derivarse de nombres y apellidos.
- `company_name` puede derivarse de la cuenta.
- `persona_fisica_moral` puede quedar en `cuentas` o como indicador de clasificación de la cuenta.

## 6. Mapeo de `cuentas`

La tabla `cuentas` debería quedar como el núcleo comercial/fiscal.

### 6.1 Campos que se conservan y limpian

- `id`
- `organizacion_id`
- `nombre`
- `alias`
- `tipo`
- `industria`
- `tamano`
- `sitio_web`
- `telefono`
- `correo`
- `direccion`
- `propietario_usuario_id`
- `metadata`
- `creado_en`
- `actualizado_en`

### 6.2 Campos que conviene agregar

- `tipo_persona`
- `razon_social`
- `nombre_comercial`
- `segmento`
- `subindustria`
- `estado`

### 6.3 Campos que conviene dejar de duplicar

- `email` / `correo`
- `website` / `sitio_web`
- teléfonos repetidos sin criterio

## 7. Tabla nueva `personas`

### 7.1 Campos mínimos

- `id`
- `organizacion_id`
- `nombre`
- `apellido_paterno`
- `apellido_materno`
- `nombre_completo`
- `correo_principal`
- `telefono_principal_e164`
- `puesto`
- `area`
- `rol_decision`
- `estado`
- `origen`
- `notas`
- `metadata`
- `propietario_usuario_id`
- `creado_en`
- `actualizado_en`

### 7.2 Datos que no deben entrar aquí

- RFC
- razón social
- uso CFDI
- método de pago
- forma de pago
- dirección fiscal
- sitio web de empresa

## 8. Tabla nueva `cuenta_personas`

### 8.1 Función

Resolver la relación real entre persona y cuenta.

### 8.2 Campos mínimos

- `id`
- `organizacion_id`
- `cuenta_id`
- `persona_id`
- `rol_en_cuenta`
- `puesto`
- `es_contacto_principal`
- `es_contacto_facturacion`
- `es_representante_legal`
- `activo`
- `fecha_inicio`
- `fecha_fin`
- `notas`
- `creado_en`
- `actualizado_en`

### 8.3 Roles sugeridos

- `dueno`
- `representante_legal`
- `director`
- `compras`
- `facturacion`
- `operacion`
- `contacto_principal`
- `asistente`
- `otro`

## 9. Tabla nueva `direcciones`

### 9.1 Función

Normalizar direcciones para persona o cuenta sin repetir columnas en múltiples tablas.

### 9.2 Uso recomendado

- una cuenta puede tener dirección fiscal
- una cuenta puede tener dirección operativa
- una persona podría tener dirección principal si hiciera falta

### 9.3 Campos mínimos

- `id`
- `organizacion_id`
- `tipo`
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
- `numero_interior`
- `letra_exterior`
- `letra_interior`
- `edificio`
- `edificio_piso`
- `tipo_asentamiento`
- `nombre_asentamiento`
- `tipo_centro_comercial`
- `corredor_industrial`
- `numero_local`
- `codigo_postal`
- `latitud`
- `longitud`
- `metadata`
- `creado_en`

Esta tabla es la base reusable. La limitación a `direccion_fiscal_id` y `direccion_operativa_id` en `cuentas` solo sería temporal.

## 10. Reglas de migración por caso

## 10.1 Contacto existente con empresa clara

Ejemplo:

- `contactos.nombre_completo = "Ana Soto"`
- `contactos.cuenta_id = ...`

Migración:

- crear `persona`
- asegurar `cuenta`
- crear `cuenta_personas`

## 10.2 Persona física con actividad empresarial

Ejemplo:

- `persona_fisica_moral = fisica`
- la persona y la empresa están muy ligadas

Migración:

- crear `persona`
- crear `cuenta`
- ligar con `cuenta_personas`
- marcar rol `dueno` o `representante_legal`

## 10.3 Contacto sin empresa definida

Migración:

- crear solo `persona`
- no forzar cuenta
- permitir vínculo posterior

## 11. Orden recomendado de implementación

### Paso 1. Crear nuevas tablas

- `personas`
- `cuenta_direcciones`
- `cuenta_personas`
- `direcciones`

### Paso 2. Crear triggers o lógica de escritura dual

- alta de contacto -> persona
- alta de cuenta -> cuenta
- vínculo -> cuenta_personas

### Paso 3. Crear vistas de compatibilidad

Ejemplos:

- `v_contactos_compat`
- `v_cuentas_compat`

### Paso 4. Definir deduplicación antes del backfill

- Personas:
  - match fuerte por teléfono
  - match fuerte por correo
  - match débil por nombre + organización
- Cuentas:
  - match fuerte por RFC
  - match medio por razón social
  - match débil por nombre comercial

### Paso 5. Backfill histórico

- migrar contactos existentes
- migrar cuentas que ya existan
- generar relaciones pivote

### Paso 6. Cambiar frontend y backend a leer el nuevo modelo

### Paso 7. Retirar columnas duplicadas

## 13. Compatibilidad temporal

Durante la transición:

- `contactos` puede seguir existiendo
- el frontend puede seguir usando el shape actual
- el backend puede traducir entre el modelo nuevo y el viejo

Esto evita romper:

- formularios
- listados
- búsquedas
- reportes
- permisos

## 14. Riesgos

### Riesgo 1. Duplicar datos

Mitigación:

- escritura dual
- backfill idempotente
- validaciones de unicidad

### Riesgo 2. Perder compatibilidad con pantallas existentes

Mitigación:

- vistas adaptadoras
- endpoints puente
- migración por capas

### Riesgo 3. Mezclar criterio de persona con empresa otra vez

Mitigación:

- regla estricta de dominio:
  - persona = humano
  - cuenta = negocio
  - pivote = relación

## 14. Criterio de éxito

La migración será correcta si el CRM puede representar:

- una persona con una sola empresa
- una persona con varias empresas
- una empresa con muchos contactos
- una persona física con actividad empresarial
- un contacto sin empresa todavía

sin repetir campos ni confundir identidad humana con entidad fiscal.

## 15. Siguiente documento recomendado

El siguiente paso debe ser un plan de migración técnica con:

- migración SQL por fase
- triggers
- vistas de compatibilidad
- backfill
- validaciones
- plan de rollback
