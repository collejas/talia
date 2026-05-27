# Avance de base de datos para ordenes de compra

Fecha: 2026-05-25

## Estado actual

La migracion de base de datos para soportar ordenes de compra locales e internacionales ya fue aplicada con exito en Supabase.

## Lo que ya quedo en base de datos

### Catalogos de soporte

- `public.incoterms`
- `public.monedas`
- `public.modos_transporte`

### Catalogo reutilizado

- `public.geo_paises` se reutiliza como fuente unica de paises

### Extensiones a la orden de compra

- `public.ordenes_compra`
  - `tipo_operacion`
  - `tipo_cambio_referencia`
  - `vigencia_hasta`
  - `proforma_referencia`

- `public.ordenes_compra_items`
  - snapshot historico de partidas con:
    - descripcion
    - marca
    - modelo
    - fabricante
    - pais de origen
    - pais de procedencia
    - fraccion arancelaria
    - HS code
    - NICO
    - peso
    - volumen
    - lote
    - serie
    - caducidad

### Tablas satelite por orden

- `public.ordenes_compra_condiciones_comerciales`
- `public.ordenes_compra_condiciones_pago`
- `public.ordenes_compra_logistica`
- `public.ordenes_compra_documentos`
- `public.ordenes_compra_autorizaciones`
- `public.ordenes_compra_eventos`

## Reglas ya modeladas

- una sola tabla madre de ordenes de compra
- un solo flujo para orden nacional e internacional
- los campos internacionales se activan segun `tipo_operacion`
- los snapshots historicos de la orden no dependen de cambios futuros en catalogos
- los paises se toman desde `geo_paises`

## Lo que sigue

1. Backend
   - endpoints CRUD de ordenes de compra
   - lectura/escritura de condiciones comerciales, pago, logistica, documentos y eventos
   - reglas de validacion por tipo de orden

2. UI
   - formulario de alta/edicion de orden
   - selectores de incoterm, moneda, modo de transporte y pais
   - ocultar/mostrar campos segun orden nacional o internacional

3. Integracion operativa
   - recepcion
   - autorizaciones
   - bitacora
   - control de documentos

## Nota

Esta base de datos ya no requiere un catalogo nuevo de paises: la referencia oficial es `public.geo_paises`.

## Avance adicional ya implementado

### Backend

El backend ya quedo conectado para:

- crear y editar ordenes de compra;
- registrar documentos y proforma;
- administrar pagos programados por orden;
- editar y eliminar pagos individuales;
- normalizar montos a MXN con tipo de cambio historico de Banxico;
- separar pagos de cumplimiento y gastos adicionales;
- validar eventos base, vencimientos y moneda por movimiento.

### UI

La interfaz de `Compras` ya quedo reorganizada con:

- acceso directo principal fuera de `Settings`;
- vistas internas por modulo;
- formulario de orden separado del flujo de pagos;
- tabla de pagos registrados con:
  - tipo;
  - estado;
  - evento;
  - monto original;
  - tipo de cambio;
  - monto en MXN;
  - fecha de recepcion;
  - fecha de pago;
  - vencimiento;
  - referencia;
  - acciones de editar y eliminar.

### Flujo operativo actual

1. Se crea la orden de compra.
2. Se guardan condiciones, logistica y documentos.
3. Se registra el pago de anticipo o saldo.
4. Se registran pagos parciales y gastos adicionales.
5. Cada movimiento puede editarse o eliminarse individualmente.
6. Cada movimiento se normaliza a MXN con el tipo de cambio del dia de pago.
