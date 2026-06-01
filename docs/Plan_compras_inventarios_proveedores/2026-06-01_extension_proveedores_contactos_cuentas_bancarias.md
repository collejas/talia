# Extension de proveedores: contactos y cuentas bancarias

## Objetivo

Extender el modulo de proveedores para soportar:

- multiples contactos por proveedor;
- multiples cuentas bancarias por proveedor;
- administracion desde base de datos, backend y UI;
- compatibilidad con el modelo actual de `proveedores`.

## Contexto actual

Hoy `proveedores` funciona como cabecera simple de compra:

- guarda un `contacto_principal_persona_id`;
- guarda una `cuenta_id` opcional;
- sigue un patron de proveedor "liviano" orientado a ordenes de compra.

El sistema ya tiene un modelo mas maduro para relaciones multiples entre entidades, por ejemplo:

- `cuenta_personas` para varias personas por cuenta;
- `cuenta_direcciones` para varias direcciones por cuenta.

La extension de proveedores debe seguir ese mismo criterio: la cabecera del proveedor no debe convertirse en un contenedor de campos repetidos.

## Decision tecnica

### Mantener `proveedores` como cabecera

No mover todos los datos a `proveedores`.

La tabla debe seguir concentrando:

- identidad comercial del proveedor;
- datos fiscales y de pago basicos;
- un contacto principal opcional como atajo;
- estado activo/inactivo;
- referencia a la cuenta CRM cuando exista.

### Agregar tablas hijas

1. `proveedor_contactos`
2. `proveedor_cuentas_bancarias`

### Regla de modelado

- los contactos deben reutilizar `personas`;
- las cuentas bancarias deben vivir en una tabla propia;
- el proveedor debe poder tener varios registros activos e historicos;
- la UI debe mostrar la relacion completa sin forzar un formulario plano.

## Base de datos

### 1. `proveedor_contactos`

Uso:

- relacionar uno o mas contactos con un proveedor.

Campos propuestos:

- `id` uuid
- `organizacion_id` uuid
- `proveedor_id` uuid
- `persona_id` uuid
- `rol_en_proveedor` text
- `es_principal` boolean not null default false
- `es_compras` boolean not null default false
- `es_facturacion` boolean not null default false
- `es_logistica` boolean not null default false
- `activo` boolean not null default true
- `fecha_inicio` date null
- `fecha_fin` date null
- `notas` text null
- `metadata` jsonb not null default '{}'::jsonb
- `creado_en` timestamptz not null default now()
- `actualizado_en` timestamptz not null default now()

Restricciones:

- unique `(proveedor_id, persona_id, rol_en_proveedor)`
- check de fechas: `fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio`
- foreign key a `proveedores`
- foreign key a `personas`

Indices:

- `(organizacion_id, proveedor_id)`
- `(organizacion_id, persona_id)`
- parcial para `es_principal = true AND activo = true`

### 2. `proveedor_cuentas_bancarias`

Uso:

- guardar varias cuentas bancarias por proveedor.

Campos propuestos:

- `id` uuid
- `organizacion_id` uuid
- `proveedor_id` uuid
- `alias` text null
- `banco_nombre` text
- `banco_clave` text null
- `pais` text not null default 'MX'
- `moneda` char(3) not null default 'MXN'
- `tipo_cuenta` text null
- `titular` text null
- `numero_cuenta` text null
- `clabe` text null
- `swift` text null
- `iban` text null
- `es_principal` boolean not null default false
- `activo` boolean not null default true
- `observaciones` text null
- `metadata` jsonb not null default '{}'::jsonb
- `creado_en` timestamptz not null default now()
- `actualizado_en` timestamptz not null default now()

Restricciones:

- check `char_length(moneda) = 3`
- check de unicidad logica por proveedor cuando exista `clabe` o `numero_cuenta`
- foreign key a `proveedores`
- check opcional de formato para `clabe` si se quiere endurecer en una fase posterior

Indices:

- `(organizacion_id, proveedor_id, activo)`
- `(organizacion_id, proveedor_id, es_principal)`
- opcionalmente un indice unico parcial para una sola cuenta principal activa por proveedor

### 3. Ajuste de `proveedores`

Mantener columnas actuales y ajustar solo lo minimo:

- `contacto_principal_persona_id` puede seguir como atajo;
- `cuenta_id` puede seguir como referencia a la cuenta CRM;
- si se quiere consistencia estricta, el contacto principal debe derivarse de `proveedor_contactos` y sincronizarse en backend.

### 4. Compatibilidad y migracion

Backfill sugerido:

- si `proveedores.contacto_principal_persona_id` tiene valor, crear un registro correspondiente en `proveedor_contactos`;
- si `proveedores.cuenta_id` existe y el negocio lo amerita, usar la cuenta para sugerir contactos iniciales desde `cuenta_personas`;
- no borrar columnas existentes en la primera iteracion;
- agregar triggers o logica backend solo si se necesita mantener compatibilidad con escrituras viejas.

## Backend

### Reglas de negocio

- un proveedor puede tener varios contactos;
- un proveedor puede tener varias cuentas bancarias;
- solo un contacto principal activo debe ser visible como "principal" en la UI;
- solo una cuenta bancaria principal activa debe quedar marcada como preferida;
- si se desactiva el principal, el backend debe recalcular un nuevo principal o dejarlo sin principal segun la politica definida.

### Endpoints propuestos

#### Proveedores

- `GET /crm/proveedores`
- `GET /crm/proveedores/{id}`
- `POST /crm/proveedores`
- `PATCH /crm/proveedores/{id}`
- `DELETE /crm/proveedores/{id}` o baja logica

#### Contactos del proveedor

- `GET /crm/proveedores/{id}/contactos`
- `POST /crm/proveedores/{id}/contactos`
- `PATCH /crm/proveedores/{id}/contactos/{contacto_relacion_id}`
- `DELETE /crm/proveedores/{id}/contactos/{contacto_relacion_id}`

#### Cuentas bancarias del proveedor

- `GET /crm/proveedores/{id}/cuentas-bancarias`
- `POST /crm/proveedores/{id}/cuentas-bancarias`
- `PATCH /crm/proveedores/{id}/cuentas-bancarias/{cuenta_bancaria_id}`
- `DELETE /crm/proveedores/{id}/cuentas-bancarias/{cuenta_bancaria_id}`

### Reglas de implementacion

- validar pertenencia al tenant en cada operacion;
- no exponer cuentas completas sin permisos claros;
- en respuestas de lista, devolver datos enmascarados cuando aplique;
- permitir selectores de `personas` para crear un contacto nuevo o enlazar uno existente;
- soportar alta rapida de persona si no existe;
- al crear una cuenta bancaria principal, desmarcar la anterior si existe una politica de "solo una principal".

### Respuestas recomendadas

El detalle de proveedor deberia incluir:

- cabecera del proveedor;
- contacto principal derivado;
- lista de contactos;
- lista de cuentas bancarias;
- ultimo pedido y condiciones comerciales basicas;
- productos asociados si la vista lo necesita.

### Permisos y seguridad

- aplicar RLS o filtros por `organizacion_id`;
- limitar lectura de cuentas bancarias completas a roles autorizados;
- auditar cambios de cuentas bancarias y contactos;
- registrar quien crea, edita o desactiva una cuenta bancaria.

## UI

### Vista de detalle de proveedor

Agregar pestañas:

- `General`
- `Contactos`
- `Cuentas bancarias`
- `Productos`
- `Ordenes`

### Pestaña Contactos

Debe permitir:

- listar contactos del proveedor;
- marcar principal;
- marcar facturacion, compras o logistica;
- crear contacto nuevo desde persona existente;
- crear persona nueva y enlazarla al proveedor;
- editar notas y vigencia;
- desactivar una relacion sin perder historial.

Campos visibles sugeridos:

- nombre;
- cargo/rol;
- telefono;
- correo;
- flags de uso;
- estado activo;
- fecha de alta.

### Pestaña Cuentas bancarias

Debe permitir:

- listar cuentas bancarias del proveedor;
- crear o editar cuenta;
- marcar cuenta principal;
- mostrar titular, banco, CLABE y moneda;
- ocultar parcialmente numero de cuenta y CLABE;
- copiar al portapapeles solo si el permiso lo permite.

Campos visibles sugeridos:

- alias;
- banco;
- titular;
- tipo de cuenta;
- CLABE enmascarada;
- moneda;
- principal;
- activa.

### Formatos de UI

#### Alta de contacto

Flujo recomendado:

1. buscar persona existente;
2. si no existe, crear persona;
3. crear relacion `proveedor_contactos`;
4. si corresponde, marcar principal.

#### Alta de cuenta bancaria

Flujo recomendado:

1. capturar banco y titular;
2. capturar CLABE o numero de cuenta;
3. validar formato basico;
4. guardar;
5. opcionalmente marcar principal.

### Estados vacios

La UI debe mostrar mensajes utiles:

- sin contactos registrados;
- sin cuentas bancarias;
- sin principal definido;
- sin permisos para ver datos bancarios completos.

## Plan de entrega

### Fase 1

- crear tablas `proveedor_contactos` y `proveedor_cuentas_bancarias`;
- agregar indices y foreign keys;
- mantener compatibilidad con `proveedores`;
- backfill inicial desde `contacto_principal_persona_id`.

### Fase 2

- exponer CRUD backend para contactos y cuentas bancarias;
- agregar validaciones y reglas de principal;
- agregar enmascarado de datos sensibles;
- registrar auditoria basica.

### Fase 3

- implementar UI de detalle de proveedor con pestañas;
- agregar modales de alta/edicion;
- agregar estados vacios y acciones rapidas;
- conectar buscador de personas.

### Fase 4

- evaluar catalogo de bancos si el uso crece;
- unificar reglas de enmascarado;
- revisar reportes y exportaciones;
- depurar el campo legacy si ya no se usa.

## Criterios de aceptacion

- un proveedor puede tener mas de un contacto;
- un proveedor puede tener mas de una cuenta bancaria;
- la UI muestra contacto principal y cuenta principal;
- se puede crear y editar todo sin tocar el esquema legacy de forma invasiva;
- los datos bancarios se muestran de forma segura;
- el sistema sigue funcionando con las ordenes de compra existentes.

## Riesgos

- duplicar contactos si no se reutiliza `personas`;
- exponer datos bancarios completos sin control de permisos;
- introducir multiples "principales" por proveedor si no se aplica la regla en backend;
- fragmentar la experiencia si la UI no resuelve bien alta rapida y edicion.
