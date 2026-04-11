# Esquema exacto de tablas nuevas

Fecha: 2026-04-11 (UTC)
Estado: Borrador técnico

## 1. Objetivo

Definir el esquema base para migrar el CRM hacia un modelo separado de:

- `personas`
- `cuentas`
- `cuenta_personas`
- `direcciones`

La intención es que este documento se pueda convertir casi directo en migraciones SQL.

## 2. Convenciones

- Todas las tablas incluyen `organizacion_id`.
- Todas las tablas principales incluyen `creado_en` y `actualizado_en`.
- Las llaves primarias son `uuid`.
- Los campos libres usan `text`.
- Los metadatos extensibles usan `jsonb`.
- Los responsables usan FK compuesta por organización:
  - `(organizacion_id, propietario_usuario_id) references public.usuarios (organizacion_id, id)`

## 3. Tabla `personas`

### 3.1 Responsabilidad

Representa a la persona humana real.

### 3.2 Columnas

- `id uuid primary key default gen_random_uuid()`
- `organizacion_id uuid not null references public.organizaciones(id) on delete cascade`
- `nombre text not null`
- `apellido_paterno text`
- `apellido_materno text`
- `nombre_completo text not null`
- `correo_principal text`
- `telefono_principal_e164 text`
- `puesto text`
- `area text`
- `rol_decision text`
- `estado text not null default 'activo'`
- `origen text`
- `notas text`
- `metadata jsonb not null default '{}'::jsonb`
- `propietario_usuario_id uuid`
- `creado_en timestamptz not null default now()`
- `actualizado_en timestamptz not null default now()`

### 3.3 Restricciones sugeridas

- `check (estado in ('lead', 'activo', 'inactivo', 'bloqueado'))`
- `check (nombre <> '')`
- `check (nombre_completo <> '')`
- `foreign key (organizacion_id, propietario_usuario_id) references public.usuarios (organizacion_id, id) on delete set null`

### 3.4 Índices sugeridos

- `personas_org_idx on (organizacion_id)`
- `personas_org_owner_idx on (organizacion_id, propietario_usuario_id)`
- `personas_org_email_idx on (organizacion_id, lower(correo_principal)) where correo_principal is not null and btrim(correo_principal) <> ''`
- `personas_org_phone_idx on (organizacion_id, telefono_principal_e164) where telefono_principal_e164 is not null and btrim(telefono_principal_e164) <> ''`

### 3.5 Regla de uso

- Aquí no deben vivir datos fiscales ni de empresa.
- `nombre_completo` se mantiene almacenado para búsqueda y compatibilidad, pero debe considerarse derivado de `nombre`, `apellido_paterno` y `apellido_materno`.
- `puesto` en `personas` representa el puesto general o más habitual de la persona.

## 4. Tabla `cuentas`

### 4.1 Responsabilidad

Representa la entidad comercial o fiscal.

### 4.2 Columnas

- `id uuid primary key default gen_random_uuid()`
- `organizacion_id uuid not null references public.organizaciones(id) on delete cascade`
- `nombre_comercial text not null`
- `razon_social text`
- `alias text`
- `tipo_persona text not null`
- `tipo_cuenta text not null default 'empresa'`
- `rfc text`
- `industria text`
- `segmento text`
- `subindustria text`
- `tamano text`
- `sitio_web text`
- `telefono_principal text`
- `correo_principal text`
- `propietario_usuario_id uuid`
- `estado text not null default 'activo'`
- `notas text`
- `metadata jsonb not null default '{}'::jsonb`
- `creado_en timestamptz not null default now()`
- `actualizado_en timestamptz not null default now()`

### 4.3 Restricciones sugeridas

- `check (tipo_persona in ('fisica', 'moral'))`
- `check (tipo_cuenta in ('empresa', 'persona_fisica_actividad_empresarial', 'gobierno', 'proveedor', 'partner', 'cliente', 'prospecto', 'otro'))`
- `check (estado in ('lead', 'activo', 'inactivo', 'bloqueado'))`
- `foreign key (organizacion_id, propietario_usuario_id) references public.usuarios (organizacion_id, id) on delete set null`

### 4.4 Índices sugeridos

- `cuentas_org_idx on (organizacion_id)`
- `cuentas_org_owner_idx on (organizacion_id, propietario_usuario_id)`
- `cuentas_org_rfc_idx on (organizacion_id, upper(rfc)) where rfc is not null and btrim(rfc) <> ''`
- `cuentas_org_name_idx on (organizacion_id, lower(nombre_comercial))`
- `cuentas_org_email_idx on (organizacion_id, lower(correo_principal)) where correo_principal is not null and btrim(correo_principal) <> ''`

### 4.5 Regla de uso

- La empresa vive aquí, no en `personas`.
- `tipo_persona` describe la naturaleza fiscal/comercial de la cuenta.
- `tipo_cuenta` describe el rol comercial dentro del CRM.
- La tabla no debe asumir solo una o dos direcciones; eso se resolverá con `cuenta_direcciones`.

## 5. Tabla `cuenta_personas`

### 5.1 Responsabilidad

Resuelve la relación real entre una persona y una cuenta.

### 5.2 Columnas

- `id uuid primary key default gen_random_uuid()`
- `organizacion_id uuid not null references public.organizaciones(id) on delete cascade`
- `cuenta_id uuid not null references public.cuentas(id) on delete cascade`
- `persona_id uuid not null references public.personas(id) on delete cascade`
- `rol_en_cuenta text not null`
- `rol_catalogo_id uuid`
- `puesto text`
- `es_contacto_principal boolean not null default false`
- `es_contacto_facturacion boolean not null default false`
- `es_representante_legal boolean not null default false`
- `activo boolean not null default true`
- `fecha_inicio date`
- `fecha_fin date`
- `notas text`
- `metadata jsonb not null default '{}'::jsonb`
- `creado_en timestamptz not null default now()`
- `actualizado_en timestamptz not null default now()`

### 5.3 Restricciones sugeridas

- `check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)`

### 5.4 Índices sugeridos

- `cuenta_personas_org_idx on (organizacion_id)`
- `cuenta_personas_cuenta_idx on (organizacion_id, cuenta_id)`
- `cuenta_personas_persona_idx on (organizacion_id, persona_id)`
- `cuenta_personas_cuenta_persona_uidx on (cuenta_id, persona_id, rol_en_cuenta)`

### 5.5 Regla de uso

- Esta tabla es la pieza clave para soportar:
  - una persona en varias cuentas
  - una cuenta con varios contactos
  - personas físicas con actividad empresarial
  - cambios de empresa con historial
- `rol_en_cuenta` debe ser flexible y no cerrar la puerta a nuevos valores sin migración SQL.
- `puesto` aquí es el puesto específico de esa persona en esa cuenta.

## 6. Tabla `direcciones`

### 6.1 Responsabilidad

Guarda direcciones reutilizables para personas o cuentas.

### 6.2 Columnas

- `id uuid primary key default gen_random_uuid()`
- `organizacion_id uuid not null references public.organizaciones(id) on delete cascade`
- `tipo text not null`
- `pais text`
- `clave_entidad text`
- `entidad text`
- `clave_municipio text`
- `municipio text`
- `clave_localidad text`
- `localidad text`
- `tipo_vialidad text`
- `nombre_vialidad text`
- `numero_exterior text`
- `letra_exterior text`
- `edificio text`
- `edificio_piso text`
- `numero_interior text`
- `letra_interior text`
- `tipo_asentamiento text`
- `nombre_asentamiento text`
- `tipo_centro_comercial text`
- `corredor_industrial text`
- `numero_local text`
- `codigo_postal text`
- `latitud numeric(10,7)`
- `longitud numeric(10,7)`
- `metadata jsonb not null default '{}'::jsonb`
- `creado_en timestamptz not null default now()`
- `actualizado_en timestamptz not null default now()`

### 6.3 Restricciones sugeridas

- `check (tipo in ('fiscal', 'operativa', 'facturacion', 'envio', 'personal', 'otro'))`

### 6.4 Índices sugeridos

- `direcciones_org_idx on (organizacion_id)`
- `direcciones_org_tipo_idx on (organizacion_id, tipo)`
- `direcciones_org_cp_idx on (organizacion_id, codigo_postal) where codigo_postal is not null and btrim(codigo_postal) <> ''`

### 6.5 Regla de uso

- No conviene limitar `cuentas` a solo `direccion_fiscal_id` y `direccion_operativa_id` porque eso se queda corto para sucursales, domicilios históricos y múltiples ubicaciones.
- La relación correcta es una pivote:
  - `cuenta_direcciones`
  - `cuenta_id`
  - `direccion_id`
  - `tipo_relacion`
  - `es_principal`
- `direcciones` debe ser la tabla base reutilizable.

## 7. Tabla `cuenta_direcciones`

### 7.1 Responsabilidad

Resolver múltiples direcciones por cuenta sin acoplar la cuenta a dos campos fijos.

### 7.2 Columnas sugeridas

- `id uuid primary key default gen_random_uuid()`
- `organizacion_id uuid not null references public.organizaciones(id) on delete cascade`
- `cuenta_id uuid not null references public.cuentas(id) on delete cascade`
- `direccion_id uuid not null references public.direcciones(id) on delete cascade`
- `tipo_relacion text not null`
- `es_principal boolean not null default false`
- `activo boolean not null default true`
- `notas text`
- `metadata jsonb not null default '{}'::jsonb`
- `creado_en timestamptz not null default now()`
- `actualizado_en timestamptz not null default now()`

### 7.3 Restricciones sugeridas

- `check (tipo_relacion in ('fiscal', 'operativa', 'envio', 'sucursal', 'historial', 'otro'))`
- `unique (cuenta_id, direccion_id, tipo_relacion)`

### 7.4 Regla de uso

- Esta tabla forma parte de la primera base del nuevo modelo.
- Evita quedar atrapados con solo dos direcciones fijas por cuenta.

## 8. Reglas de unicidad recomendadas

### 8.1 `personas`

Opcionales, según negocio:

- evitar duplicar correo principal por organización
- evitar duplicar teléfono principal por organización

### 8.2 `cuentas`

Opcionales:

- `unique (organizacion_id, rfc)` cuando `rfc` no sea nulo ni vacío
- `unique (organizacion_id, nombre_comercial)` no lo recomiendo al inicio porque puede ser demasiado restrictivo

### 8.3 `cuenta_personas`

- una misma persona puede repetir en varias cuentas
- en una misma cuenta, el mismo rol puede repetirse solo si el negocio lo permite

## 9. Orden de creación recomendado

1. Crear `direcciones`.
2. Crear `personas`.
3. Crear `cuenta_direcciones`.
4. Crear `cuenta_personas`.
5. Agregar triggers/vistas de compatibilidad con `contactos`.
6. Más adelante ajustar `cuentas` al nuevo modelo cuando toque la fase de corte.

## 10. Decisiones tomadas

### 9.1 `persona_fisica_moral`

No se quedará en `personas`.

Se modela en `cuentas.tipo_persona`.

### 9.2 `nombre_completo`

Se conserva en `personas` como columna materializada para búsquedas y compatibilidad.
Debe considerarse derivada de los campos atómicos de nombre.

### 9.3 `company_name`

No se mantiene como fuente de verdad.

Debe derivarse de `cuentas.nombre_comercial` o `cuentas.razon_social` según el caso.

## 11. Estrategia de deduplicación previa al backfill

Antes de copiar datos históricos a las tablas nuevas, hay que decidir cómo resolver duplicados.

### 11.1 `personas`

Reglas sugeridas:

- match fuerte por `telefono_principal_e164`
- match fuerte por `correo_principal`
- match débil por `nombre_completo + organizacion_id`

### 11.2 `cuentas`

Reglas sugeridas:

- match fuerte por `rfc`
- match medio por `razon_social`
- match débil por `nombre_comercial`

### 11.3 Criterio práctico

- Si hay coincidencia fuerte, unir.
- Si hay coincidencia débil, revisar manualmente o marcar como candidato.
- Si hay conflicto entre correo/teléfono y nombre, conservar registros separados hasta validación humana.

## 12. Pendientes para la migración SQL

Cuando se convierta este esquema en migraciones, faltará definir:

- triggers de escritura dual
- backfill desde `contactos`
- vistas de compatibilidad
- estrategia de corte final de columnas viejas
- deduplicación previa a backfill
