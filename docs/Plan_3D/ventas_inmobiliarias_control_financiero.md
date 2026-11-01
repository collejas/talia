# Ventas inmobiliarias: control financiero y cierre

Fecha: 2026-11-01  
Estado: propuesta pendiente de implementación

## Idea principal

Talia tendrá dos vistas comerciales separadas:

```text
/ventas
    Productos y servicios

/ventas-inmobiliarias
    Propiedades y operaciones inmobiliarias
```

No se deben mezclar en una misma pantalla los pedidos de productos con las
operaciones de terrenos, casas o unidades inmobiliarias.

La nueva vista inmobiliaria reutilizará la infraestructura común de Talia,
pero tendrá un flujo y una interfaz propios.

## Qué se reutiliza

La vista de ventas inmobiliarias puede reutilizar:

- Usuarios y permisos.
- Clientes y contactos.
- Oportunidades.
- Pagos y métodos de pago.
- Documentos y archivos.
- Notificaciones.
- Auditoría.
- Reportes y exportaciones.

Reutilizar estos servicios evita duplicar lógica financiera y de seguridad.

## Qué debe permanecer separado

### Productos y servicios

La vista `/ventas` conserva su flujo actual:

- Cotización.
- Pedido.
- Inventario.
- Surtido.
- Entrega.
- Pago y cierre.

### Propiedades

La vista `/ventas-inmobiliarias` tendrá:

- Desarrollo.
- Macrolote.
- Manzana.
- Unidad.
- Comprador.
- Oportunidad.
- Propuesta inmobiliaria.
- Apartado firme.
- Contrato.
- Enganche.
- Plan de pagos.
- Mensualidades.
- Saldo pendiente.
- Pagos recibidos.
- Comisión de socio o agente externo.
- Cierre de la operación.

## Flujo general

```text
/propiedades
    Reserva temporal
        ↓
    Apartado
        ↓
    Documentación
        ↓
    Validación inmobiliaria
        ↓
    Apartado firme

/ventas-inmobiliarias
    Control financiero
        ↓
    Anticipo o enganche
        ↓
    Pagos y saldo
        ↓
    Contrato y cierre
```

Una reserva o apartado pendiente no debe aparecer como ingreso cerrado. Solo
debe pasar al control financiero cuando cumpla las condiciones definidas para
apartado firme o autorización de cierre.

## Estados propuestos

- `apartado_firme`: expediente validado y listo para control financiero.
- `pago_inicial_pendiente`: falta registrar el enganche o anticipo.
- `en_pago`: existen pagos, pero queda saldo pendiente.
- `liquidada`: el saldo comercial está cubierto.
- `en_cierre`: contrato y documentación final en proceso.
- `cerrada`: operación inmobiliaria concluida.
- `cancelada`: operación anulada, con motivo y trazabilidad.

Los nombres exactos se validarán contra los estados existentes antes de crear
la migración.

## Operaciones externas

La venta puede ser atribuida a un socio o agente externo.

La vista debe mostrar por separado:

- Socio comercial.
- Agente externo.
- Usuario interno que capturó la operación.
- Comisión pactada.
- Comisión pendiente, autorizada, pagada o cancelada.

El usuario interno que registra la operación no debe aparecer como vendedor
externo. La comisión tampoco debe alterar el precio comercial de la unidad ni
el ingreso bruto de la desarrolladora.

## Reglas principales

1. Una unidad no puede tener dos operaciones financieras activas.
2. Una reserva temporal no genera una venta financiera.
3. Un apartado pendiente de validación no genera ingreso cerrado.
4. El precio debe provenir de la ficha de la unidad.
5. Los descuentos o cambios de precio requieren autorización.
6. Los pagos deben quedar ligados a la operación inmobiliaria.
7. Cada pago debe conservar fecha, monto, método, referencia y usuario que lo
   registró.
8. Una cancelación debe conservar el historial y actualizar el saldo.
9. Una operación externa debe conservar socio, agente y comisión.
10. Los reportes deben separar ventas internas y externas.

## Diseño de la vista

La vista `/ventas-inmobiliarias` debe incluir:

- Filtros por estado.
- Filtro por desarrollo, macrolote y manzana.
- Filtro por socio y agente externo.
- Filtro por rango de fechas.
- Búsqueda por comprador, oportunidad o unidad.
- Tabla de operaciones.
- Resumen de ingresos.
- Anticipos recibidos.
- Saldo pendiente.
- Comisiones por pagar.
- Acceso al expediente documental.

Cada registro debe mostrar como mínimo:

```text
Comprador · Oportunidad · Desarrollo · Macrolote · Manzana · Unidad
Estado · Precio · Pagado · Saldo · Socio · Agente · Fecha
```

## Fases de implementación

### Fase 1: Vista y consulta

- Crear `/ventas-inmobiliarias`.
- Listar operaciones inmobiliarias firmes y cerradas.
- Agregar filtros y búsqueda.
- Mostrar relaciones completas de la unidad.
- Mostrar socio y agente externo.

### Fase 2: Pagos

- Registrar anticipos y mensualidades.
- Calcular saldo.
- Consultar historial de pagos.
- Emitir recibos o comprobantes.

### Fase 3: Cierre

- Controlar contrato final.
- Confirmar liquidación.
- Registrar cierre inmobiliario.
- Actualizar informes y KPIs.

### Fase 4: Comisiones y reportes

- Autorizar comisiones.
- Registrar pagos a agentes externos.
- Reportar ventas internas y externas.
- Exportar operaciones y saldos.

## Decisión recomendada

No crear una segunda aplicación financiera ni duplicar la vista de productos.

La decisión recomendada es:

> Crear una vista inmobiliaria separada y reutilizar los servicios comunes de
> pagos, documentos, permisos, auditoría y reportes.

Antes de programar se debe validar esta propuesta y definir qué condición
exacta convierte un apartado en una operación financiera activa.
