# Plan base para cobro de mensajes por tenant

**Fecha:** 2026-08-13  
**Estado:** documento base de producto, reglas comerciales y arquitectura.  
**Alcance:** mensajes entrantes y salientes de WhatsApp/Meta y sus hilos de conversación.

## 1. Objetivo

Definir un sistema de cobro claro, rápido, auditable y aislado por tenant para contabilizar:

1. mensajes entrantes y salientes de la conversación;
2. hilos de conversación utilizados como agrupador operativo y de reportes;
3. categoría de Meta del mensaje, aunque la tarifa comercial de GEOACTIV sea la misma para todas las categorías;
4. costo estimado que Meta cobra directamente al tenant;
5. importe propio de GEOACTIV por tenant y periodo de cobro;
6. costo combinado para estadísticas de conversión.

El sistema deberá permitir que:

- el tenant maestro consulte la información global de todos los tenants;
- cada tenant consulte únicamente sus propios mensajes, hilos, consumos, cargos y totales;
- el histórico de cobro no dependa de interpretar `metadata`, `payload`, `json`, `jsonb` ni estructuras equivalentes;
- una auditoría pueda reconstruir por qué se generó cada cargo.

## 2. Propuesta comercial recibida

La regla comercial base es:

- cobrar **$0.09 MXN por cada mensaje entrante o saliente**;
- cobrar el mismo importe sin importar quién inició el hilo;
- cobrar el mismo importe sin importar si el mensaje es `marketing`, `utility`, `authentication`, `service` u otra categoría de Meta;
- no cobrar un importe adicional por crear, abrir, mantener o cerrar un hilo;
- registrar todo por tenant.

Además, el sistema tendrá dos importes independientes:

```text
costo_meta_mxn = costo estimado del proveedor, pagado directamente por el tenant a Meta
cargo_app_mxn = cargo propio de GEOACTIV, inicialmente $0.09 MXN por mensaje
costo_total_conversion_mxn = costo_meta_mxn + cargo_app_mxn
```

El `costo_meta_mxn` será informativo y estadístico durante la primera etapa. No se agregará al saldo ni a la factura de GEOACTIV mientras la aplicación no lo esté cobrando al tenant.

## 3. Unidad de cobro

La unidad de cobro será un mensaje individual persistido en `mensajes`.

```text
mensaje entrante aceptado: $0.09 MXN
mensaje saliente aceptado: $0.09 MXN
```

Ejemplo de una conversación:

```text
cliente entrante 1 = $0.09 MXN
empresa saliente 1 = $0.09 MXN
cliente entrante 2 = $0.09 MXN
empresa saliente 2 = $0.09 MXN
total del hilo = $0.36 MXN
```

El `conversacion_id` agrupa los mensajes, pero no genera un cargo separado. Una conversación larga puede contener muchos mensajes y cada uno se cobra individualmente.

## 4. Regla de mensajes cobrables

Se considera mensaje cobrable cuando:

- la dirección sea `entrante` o `saliente`;
- pertenezca a un tenant válido;
- haya sido aceptado por Meta o Twilio y tenga identificador del proveedor;
- no exista previamente otro consumo facturable para el mismo mensaje del proveedor;
- no sea un duplicado técnico de webhook, reintento o persistencia;
- el mensaje no haya sido excluido expresamente por una regla de crédito o prueba.

Por defecto, no se cobrarán:

- intentos salientes que no obtuvieron identificador del proveedor;
- envíos rechazados antes de ser aceptados por Meta/Twilio;
- reintentos técnicos que representen el mismo mensaje del proveedor;
- eventos de `enviado`, `entregado` o `leído` como unidades independientes.

Un mensaje aceptado se cobra una sola vez, aunque después reciba varios estados de entrega.

## 5. Regla de hilos

Para el cobro comercial de GEOACTIV, el hilo se basa en el `conversacion_id` interno y no es una unidad de cobro.

El hilo se utiliza para:

- mostrar el historial de ida y vuelta;
- agrupar los mensajes de un tenant;
- contar hilos con actividad;
- medir participación entrante y saliente;
- facilitar la auditoría de los cargos individuales.

No se crea ningún cargo adicional por:

- cada respuesta entrante;
- cada mensaje saliente;
- cada evento de entrega;
- cada reintento técnico;
- cada actualización de estado;
- abrir o cerrar una conversación.

Una conversación nueva solamente cambia el agrupador. Los cargos se generan exclusivamente por las filas cobrables de `cobro_mensajes`.

## 6. Categorías de Meta

Aunque la tarifa comercial propuesta sea de $0.09 MXN para cualquier mensaje entrante o saliente, se deben registrar las categorías de Meta como columnas explícitas:

- `marketing`;
- `utility`;
- `authentication`;
- `service`;
- `referral_conversion`;
- `unknown`.

La categoría deberá provenir del evento oficial de Meta cuando esté disponible. No se debe inferir únicamente por el nombre de la plantilla.

La categoría sirve para:

- conciliación contra Meta;
- reportes al tenant;
- análisis de rentabilidad;
- cambios futuros de tarifa;
- identificación de mensajes gratuitos o no facturables;
- auditoría de una disputa.

La categoría no modifica el precio mientras el plan comercial mantenga una tarifa única de $0.09 MXN.

## 7. Costo de Meta separado del cargo de GEOACTIV

La configuración inicial para México será:

```text
proveedor: Meta
canal: WhatsApp
país: MX
iniciador: empresa
costo_meta_unitario: $0.5614 MXN
```

Este valor representa el costo estimado que el tenant paga directamente a Meta por mensajes salientes iniciados por la empresa. No representa todavía un importe cobrado por GEOACTIV.

### Reglas de aplicación

- mensaje entrante del cliente: `costo_meta_mxn = 0`;
- mensaje saliente dentro de un hilo iniciado por el cliente: `costo_meta_mxn = 0`, salvo que Meta reporte otro tratamiento;
- mensaje saliente que inicia la empresa: `costo_meta_mxn = 0.5614` con la tarifa vigente aplicable;
- cargo de GEOACTIV por mensaje entrante o saliente: `cargo_app_mxn = 0.09`;
- el costo Meta no se suma a la deuda de GEOACTIV en la primera etapa;
- el costo combinado sí se muestra en estadísticas de rentabilidad y conversión.

La aplicación debe guardar quién inició el hilo:

```text
cliente
empresa
desconocido
```

No se debe deducir esta condición solamente mirando si un mensaje es entrante o saliente, porque una respuesta saliente puede pertenecer a un hilo iniciado por el cliente.

### Configuración por país y tarifa vigente

El precio de Meta no debe quedar hardcodeado en React, FastAPI ni en una migración que obligue a modificar código para cambiarlo. Debe existir un catálogo versionado:

```text
cobro_tarifas_proveedor
```

con columnas explícitas para:

```text
id
proveedor
canal
pais_codigo_iso2
categoria_meta
iniciador_hilo
precio_unitario
moneda
vigente_desde
vigente_hasta
activo
creado_en
actualizado_en
```

La tarifa inicial será una fila para `Meta`, `WhatsApp`, `MX`, `empresa`, con precio `0.5614 MXN`. Si Meta cambia el precio, se cierra la vigencia anterior y se crea una nueva fila; nunca se modifica el precio histórico usado para calcular estadísticas anteriores.

## 7. Tablas nuevas propuestas

Todas las tablas nuevas deben tener columnas explícitas. No se utilizarán `metadata`, `payload`, `data`, `extras`, `settings`, `json`, `jsonb` ni campos equivalentes para guardar información estructural del cobro.

### 7.1 `cobro_planes`

Catálogo de planes comerciales.

Columnas:

```text
id uuid primary key
codigo text unique not null
nombre text not null
descripcion text null
moneda char(3) not null default 'MXN'
precio_mensaje numeric(12,4) not null
cobra_mensaje_saliente boolean not null default true
cobra_mensaje_entrante boolean not null default true
activo boolean not null default true
vigente_desde timestamptz not null
vigente_hasta timestamptz null
creado_en timestamptz not null default now()
actualizado_en timestamptz not null default now()
```

Constraints:

- precios mayores o iguales a cero;
- `vigente_hasta` posterior a `vigente_desde` cuando exista;
- no más de un plan activo aplicable para el mismo periodo;
- moneda limitada inicialmente a `MXN`.

### 7.2 `cobro_tarifas_proveedor`

Catálogo versionado de costos estimados de Meta u otros proveedores. Este catálogo no representa cargos de GEOACTIV.

Columnas:

```text
id uuid primary key
proveedor text not null
canal text not null
pais_codigo_iso2 char(2) not null
categoria_meta text not null
iniciador_hilo text not null
precio_unitario numeric(12,4) not null
moneda char(3) not null default 'MXN'
vigente_desde timestamptz not null
vigente_hasta timestamptz null
activo boolean not null default true
creado_por_usuario_id uuid not null references usuarios(id)
cerrado_por_usuario_id uuid null references usuarios(id)
creado_en timestamptz not null default now()
actualizado_en timestamptz not null default now()
```

La tarifa inicial será `Meta / WhatsApp / MX / empresa / 0.5614 MXN`. Las tarifas históricas no se editan; se cierran y se crea una nueva versión.

Constraints:

- precio mayor o igual a cero;
- `vigente_hasta` posterior a `vigente_desde` cuando exista;
- no debe existir solapamiento para la misma combinación de proveedor, canal, país, categoría e iniciador;
- `iniciador_hilo` limitado a `cliente`, `empresa` o `desconocido`.

### 7.3 `organizaciones_cobro`

Configuración comercial efectiva por tenant.

Columnas:

```text
organizacion_id uuid primary key references organizaciones(id)
plan_id uuid not null references cobro_planes(id)
estado text not null
fecha_inicio_cobro timestamptz not null
fecha_fin_cobro timestamptz null
dia_corte smallint not null default 1
saldo_credito numeric(12,4) not null default 0
permite_pruebas boolean not null default false
creado_en timestamptz not null default now()
actualizado_en timestamptz not null default now()
```

Estados recomendados:

```text
pendiente
prueba
activo
suspendido
cancelado
```

### 7.4 `cobro_periodos`

Periodos cerrables de facturación.

Columnas:

```text
id uuid primary key
organizacion_id uuid not null references organizaciones(id)
fecha_inicio timestamptz not null
fecha_fin timestamptz not null
estado text not null
mensajes_cantidad integer not null default 0
mensajes_entrantes_cantidad integer not null default 0
mensajes_salientes_cantidad integer not null default 0
hilos_con_actividad_cantidad integer not null default 0
subtotal_mensajes numeric(14,4) not null default 0
ajustes_total numeric(14,4) not null default 0
total numeric(14,4) not null default 0
moneda char(3) not null default 'MXN'
cerrado_en timestamptz null
cerrado_por_usuario_id uuid null references usuarios(id)
creado_en timestamptz not null default now()
```

Constraints:

- `fecha_fin > fecha_inicio`;
- no se permiten periodos solapados para el mismo tenant;
- un periodo cerrado no se modifica directamente;
- correcciones posteriores se realizan mediante ajustes.

### 7.5 `cobro_mensajes`

Ledger de mensajes entrantes y salientes cobrables o no cobrables.

Columnas:

```text
id uuid primary key
organizacion_id uuid not null references organizaciones(id)
periodo_id uuid not null references cobro_periodos(id)
mensaje_id uuid not null references mensajes(id)
conversacion_id uuid not null references conversaciones(id)
proveedor text not null
proveedor_mensaje_id text not null
direccion text not null
tipo_contenido text not null
origen_mensaje text not null
es_plantilla boolean not null default false
nombre_plantilla text null
idioma_plantilla text null
categoria_meta text not null
tipo_pricing_meta text null
billable_meta boolean null
estado_proveedor text not null
aceptado_proveedor_en timestamptz null
facturable boolean not null default false
motivo_no_facturable text null
precio_unitario numeric(12,4) not null
moneda char(3) not null default 'MXN'
importe numeric(12,4) not null
tipo_cargo text not null default 'mensaje'
fuente_registro text not null
conciliacion_estado text not null default 'pendiente'
conciliado_en timestamptz null
creado_en timestamptz not null default now()
```

Columnas adicionales para costos de proveedor y conversión:

```text
iniciador_hilo text not null
tarifa_proveedor_id uuid null references cobro_tarifas_proveedor(id)
costo_meta_aplica boolean not null default false
costo_meta_unitario numeric(12,4) not null default 0
costo_meta_importe numeric(12,4) not null default 0
cargo_app_unitario numeric(12,4) not null default 0.09
cargo_app_importe numeric(12,4) not null default 0
costo_total_conversion numeric(12,4) not null default 0
```

Constraints críticas:

- `direccion in ('entrante', 'saliente')`;
- `importe = precio_unitario` cuando `facturable = true`;
- `importe = 0` cuando `facturable = false`;
- `costo_meta_importe = costo_meta_unitario` cuando `costo_meta_aplica = true`;
- `costo_meta_importe = 0` cuando `costo_meta_aplica = false`;
- `costo_total_conversion = costo_meta_importe + cargo_app_importe`;
- `proveedor_mensaje_id` no puede repetirse para el mismo tenant y proveedor;
- `tipo_cargo = 'mensaje'`;
- `categoria_meta` limitada a un catálogo controlado;
- `estado_proveedor` limitado a estados conocidos;
- `organizacion_id` debe coincidir con el tenant del mensaje y la conversación mediante FK compuesta.

Índices:

```text
(organizacion_id, periodo_id, facturable)
(organizacion_id, creado_en desc)
(organizacion_id, categoria_meta, creado_en desc)
(organizacion_id, proveedor, proveedor_mensaje_id) unique
(mensaje_id) unique
```

### 7.6 `cobro_hilos_resumen`

Resumen de hilos con actividad. Esta tabla no contiene cargos por hilo.

Columnas:

```text
id uuid primary key
organizacion_id uuid not null references organizaciones(id)
periodo_id uuid not null references cobro_periodos(id)
conversacion_id uuid not null references conversaciones(id)
canal text not null
fecha_inicio_hilo timestamptz not null
fecha_primer_mensaje_saliente timestamptz null
mensaje_saliente_inicial_id uuid null references mensajes(id)
mensajes_entrantes_cantidad integer not null default 0
mensajes_salientes_cantidad integer not null default 0
ultimo_mensaje_en timestamptz null
estado_hilo text not null
creado_en timestamptz not null default now()
```

Constraints críticas:

- un hilo produce como máximo un resumen por tenant y conversación;
- `canal` debe ser `whatsapp` para este plan inicial;
- las cantidades deben coincidir con los mensajes asociados;
- esta tabla no genera importe.

Índices:

```text
(organizacion_id, periodo_id)
(organizacion_id, fecha_inicio_hilo desc)
(organizacion_id, conversacion_id) unique
```

### 7.7 `cobro_ajustes`

Correcciones, créditos y cargos manuales auditables.

Columnas:

```text
id uuid primary key
organizacion_id uuid not null references organizaciones(id)
periodo_id uuid not null references cobro_periodos(id)
tipo text not null
importe numeric(12,4) not null
moneda char(3) not null default 'MXN'
motivo text not null
referencia text null
creado_por_usuario_id uuid not null references usuarios(id)
creado_en timestamptz not null default now()
```

Los ajustes no se eliminan. Si un ajuste fue incorrecto, se crea otro ajuste inverso.

## 9. Relaciones multitenant

Toda tabla de cobro debe incluir `organizacion_id` aunque también tenga una referencia a otra entidad.

Las relaciones importantes deberán usar claves foráneas compuestas cuando corresponda:

```text
(organizacion_id, mensaje_id)
(organizacion_id, conversacion_id)
(organizacion_id, periodo_id)
```

Esto evita que un registro de un tenant apunte accidentalmente a un mensaje, conversación o periodo de otro tenant.

## 10. Acceso del tenant maestro y tenants normales

### Tenant maestro

El tenant maestro tendrá un visualizador global con:

- todos los tenants;
- mensajes facturables por tenant;
- hilos facturables por tenant;
- categorías Meta;
- periodos abiertos y cerrados;
- ajustes;
- discrepancias de conciliación;
- costo Meta estimado, cargo de GEOACTIV y costo combinado;
- totales globales y por tenant.

El visualizador global deberá mostrar el tenant explícitamente en cada fila y no mezclar totales sin una columna de agrupación.

### Tenant normal

Cada tenant podrá consultar únicamente:

- sus mensajes;
- sus conversaciones;
- sus hilos cobrados;
- sus periodos;
- sus importes;
- sus ajustes autorizados;
- sus reportes de consumo.

El tenant podrá consultar el costo Meta estimado, pero no podrá modificar la tarifa del proveedor salvo que se defina expresamente un rol administrativo para ello.

El tenant normal no podrá:

- cambiar `organizacion_id`;
- modificar `facturable`;
- modificar precios;
- cerrar periodos;
- crear ajustes para otro tenant;
- consultar payloads o datos privados de otro tenant;
- acceder a los totales globales.

La seguridad debe aplicarse en RLS y en backend. Ocultar filas en el frontend no es una medida de autorización.

## 11. Configuración frontend y backend

### Frontend administrativo

El tenant maestro tendrá una pantalla de configuración de tarifas con:

- proveedor;
- canal;
- país;
- categoría Meta;
- iniciador del hilo;
- precio unitario;
- moneda;
- fecha de inicio de vigencia;
- fecha de fin de vigencia;
- estado activo.

La pantalla deberá mostrar advertencia cuando se intente cerrar o crear una tarifa que afecte cálculos futuros. Las tarifas históricas no se editan.

El tenant normal verá el precio vigente y sus costos estimados, pero no podrá modificarlo.

### Backend

El backend deberá exponer endpoints administrativos separados:

```text
GET  /api/admin/billing/provider-rates
POST /api/admin/billing/provider-rates
PATCH /api/admin/billing/provider-rates/{rate_id}/close
```

El backend debe:

- validar rol administrativo;
- validar país, canal, proveedor, categoría e iniciador;
- impedir solapamiento de vigencias;
- impedir que el frontend envíe directamente `costo_meta_importe` o `costo_total_conversion`;
- calcular esos valores desde la tarifa vigente;
- registrar quién creó o cerró una tarifa.

## 12. API propuesta

### Tenant normal

```text
GET /api/crm/billing/usage/summary
GET /api/crm/billing/messages
GET /api/crm/billing/threads
GET /api/crm/billing/periods
GET /api/crm/billing/periods/{period_id}
```

### Tenant maestro

```text
GET /api/admin/billing/tenants
GET /api/admin/billing/summary
GET /api/admin/billing/tenants/{organizacion_id}/usage
GET /api/admin/billing/reconciliation
POST /api/admin/billing/periods/{period_id}/close
POST /api/admin/billing/adjustments
```

Reglas:

- el tenant se obtiene del contexto autenticado;
- no se acepta un `organizacion_id` arbitrario desde el frontend;
- los endpoints de cierre y ajustes requieren rol administrativo explícito;
- todos los listados usan paginación y límites máximos;
- las respuestas devuelven columnas de negocio, no payloads internos.

## 13. Totales y fórmula

```text
subtotal_mensajes = mensajes_entrantes_facturables * 0.09
                   + mensajes_salientes_facturables * 0.09
ajustes_total = suma de cobro_ajustes
total = subtotal_mensajes + ajustes_total
costo_meta_periodo = suma de costo_meta_importe
costo_conversion_periodo = suma de costo_total_conversion
```

Los importes deben calcularse con `numeric`, nunca con `float`.

## 14. Estados del consumo

### Estado del proveedor

```text
intentado
aceptado
entregado
leido
fallido
desconocido
```

### Estado de conciliación

```text
pendiente
conciliado
no_conciliado
excluido
ajustado
```

### Estado del periodo

```text
abierto
en_revision
cerrado
facturado
cancelado
```

## 15. Conciliación e idempotencia

El proceso deberá ser idempotente:

1. recibe un mensaje aceptado por Meta/Twilio;
2. busca el proveedor y el ID del mensaje;
3. confirma el tenant desde la conversación y el mensaje;
4. determina la categoría Meta;
5. identifica quién inició el hilo;
6. obtiene la tarifa Meta vigente si el mensaje es saliente iniciado por la empresa;
7. calcula el cargo de GEOACTIV y el costo combinado;
8. busca si ya existe `cobro_mensajes` para ese proveedor e ID;
9. crea una sola fila de consumo;
10. actualiza o crea el resumen del hilo;
11. actualiza totales del periodo de forma transaccional.

Los eventos de entrega solamente actualizan el estado del consumo relacionado. No crean cargos nuevos.

## 16. Datos históricos

No se deben cobrar automáticamente todos los datos históricos actuales porque existen:

- mensajes sin ID del proveedor;
- mensajes sin evento de entrega;
- tráfico concentrado en el tenant maestro;
- categorías antiguas no normalizadas;
- eventos duplicados.

Se recomienda:

1. iniciar el cobro en una fecha de corte explícita;
2. marcar lo anterior como histórico;
3. ejecutar una conciliación separada;
4. aplicar créditos o cargos históricos únicamente después de revisión administrativa.

## 17. Reglas de rendimiento

- índices compuestos por `organizacion_id` y fecha;
- índices por `periodo_id`, `facturable` y `categoria_meta`;
- paginación obligatoria;
- agregaciones por periodo, no sobre toda la tabla en cada carga del panel;
- cierre de periodos con totales persistidos;
- vistas o funciones SQL específicas para dashboards;
- no consultar ni filtrar información estructural dentro de JSON;
- evitar joins sin filtro de tenant;
- particionamiento solamente si el volumen futuro lo justifica.

## 18. Auditoría y protección contra fraude o error

Debe conservarse:

- quién generó un ajuste;
- cuándo se cerró un periodo;
- qué tarifa estaba activa;
- qué mensaje originó el cargo;
- qué conversación agrupó el mensaje cobrado;
- qué proveedor confirmó el mensaje;
- qué categoría devolvió Meta;
- qué tarifa Meta estaba vigente;
- cuál fue el costo Meta estimado;
- cuál fue el cargo de GEOACTIV;
- cuál fue el costo combinado de conversión;
- por qué un registro fue excluido.

No se deben editar ni borrar cargos de periodos cerrados. Las correcciones deben ser movimientos compensatorios.

## 19. Riesgos y decisiones pendientes

### Decisión 1: precio de Meta

El documento usa `0.5614 MXN` como tarifa inicial configurable para México y mensajes iniciados por la empresa. Antes de activar estadísticas productivas se debe confirmar la tarifa vigente y su alcance exacto con la cuenta de Meta del tenant.

### Decisión 2: mensajes fallidos

La recomendación es no cobrar mensajes rechazados antes de ser aceptados por el proveedor.

### Decisión 3: canales futuros

El plan inicial cubre WhatsApp/Meta. Email, Messenger, Webchat y otros canales deben tener tipos de cargo separados si se incorporan más adelante.

### Decisión 4: impuestos

Definir si los $0.09 MXN son precio antes de IVA o precio final con IVA incluido. La base debe guardar subtotal, impuesto y total por separado si se requiere facturación fiscal.

## 20. Fases de implementación

### Fase 1: definición

- aprobar reglas de aceptación, fallo y duplicidad;
- aprobar la separación entre costo Meta informativo y cargo de GEOACTIV;
- confirmar tarifa inicial de Meta de $0.5614 MXN;
- confirmar fecha de inicio;
- confirmar precio con o sin IVA.

### Fase 2: base de datos

- crear tablas y catálogos;
- crear claves foráneas compuestas;
- agregar índices;
- crear constraints;
- configurar RLS;
- crear funciones transaccionales de registro.

### Fase 3: backend

- capturar columnas de pricing de Meta;
- registrar consumos de forma idempotente;
- separar estado de proveedor y estado de conciliación;
- crear endpoints tenant y administrador;
- evitar que el cliente controle importes o tenant.

### Fase 4: panel

- visualizador global para tenant maestro;
- visualizador propio para cada tenant;
- resumen de mensajes, hilos, categorías e importes;
- detalle auditable por mensaje;
- estados vacío, cargando, error y conciliación pendiente.

### Fase 5: prueba

- periodo de prueba sin cobro;
- comparación contra mensajes y eventos actuales;
- pruebas de duplicados y reintentos;
- pruebas RLS entre tenants;
- cierre y reapertura de periodos;
- revisión de importes con casos reales.

### Fase 6: activación

- establecer fecha de corte;
- activar el plan para tenants seleccionados;
- generar primer periodo en modo revisión;
- aprobar discrepancias;
- cerrar el periodo;
- comenzar facturación.

## 21. Criterio de terminado

El plan estará listo para operar cuando:

- cada mensaje facturable tenga un tenant, proveedor e ID único;
- cada resumen de hilo tenga una conversación única;
- no existan cargos duplicados por webhook o reintento;
- Meta marketing, utility, authentication y service se registren en columnas;
- el tenant maestro vea todos los tenants;
- cada tenant vea únicamente sus datos;
- los periodos cerrados sean inmutables;
- los totales puedan reproducirse desde el ledger;
- los casos no conciliados se muestren antes de cobrar;
- la fórmula de $0.09 MXN por cada mensaje entrante o saliente esté publicada y probada.
- el precio Meta de $0.5614 MXN pueda modificarse por vigencia sin cambiar código;
- las estadísticas separen costo Meta, cargo de GEOACTIV y costo combinado;
- el costo Meta no se agregue al cobro de GEOACTIV mientras siga siendo un costo directo del tenant.

## Estado del documento

**Documento base para aprobación comercial y técnica.**

Todavía no crea tablas, no cambia tarifas y no activa cobros. La regla documentada es cobrar $0.09 MXN por cada mensaje entrante o saliente aceptado por el proveedor; el hilo solamente agrupa los mensajes y no genera un cargo adicional.
