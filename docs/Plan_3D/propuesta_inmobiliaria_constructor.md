# Propuesta inmobiliaria desde una oportunidad

Fecha: 2026-10-21 (UTC)  
Estado: Idea documentada; pendiente de aprobación e implementación

## Objetivo

Separar el constructor de cotizaciones de productos y servicios del flujo
inmobiliario que se abre desde una oportunidad del Embudo.

Cuando la oportunidad corresponda a una propiedad, el usuario debe ver un
constructor propio llamado **Propuesta inmobiliaria**. Este constructor debe
obtener la unidad, el desarrollo, el comprador, el precio y las condiciones
desde la operación inmobiliaria, sin obligar al vendedor a buscar la propiedad
en el catálogo general.

La separación es funcional y visual, pero las propuestas deben conservar la
compatibilidad con el ciclo comercial existente de cotización, aceptación,
pedido, venta y cliente.

## Diagnóstico actual

El modal que se abre desde una oportunidad está implementado en:

```text
frontend/panel/src/components/embudo/lead-drawer.tsx
```

Actualmente funciona como un constructor genérico:

- Se titula `Nueva cotización`.
- Carga `/api/catalog/items?limit=500&solo_vendibles=true`.
- Permite seleccionar productos, listas de precios, cantidades y descuentos.
- Calcula subtotal, IVA y total con reglas generales.
- Genera el PDF mediante el flujo genérico de cotizaciones.
- Envía la propuesta por correo o WhatsApp.
- Utiliza el endpoint genérico de oportunidades:
  `POST /api/embudo/leads/{oportunidad_id}/quotes`.

El backend recibe `LeadQuoteCreatePayload`, que está diseñado para partidas de
catálogo. No existe todavía un contrato específico que cargue automáticamente:

- `propiedad_id`.
- `unidad_id`.
- `operacion_inmobiliaria_id`.
- Desarrollo y nivel/manzana.
- Estado comercial de la unidad.
- Precio de lista y precio acordado.
- Importe del apartado.
- Forma de adquisición.
- Condiciones y vigencia de la reserva.
- Documentos pendientes del comprador.

Por ello, una oportunidad inmobiliaria puede terminar usando el constructor de
productos y producir una cotización sin suficiente trazabilidad inmobiliaria.

## Decisión funcional

El sistema debe resolver el dominio comercial de la oportunidad antes de abrir
el constructor:

```text
Oportunidad
   |
   +-- productos_servicios -> Cotización
   |
   +-- propiedades         -> Propuesta inmobiliaria
   |
   +-- mixto               -> Elegir el flujo o permitir ambos con relaciones separadas
```

La detección no debe depender únicamente de que el tenant tenga habilitado el
módulo de propiedades. Debe depender de la oportunidad concreta y de sus
relaciones comerciales.

## Nombre y acciones de la interfaz

Para oportunidades de productos y servicios se conserva:

- Botón: `Cotizar`.
- Modal: `Nueva cotización`.
- Acción principal: `Crear cotización` o `Enviar cotización`.

Para oportunidades inmobiliarias se muestra:

- Botón: `Crear propuesta inmobiliaria`.
- Modal: `Nueva propuesta inmobiliaria`.
- Acción principal: `Generar propuesta` o `Enviar propuesta inmobiliaria`.

El usuario no debe ver dentro del constructor inmobiliario:

- Buscador general de productos.
- Listas de precios de productos.
- Selector libre de productos vendibles.
- Mensajes que hablen de inventario o partidas de producto.
- Campos que permitan sustituir accidentalmente la unidad relacionada.

## Datos que debe mostrar el constructor inmobiliario

### Identificación de la operación

- Desarrollo.
- Propiedad o proyecto.
- Capa, nivel y manzana, cuando existan.
- Unidad y clave visible.
- Estado actual de la unidad.
- Folio de la oportunidad.
- Comprador principal.
- Empresa o cuenta relacionada, si aplica.

### Condiciones comerciales

- Precio de lista.
- Precio ofrecido.
- Precio acordado.
- Precio final, cuando exista.
- Moneda.
- Importe del apartado.
- Forma de adquisición.
- Fecha límite de reserva.
- Condiciones de reserva.
- Vigencia de la propuesta.

### Documentación y seguimiento

- Documentos requeridos.
- Documentos cargados.
- Documentos aprobados o pendientes de corrección.
- Estado de validación del apartado.
- Observaciones comerciales.
- Observaciones del comprador.

Los datos relacionados con la unidad y la operación deben aparecer como datos
de contexto y fuente de verdad. El constructor solo debe permitir editar los
campos que el estado de la operación permita modificar.

## Reglas de precio

El precio debe seguir la misma regla documentada para el flujo inmobiliario:

```text
Operación inmobiliaria
        |
        +--> Cotización / propuesta
                |
                +--> Partida de cotización
                        |
                        +--> Pedido de venta
                                |
                                +--> Venta formal
```

En estado `reservado` o `apartado`:

- El precio acordado de la operación es la fuente comercial vigente.
- La propuesta debe mostrar ese precio.
- El total de la cotización debe coincidir con el precio de la operación.
- La partida debe conservar `catalog_item_id`, `propiedad_id` y `unidad_id`.
- Un cambio de precio debe actualizar operación, cotización y partida de forma
  controlada.

Una propuesta aceptada debe conservar su precio como documento histórico. Si el
precio cambia después de aceptarla, se debe crear una nueva versión o una nueva
propuesta, no sobrescribir silenciosamente la anterior.

## Modelo de datos propuesto

La información estructural de la operación no debe depender exclusivamente de
`metadata` o `jsonb`.

Se propone agregar columnas explícitas donde todavía no existan:

### `oportunidades`

- `dominio_comercial`: `productos_servicios`, `propiedades` o `mixto`.

### `cotizaciones`

- `dominio_comercial`.
- `propiedad_id`.
- `unidad_id`.
- `operacion_inmobiliaria_id`.

### `cotizacion_items`

La partida debe continuar vinculada a `catalog_item_id` y conservar el precio
comercial aplicado. Si se requiere consultar la unidad directamente por
partida, se evaluará agregar `propiedad_id` y `unidad_id`; si la relación de la
cabecera es suficiente, no se duplicarán innecesariamente esas columnas.

Las columnas deben incluir tenant, foreign keys, índices y constraints
compatibles con las relaciones existentes.

## Resolución del dominio

La prioridad recomendada para determinar el constructor es:

1. `oportunidades.dominio_comercial`, cuando esté informado.
2. Una operación inmobiliaria activa que tenga `oportunidad_id`.
3. Una unidad inmobiliaria relacionada con la oportunidad.
4. Un `catalog_item` con relación inmobiliaria explícita.
5. Compatibilidad temporal con la metadata histórica de oportunidades creadas
   por el flujo de propiedades.

La metadata histórica puede servir para el backfill y la transición, pero no
debe ser la fuente definitiva del nuevo flujo.

## Contratos backend propuestos

Se deben conservar los endpoints genéricos de productos y agregar contratos
inmobiliarios explícitos.

### Contexto inmobiliario

```text
GET /api/embudo/leads/{oportunidad_id}/property-context
```

Debe devolver, validado por tenant y permisos:

- Oportunidad.
- Operación inmobiliaria activa.
- Unidad.
- Desarrollo, capa y manzana.
- Comprador y cuenta.
- Cotización o propuesta vigente.
- Documentos y estado de validación.

### Crear propuesta inmobiliaria

```text
POST /api/embudo/leads/{oportunidad_id}/property-proposals
```

El backend debe:

1. Validar que la oportunidad pertenece al tenant.
2. Validar que existe una operación o unidad inmobiliaria relacionada.
3. Validar estado, precio y moneda.
4. Reutilizar la oportunidad y operación existentes.
5. Crear o actualizar una cotización inmobiliaria en borrador.
6. Crear o actualizar su partida inmobiliaria.
7. Copiar la relación de propiedad, unidad y catálogo.
8. Actualizar el monto de la oportunidad.
9. Generar el PDF con plantilla inmobiliaria.
10. Mantener idempotencia por oportunidad, unidad y versión.

### Vista previa

```text
POST /api/embudo/leads/{oportunidad_id}/property-proposals/pdf
```

Debe usar el mismo contexto validado que la creación y no crear una propuesta
persistente únicamente por previsualizarla.

### Envío

```text
POST /api/embudo/leads/{oportunidad_id}/property-proposals/send
```

Debe reutilizar la propuesta creada o crear una nueva versión explícita, y
conservar evidencia del canal, destinatario, fecha y versión enviada.

## Arquitectura frontend propuesta

Mantener el modal principal del embudo como coordinador y separar los
constructores:

```text
LeadDrawer
   |
   +-- ProductQuoteBuilder
   |
   +-- PropertyProposalBuilder
```

Componentes sugeridos:

- `product-quote-builder.tsx`
- `property-proposal-builder.tsx`
- `property-proposal-summary.tsx`
- `property-proposal-documents.tsx`
- `property-proposal-api.ts`

El constructor inmobiliario debe contemplar estados de:

- Cargando contexto.
- Operación no encontrada.
- Unidad ya vendida.
- Precio pendiente.
- Cotización aceptada protegida.
- Documentos incompletos.
- Propuesta generada.
- Propuesta enviada.

## PDF y lenguaje comercial

La plantilla inmobiliaria debe usar lenguaje propio de la operación:

- `Propuesta inmobiliaria`.
- `Unidad seleccionada`.
- `Desarrollo`.
- `Precio acordado`.
- `Importe de apartado`.
- `Condiciones de reserva`.
- `Vigencia de la propuesta`.
- `Documentación requerida`.

No debe presentar una unidad como si fuera inventario de almacén ni mostrar
campos de entrega logística propios de productos, salvo que el negocio los
requiera expresamente.

## Permisos y seguridad

El flujo debe validar de forma independiente:

- Tenant de la oportunidad.
- Tenant de la operación y unidad.
- Permiso para consultar propiedades.
- Permiso para crear o editar propuestas.
- Permiso para enviar propuestas.
- Permiso para modificar precio o condiciones.
- Ownership o alcance comercial del vendedor.

El frontend puede ocultar el constructor incorrecto, pero el backend debe
rechazar una petición de cotización de productos para una oportunidad
inmobiliaria cuando el contrato no corresponda.

## Plan de implementación

### Fase 1: resolver dominio

- Agregar el dominio explícito de la oportunidad.
- Implementar resolver backend y BFF.
- Backfill de oportunidades inmobiliarias existentes.
- Mantener fallback temporal para registros antiguos.

### Fase 2: contexto inmobiliario

- Crear endpoint de contexto inmobiliario.
- Validar relaciones de operación, unidad y comprador.
- Agregar pruebas tenant-scoped y de estados inválidos.

### Fase 3: constructor frontend

- Extraer el constructor actual de productos.
- Crear `PropertyProposalBuilder`.
- Cambiar títulos, campos, acciones y estados.
- Bloquear selector general de productos en propiedades.

### Fase 4: backend de propuesta

- Crear contratos inmobiliarios de creación, PDF y envío.
- Reutilizar servicios de folios, PDF, correo, WhatsApp e historial.
- Mantener la cotización y sus partidas relacionadas explícitamente.

### Fase 5: integración con cierre

- Preparar cierre desde la propuesta aceptada.
- Crear o reutilizar pedido de venta.
- Confirmar venta y actualizar la unidad a `vendido`.
- Mostrar la venta en Clientes y Ventas.

## Criterios de aceptación

- Una oportunidad de productos abre `Nueva cotización`.
- Una oportunidad inmobiliaria abre `Propuesta inmobiliaria`.
- El constructor inmobiliario no carga el catálogo general como selector libre.
- La unidad se obtiene de la operación relacionada.
- El precio mostrado coincide con la operación y cotización.
- La propuesta conserva propiedad, unidad, catálogo y operación.
- Una propuesta aceptada no puede modificarse silenciosamente.
- El PDF usa lenguaje y datos inmobiliarios.
- La propuesta se puede enviar por los canales autorizados.
- `Preparar cierre` reutiliza la propuesta aceptada.
- La confirmación final crea una sola venta y marca la unidad como vendida.
- Una oportunidad de productos no puede crear accidentalmente una propuesta
  inmobiliaria.
- Las pruebas validan tenant, permisos, estados, duplicados e idempotencia.

## Documentos relacionados

- [Automatización de la operación y venta inmobiliaria](./automatizacion_operacion_venta_inmobiliaria.md)
- [Plan de ventas integradas](./plan_ventas_integradas.md)
- [Ventas asociadas a leads y clientes](./ventas_asociadas_leads_clientes.md)
- [Plan de operaciones inmobiliarias](./plan_operaciones_inmobiliarias_apartado_reservado_vendido.md)

