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
- Los responsables usan `propietario_usuario_id`.

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
- `propietario_usuario_id uuid references public.usuarios(id) on delete set null`
- `creado_en timestamptz not null default now()`
- `actualizado_en timestamptz not null default now()`

### 3.3 Restricciones sugeridas

- `check (estado in ('lead', 'activo', 'inactivo', 'bloqueado'))`
- `check (nombre <> '')`
- `check (nombre_completo <> '')`

### 3.4 Índices sugeridos

- `personas_org_idx on (organizacion_id)`
- `personas_org_owner_idx on (organizacion_id, propietario_usuario_id)`
- `personas_org_email_idx on (organizacion_id, lower(correo_principal)) where correo_principal is not null and btrim(correo_principal) <> ''`
- `personas_org_phone_idx on (organizacion_id, telefono_principal_e164) where telefono_principal_e164 is not null and btrim(telefono_principal_e164) <> ''`

### 3.5 Regla de uso

- Aquí no deben vivir datos fiscales ni de empresa.
- `nombre_completo` se mantiene almacenado para búsqueda y compatibilidad.

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
- `direccion_fiscal_id uuid references public.direcciones(id) on delete set null`
- `direccion_operativa_id uuid references public.direcciones(id) on delete set null`
- `propietario_usuario_id uuid references public.usuarios(id) on delete set null`
- `estado text not null default 'activo'`
- `notas text`
- `metadata jsonb not null default '{}'::jsonb`
- `creado_en timestamptz not null default now()`
- `actualizado_en timestamptz not null default now()`

### 4.3 Restricciones sugeridas

- `check (tipo_persona in ('fisica', 'moral'))`
- `check (tipo_cuenta in ('empresa', 'persona_fisica_actividad_empresarial', 'gobierno', 'proveedor', 'partner', 'cliente', 'prospecto', 'otro'))`
- `check (estado in ('lead', 'activo', 'inactivo', 'bloqueado'))`

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

## 5. Tabla `cuenta_personas`

### 5.1 Responsabilidad

Resuelve la relación real entre una persona y una cuenta.

### 5.2 Columnas

- `id uuid primary key default gen_random_uuid()`
- `organizacion_id uuid not null references public.organizaciones(id) on delete cascade`
- `cuenta_id uuid not null references public.cuentas(id) on delete cascade`
- `persona_id uuid not null references public.personas(id) on delete cascade`
- `rol_en_cuenta text not null`
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

- `check (rol_en_cuenta in ('dueno', 'representante_legal', 'director', 'compras', 'facturacion', 'operacion', 'contacto_principal', 'asistente', 'otro'))`
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

- `cuentas.direccion_fiscal_id` y `cuentas.direccion_operativa_id` apuntan aquí.
- Si más adelante se necesita dirección principal en personas, se puede agregar otra FK sin cambiar la tabla base.

## 7. Reglas de unicidad recomendadas

### 7.1 `personas`

Opcionales, según negocio:

- evitar duplicar correo principal por organización
- evitar duplicar teléfono principal por organización

### 7.2 `cuentas`

Opcionales:

- `unique (organizacion_id, rfc)` cuando `rfc` no sea nulo ni vacío
- `unique (organizacion_id, nombre_comercial)` no lo recomiendo al inicio porque puede ser demasiado restrictivo

### 7.3 `cuenta_personas`

- una misma persona puede repetir en varias cuentas
- en una misma cuenta, el mismo rol puede repetirse solo si el negocio lo permite

## 8. Orden de creación recomendado

1. Crear `direcciones`.
2. Crear `personas`.
3. Crear `cuentas` ajustada al nuevo modelo.
4. Crear `cuenta_personas`.
5. Agregar triggers/vistas de compatibilidad con `contactos`.

## 9. Decisiones tomadas

### 9.1 `persona_fisica_moral`

No se quedará en `personas`.

Se modela en `cuentas.tipo_persona`.

### 9.2 `nombre_completo`

Se conserva en `personas` como columna materializada para búsquedas y compatibilidad.

### 9.3 `company_name`

No se mantiene como fuente de verdad.

Debe derivarse de `cuentas.nombre_comercial` o `cuentas.razon_social` según el caso.

## 10. Pendientes para la migración SQL

Cuando se convierta este esquema en migraciones, faltará definir:

- triggers de escritura dual
- backfill desde `contactos`
- vistas de compatibilidad
- estrategia de corte final de columnas viejas

