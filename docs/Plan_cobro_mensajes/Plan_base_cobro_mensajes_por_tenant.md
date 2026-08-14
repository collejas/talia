# Plan base para cobro de mensajes por tenant

**Fecha:** 2026-08-13  
**Estado:** documento base de producto, reglas comerciales y arquitectura.  
**Alcance:** mensajes entrantes y salientes de WhatsApp/Meta y sus hilos de conversación.

## 1. Objetivo

Definir un sistema de cobro claro, rápido, auditable y aislado por tenant para contabilizar:

1. mensajes entrantes y salientes de la conversación;
2. hilos de conversación utilizados como agrupador operativo y de reportes;
3. categoría de Meta del mensaje, aunque la tarifa comercial de GEOACTIV sea la misma para todas las categorías;
4. tarifa publicada por Meta que se aplica al tenant;
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
costo_meta_mxn = tarifa publicada por Meta, pagada directamente por el tenant a Meta
cargo_app_mxn = cargo propio de GEOACTIV, inicialmente $0.09 MXN por mensaje
costo_total_mensaje_mxn = costo_meta_mxn + cargo_app_mxn
```

El `costo_meta_mxn` será informativo y estadístico. No se agregará al saldo ni a la factura de GEOACTIV porque el tenant lo paga directamente a Meta.

El `cargo_app_mxn` sí será configurable por el dueño de la aplicación:

- tarifa global para todos los tenants;
- tarifa particular para un tenant específico;
- la tarifa particular tiene prioridad sobre la global;
- si el tenant no tiene tarifa particular activa, se utiliza la global;
- un tenant normal solamente puede consultar su tarifa efectiva;
- solamente el tenant maestro puede crear, cerrar o modificar tarifas.

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

Este valor representa la tarifa publicada por Meta que el tenant paga directamente por mensajes salientes iniciados por la empresa. No representa un importe cobrado por GEOACTIV.

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

## 8. Tarifas de GEOACTIV: globales y particulares

El precio que GEOACTIV cobra por mensaje no debe quedar fijo en código ni depender únicamente del plan. Se guardará en una tabla versionada:

### `cobro_tarifas_app`

Columnas:

```text
id uuid primary key
alcance text not null
organizacion_id uuid null references organizaciones(id)
precio_mensaje numeric(12,4) not null
moneda char(3) not null default 'MXN'
vigente_desde timestamptz not null
vigente_hasta timestamptz null
activo boolean not null default true
creado_por_usuario_id uuid not null references usuarios(id)
cerrado_por_usuario_id uuid null references usuarios(id)
motivo text null
creado_en timestamptz not null default now()
actualizado_en timestamptz not null default now()
```

Valores de `alcance`:

```text
global
tenant
```

Constraints:

- una tarifa `global` debe tener `organizacion_id = null`;
- una tarifa `tenant` debe tener `organizacion_id`;
- `precio_mensaje >= 0`;
- `vigente_hasta` debe ser posterior a `vigente_desde` cuando exista;
- no debe haber dos tarifas activas solapadas para el mismo alcance y tenant;
- las tarifas cerradas no se editan;
- una nueva tarifa reemplaza la vigencia futura, no modifica el histórico.

### Precedencia de tarifa

La tarifa efectiva se resuelve así:

```text
si existe tarifa particular activa del tenant:
    cargo_app_unitario = tarifa particular
    origen_tarifa_app = particular
si no existe:
    cargo_app_unitario = tarifa global
    origen_tarifa_app = global
```

Cada consumo debe guardar una fotografía de la tarifa usada:

```text
tarifa_app_id uuid not null references cobro_tarifas_app(id)
origen_tarifa_app text not null
cargo_app_unitario numeric(12,4) not null
cargo_app_importe numeric(12,4) not null
```

De esta forma, cambiar una tarifa no modifica cobros históricos.

## 9. Tablas nuevas propuestas

Todas las tablas nuevas deben tener columnas explícitas. No se utilizarán `metadata`, `payload`, `data`, `extras`, `settings`, `json`, `jsonb` ni campos equivalentes para guardar información estructural del cobro.

### 9.1 Reutilización de facturación comercial existente

El repositorio ya cuenta con `commercial_plans`, `tenant_billing_accounts` y `tenant_billing_events`, utilizados para suscripción y estado comercial de Stripe. No se crearán duplicados para el consumo de mensajes.

El ledger de mensajes queda separado de Stripe:

- `tenant_billing_accounts`: suscripción, acceso y estado comercial;
- `tenant_billing_events`: idempotencia de eventos Stripe;
- `cobro_*`: consumo de mensajes, tarifas, periodos, costos y estadísticas.

La configuración específica de límites y alertas por tenant se implementa en `cobro_configuracion_tenant`.

### 9.2 `cobro_tarifas_proveedor`

Catálogo versionado de tarifas publicadas de Meta u otros proveedores. Este catálogo no representa cargos de GEOACTIV.

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

### 9.3 `cobro_configuracion_tenant`

Configuración comercial efectiva por tenant.

Columnas:

```text
organizacion_id uuid primary key references organizaciones(id)
limite_mensajes_periodo integer null
limite_costo_app_periodo numeric(14,4) null
limite_costo_meta_periodo numeric(14,4) null
porcentaje_alerta_consumo smallint not null default 80
suspension_automatica_por_limite boolean not null default false
creado_en timestamptz not null default now()
actualizado_en timestamptz not null default now()
```

### 9.4 `cobro_periodos`

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
costo_meta_periodo numeric(14,4) not null default 0
costo_mensaje_periodo numeric(14,4) not null default 0
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

### 9.5 `cobro_mensajes`

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
tarifa_app_id uuid not null references cobro_tarifas_app(id)
origen_tarifa_app text not null
cargo_app_unitario numeric(12,4) not null default 0.09
cargo_app_importe numeric(12,4) not null default 0
costo_total_mensaje numeric(12,4) not null default 0
```

Constraints críticas:

- `direccion in ('entrante', 'saliente')`;
- `importe = precio_unitario` cuando `facturable = true`;
- `importe = 0` cuando `facturable = false`;
- `costo_meta_importe = costo_meta_unitario` cuando `costo_meta_aplica = true`;
- `costo_meta_importe = 0` cuando `costo_meta_aplica = false`;
- `costo_total_mensaje = costo_meta_importe + cargo_app_importe`;
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

### 9.6 `cobro_hilos_resumen`

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
oportunidad_id uuid null references oportunidades(id)
conversion_atribuida boolean not null default false
conversion_en timestamptz null
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

### 9.7 `cobro_ajustes`

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

### 9.8 `cobro_alertas`

Registro de alertas de consumo y conciliación técnica.

Columnas:

```text
id uuid primary key
organizacion_id uuid not null references organizaciones(id)
periodo_id uuid null references cobro_periodos(id)
tipo text not null
severidad text not null
estado text not null
umbral numeric(14,4) null
valor_actual numeric(14,4) null
mensaje text not null
creado_en timestamptz not null default now()
resuelto_en timestamptz null
resuelto_por_usuario_id uuid null references usuarios(id)
```

La tabla debe tener índices por `(organizacion_id, estado, creado_en)` y `(tipo, estado, creado_en)`.

## 10. Relaciones multitenant

Toda tabla de cobro debe incluir `organizacion_id` aunque también tenga una referencia a otra entidad.

Las relaciones importantes deberán usar claves foráneas compuestas cuando corresponda:

```text
(organizacion_id, mensaje_id)
(organizacion_id, conversacion_id)
(organizacion_id, periodo_id)
```

Esto evita que un registro de un tenant apunte accidentalmente a un mensaje, conversación o periodo de otro tenant.

## 11. Acceso del tenant maestro y tenants normales

### Tenant maestro

El tenant maestro tendrá un visualizador global con:

- todos los tenants;
- mensajes facturables por tenant;
- hilos con actividad por tenant;
- categorías Meta;
- periodos abiertos y cerrados;
- ajustes;
- discrepancias de conciliación;
- tarifa Meta configurada, cargo de GEOACTIV y costo combinado;
- totales globales y por tenant.

El visualizador global deberá mostrar el tenant explícitamente en cada fila y no mezclar totales sin una columna de agrupación.

### Tenant normal

Cada tenant podrá consultar únicamente:

- sus mensajes;
- sus conversaciones;
- sus resúmenes de hilos;
- sus periodos;
- sus importes;
- sus ajustes autorizados;
- sus reportes de consumo.

El tenant podrá consultar la tarifa Meta configurada y sus costos calculados, pero no podrá modificar la tarifa del proveedor.

El tenant normal no podrá:

- cambiar `organizacion_id`;
- modificar `facturable`;
- modificar precios;
- cerrar periodos;
- crear ajustes para otro tenant;
- consultar payloads o datos privados de otro tenant;
- acceder a los totales globales.

La seguridad debe aplicarse en RLS y en backend. Ocultar filas en el frontend no es una medida de autorización.

## 12. Configuración frontend y backend

### Frontend administrativo

El tenant maestro tendrá una pantalla de configuración de tarifas con:

- selector de alcance: global o tenant particular;
- tenant objetivo cuando el alcance sea particular;
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

La configuración debe ofrecer para cada tenant:

- usar tarifa global;
- establecer tarifa particular;
- ver la tarifa efectiva;
- ver si la tarifa efectiva proviene de la configuración global o particular.

El tenant normal verá el precio vigente y sus costos calculados, pero no podrá modificarlo.

### Backend

El backend deberá exponer endpoints administrativos separados:

```text
GET  /api/admin/billing/provider-rates
POST /api/admin/billing/provider-rates
PATCH /api/admin/billing/provider-rates/{rate_id}/close
GET  /api/admin/billing/app-rates
POST /api/admin/billing/app-rates/global
POST /api/admin/billing/app-rates/tenant/{organizacion_id}
PATCH /api/admin/billing/app-rates/{rate_id}/close
POST /api/admin/billing/app-rates/tenant/{organizacion_id}/use-global
```

El backend debe:

- validar rol administrativo;
- validar país, canal, proveedor, categoría e iniciador;
- impedir solapamiento de vigencias;
- permitir editar tarifa global únicamente al dueño de la aplicación;
- permitir editar tarifa particular únicamente al dueño de la aplicación;
- resolver la tarifa efectiva con precedencia particular sobre global;
- permitir quitar el override particular y volver a la tarifa global;
- impedir que el frontend envíe directamente `costo_meta_importe` o `costo_total_mensaje`;
- impedir que el frontend envíe directamente `cargo_app_importe`;
- calcular esos valores desde la tarifa vigente;
- registrar quién creó o cerró una tarifa.

## 13. API propuesta

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

## 14. Totales y fórmula

```text
subtotal_mensajes = mensajes_entrantes_facturables * 0.09
                   + mensajes_salientes_facturables * 0.09
ajustes_total = suma de cobro_ajustes
total = subtotal_mensajes + ajustes_total
costo_meta_periodo = suma de costo_meta_importe
costo_mensaje_periodo = suma de costo_total_mensaje
```

Los importes deben calcularse con `numeric`, nunca con `float`.

## 15. Estados del consumo

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

## 16. Registro, conciliación técnica e idempotencia

El proceso deberá ser idempotente:

1. recibe un mensaje aceptado por Meta/Twilio;
2. busca el proveedor y el ID del mensaje;
3. confirma el tenant desde la conversación y el mensaje;
4. determina la categoría Meta;
5. identifica quién inició el hilo;
6. obtiene la tarifa Meta publicada y vigente si el mensaje es saliente iniciado por la empresa;
7. calcula el cargo de GEOACTIV y el costo combinado;
8. busca si ya existe `cobro_mensajes` para ese proveedor e ID;
9. crea una sola fila de consumo;
10. actualiza o crea el resumen del hilo;
11. actualiza totales del periodo de forma transaccional.

Los eventos de entrega solamente actualizan el estado del consumo relacionado. No crean cargos nuevos.

## 17. Datos históricos

No se deben cobrar automáticamente todos los datos históricos actuales porque existen:

- mensajes sin ID del proveedor;
- mensajes sin evento de entrega;
- tráfico concentrado en el tenant maestro;
- categorías antiguas no normalizadas;
- eventos duplicados.

Se recomienda:

1. iniciar el cobro en una fecha de corte explícita;
2. marcar lo anterior como histórico;
3. ejecutar una conciliación técnica separada para duplicados, estados y mensajes sin proveedor;
4. aplicar créditos o cargos históricos únicamente después de revisión administrativa.

## 18. Reglas de rendimiento

- índices compuestos por `organizacion_id` y fecha;
- índices por `periodo_id`, `facturable` y `categoria_meta`;
- paginación obligatoria;
- agregaciones por periodo, no sobre toda la tabla en cada carga del panel;
- cierre de periodos con totales persistidos;
- vistas o funciones SQL específicas para dashboards;
- no consultar ni filtrar información estructural dentro de JSON;
- evitar joins sin filtro de tenant;
- particionamiento solamente si el volumen futuro lo justifica.

## 19. Auditoría y protección contra fraude o error

Debe conservarse:

- quién generó un ajuste;
- cuándo se cerró un periodo;
- qué tarifa estaba activa;
- qué mensaje originó el cargo;
- qué conversación agrupó el mensaje cobrado;
- qué proveedor confirmó el mensaje;
- qué categoría devolvió Meta;
- qué tarifa Meta estaba vigente;
- cuál fue la tarifa Meta configurada;
- cuál fue el cargo de GEOACTIV;
- cuál fue el costo combinado de conversión;
- por qué un registro fue excluido.

No se deben editar ni borrar cargos de periodos cerrados. Las correcciones deben ser movimientos compensatorios.

### Controles de consumo y alertas

El tenant maestro podrá configurar por tenant, mediante columnas explícitas:

```text
limite_mensajes_periodo integer null
limite_costo_app_periodo numeric(14,4) null
limite_costo_meta_periodo numeric(14,4) null
porcentaje_alerta_consumo smallint not null default 80
suspension_automatica_por_limite boolean not null default false
```

El sistema podrá generar alertas cuando:

- el tenant alcance el porcentaje configurado;
- supere el límite de mensajes;
- supere el límite de cargo GEOACTIV;
- supere el límite de costo Meta configurado;
- el volumen se eleve anormalmente respecto al periodo anterior;
- existan mensajes aceptados sin conciliación técnica.

Las alertas deben ser registros propios, con tenant, tipo, severidad, fecha, estado y usuario que las resolvió. No se guardarán como JSON.

### Métricas de conversión

Los costos se podrán agrupar por conversación y oportunidad para calcular:

```text
costo_por_conversacion
costo_por_lead
costo_por_oportunidad
costo_por_conversion
costo_meta_por_conversion
cargo_app_por_conversion
```

El costo por conversión solamente se calculará cuando exista una conversión atribuida. Antes de eso, se mostrará como costo acumulado de la conversación u oportunidad.

## 20. Riesgos y decisiones pendientes

### Decisión 1: precio de Meta

El documento usa `0.5614 MXN` como tarifa inicial configurable para México y mensajes iniciados por la empresa. Antes de activar estadísticas productivas se debe confirmar la tarifa vigente y su alcance exacto con la cuenta de Meta del tenant.

### Decisión 2: mensajes fallidos

La recomendación es no cobrar mensajes rechazados antes de ser aceptados por el proveedor.

### Decisión 3: canales futuros

El plan inicial cubre WhatsApp/Meta. Email, Messenger, Webchat y otros canales deben tener tipos de cargo separados si se incorporan más adelante.

### Decisión 4: impuestos

Definir si los $0.09 MXN son precio antes de IVA o precio final con IVA incluido. La base debe guardar subtotal, impuesto y total por separado si se requiere facturación fiscal.

## 21. Fases de implementación

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
- crear funciones transaccionales de registro. **Completado para WhatsApp/Meta** mediante `registrar_cobro_mensaje` y `actualizar_cobro_meta_mensaje`.

### Fase 3: backend

- capturar columnas de pricing de Meta. **Implementado para callbacks Cloud API**;
- registrar consumos de forma idempotente. **Implementado después de la persistencia del mensaje WhatsApp**;
- separar estado de proveedor y estado de conciliación;
- crear endpoints tenant y administrador. **Primera versión implementada**;
- evitar que el cliente controle importes o tenant.

### Contrato inicial de consulta backend

Las rutas están bajo `/api/billing` y requieren autenticación:

| Ruta | Alcance | Uso |
|---|---|---|
| `GET /summary` | Tenant autenticado | Periodos, mensajes, hilos, cargo GEOACTIV, costo Meta y total propio |
| `GET /messages` | Tenant autenticado | Ledger propio paginado, con filtros por periodo, dirección y categoría Meta |
| `GET /tariff/effective` | Tenant autenticado | Tarifa GEOACTIV efectiva; override particular o tarifa global |
| `GET /master/summary` | Solo owner | Resumen agregado de todos los tenants |
| `GET /master/tenants` | Solo owner | Catálogo de tenants activos para el selector global |
| `GET /master/summary?organizacion_id={uuid}` | Solo owner | Resumen KPI filtrado por tenant; sin parámetro devuelve el consolidado global |
| `GET /master/messages` | Solo owner | Ledger global paginado, opcionalmente filtrado por tenant mediante `organizacion_id` |
| `POST /master/tariff/app` | Solo owner | Crea una nueva tarifa GEOACTIV global o particular y cierra la versión activa anterior |
| `POST /master/tariff/provider` | Solo owner | Versiona la tarifa informativa del proveedor por canal, país, categoría e iniciador |

El tenant normal no puede solicitar otro `organizacion_id` para ampliar su alcance ni crear tarifas. El tenant maestro no recibe payloads de mensajería ni metadata; recibe solamente columnas del ledger necesarias para operación, auditoría y reportes. Las tarifas anteriores no se editan: se cierran y se crea una nueva versión.

### Fase 4: panel

- visualizador global para tenant maestro. **Implementado con selector Todos los tenants / tenant específico**;
- visualizador propio para cada tenant. **Primera versión implementada**;
- resumen de mensajes, hilos, categorías e importes. **Implementado**;
- detalle auditable por mensaje. **Implementado con paginación, tenant, categoría Meta y dirección**;
- estados vacío, cargando, error y conciliación pendiente. **Implementados los estados de carga, error y vacío**;
- edición visual de tarifa GEOACTIV y tarifa informativa Meta para owner. **Primera versión implementada**.

### Fase 5: prueba

- periodo de prueba sin cobro;
- comparación contra mensajes y eventos actuales;
- pruebas de duplicados y reintentos;
- pruebas RLS entre tenants;
- cierre y reapertura de periodos;
- revisión de importes con casos reales;
- validación de alertas y límites de consumo.

### Fase 6: activación

- establecer fecha de corte;
- activar el plan para tenants seleccionados;
- generar primer periodo en modo revisión;
- aprobar discrepancias;
- cerrar el periodo;
- comenzar facturación.

## 22. Criterio de terminado

El plan estará listo para operar cuando:

- cada mensaje facturable tenga un tenant, proveedor e ID único;
- cada resumen de hilo tenga una conversación única;
- no existan cargos duplicados por webhook o reintento;
- Meta marketing, utility, authentication y service se registren en columnas;
- el tenant maestro vea todos los tenants;
- cada tenant vea únicamente sus datos;
- los periodos cerrados sean inmutables;
- los totales puedan reproducirse desde el ledger;
- los casos no conciliados técnicamente se muestren antes de cobrar;
- la fórmula de $0.09 MXN por cada mensaje entrante o saliente esté publicada y probada.
- el precio Meta de $0.5614 MXN pueda modificarse por vigencia sin cambiar código;
- las estadísticas separen costo Meta, cargo de GEOACTIV y costo combinado;
- el costo Meta no se agregue al cobro de GEOACTIV mientras siga siendo un costo directo del tenant.

## Estado del documento

**Documento base para aprobación comercial y técnica.**

La base de datos, el primer servicio backend de contabilización y el backfill histórico ya están aplicados para WhatsApp/Meta. Todavía no se activa facturación automática. La regla implementada es cobrar $0.09 MXN por cada mensaje entrante o saliente aceptado por el proveedor; el hilo solamente agrupa los mensajes y no genera un cargo adicional.

El backfill histórico insertó 2,018 de 2,603 mensajes. Los 585 excluidos no tenían identificador del proveedor. La información Meta disponible permitió recuperar categorías service y referral_conversion no facturables, pero no permitió identificar mensajes marketing históricos facturables.

## Alineación de plantillas WhatsApp

Las plantillas administradas desde `prospeccion/campanas` son un registro local de una plantilla previamente creada y aprobada en WhatsApp Manager. El nombre técnico, idioma y categoría deben coincidir con Meta.

La tabla `cobro_mensajes` conserva dos conceptos distintos:

- `categoria_meta_configurada`: categoría declarada en el modal y transportada desde la plantilla seleccionada.
- `categoria_meta`: categoría y pricing confirmados por Meta mediante el callback.

La primera sirve para auditoría y detectar desalineaciones; la segunda es la fuente para determinar facturación/costo Meta. Si Meta todavía no envía la categoría, el registro queda como `unknown` y no se debe inferir un cargo Meta solo por la selección del modal.
