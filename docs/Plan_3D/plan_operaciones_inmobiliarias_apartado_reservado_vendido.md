# Plan de operaciones inmobiliarias: Apartado, Reservado y Vendido

Fecha: 2026-10-10 (UTC)  
Estado: Definición funcional base

## Objetivo

Definir el flujo operativo común para las propiedades inmobiliarias de Tal-IA,
separando la disponibilidad comercial de la propiedad del expediente y del
seguimiento de la operación.

La operación inmobiliaria comienza en **Apartado**. La etapa **Reservado**
concentra la formalización contractual, el pago y el expediente principal.
**Vendido** representa el cierre comercial y documental final.

Este documento es la referencia funcional para casas, departamentos, terrenos
y unidades de desarrollos inmobiliarios, con requisitos configurables por
inmobiliaria y tipo de inmueble.

## Principio de experiencia de usuario

La complejidad pertenece al modelo interno de Tal-IA; el agente solo debe ver
la acción actual, la información necesaria y el siguiente paso.

El usuario no debe necesitar comprender `operaciones_inmobiliarias`, las
transiciones internas, los estados del expediente ni la estructura de las
entidades relacionadas para operar una propiedad.

La operación debe gestionarse desde el detalle de la propiedad, con una acción
principal que cambie según su disponibilidad:

| Estado | Acción principal |
| --- | --- |
| `disponible` | Apartar propiedad |
| `apartada` | Reservar propiedad |
| `reservada` | Finalizar venta |
| `vendida` | Consultar expediente |

También debe estar disponible **Reservar propiedad** desde `disponible` cuando
no sea necesario crear un apartado previo.

No se deben mostrar como acciones del usuario conceptos técnicos como:

- Crear operación.
- Formalizar expediente.
- Generar transición.
- Cambiar estado interno del expediente.

Esos conceptos existen en la lógica interna, pero no forman parte del lenguaje
principal de la interfaz.

## Vista única de la operación

El detalle de la propiedad debe concentrar la consulta y la continuación de la
operación, sin obligar al agente a navegar por módulos separados.

La vista debe mostrar una progresión sencilla:

```text
Apartado  ━━━  Reservado  ━━━  Vendido
```

Debajo se muestra únicamente la información relevante para la etapa actual,
por ejemplo:

- Propiedad.
- Cliente principal.
- Precio acordado.
- Forma de compra.
- Estado actual.
- Próximo paso recomendado.

Las acciones secundarias deben depender del estado y de los permisos:

- Apartada: `Reservar`, `Liberar`, `Extender`.
- Reservada: `Continuar operación`, `Finalizar venta`.
- Vendida: `Consultar expediente`.

La acción `Extender` debe respetar el límite y la autorización definidos para
la inmobiliaria. `Liberar` debe conservar el historial y no borrar la
operación.

## Formularios progresivos

El detalle de los datos precargados desde el contacto y la oportunidad, los
datos propios de la reserva y el orden definitivo del cuestionario se encuentra
en [Diseño del formulario de reserva inmobiliaria](./diseno_formulario_reserva_datos.md).

### Apartar propiedad

El formulario debe poder completarse en menos de un minuto. Solo debe mostrar:

- Cliente principal, con opción de seleccionar o agregar.
- Tiempo de apartado: 24, 48 o 72 horas, con 48 horas seleccionadas por defecto.
- Forma de compra: contado, crédito o por definir, con `por definir` como valor inicial.
- Motivo del apartado.
- Observaciones opcionales.

La propiedad, el agente, la fecha de inicio y la fecha de vencimiento se
obtienen automáticamente. La forma de compra puede quedar vacía o como `por
definir`.

Con los valores predeterminados, normalmente el agente solo necesita
seleccionar el cliente y el motivo antes de confirmar el apartado.

No se deben solicitar todavía todos los compradores, el expediente financiero,
el contrato ni el comprobante de pago.

### Reservar propiedad

La reserva debe ser un formulario guiado y progresivo, no una pantalla con todo
el expediente visible al mismo tiempo.

#### 1. Comprador y condiciones

- Compradores definitivos.
- Precio acordado.
- Fecha límite de la reserva.

#### 2. Forma de compra

- ¿Cómo comprará la propiedad?
  - Contado.
  - Crédito.
  - Mixto.
  - Otro.

Si selecciona **Crédito**, Tal-IA pregunta el tipo:

- Bancario.
- Infonavit.
- Fovissste.
- Otro.

Al seleccionar una forma de compra se muestran únicamente los campos y
documentos correspondientes. Internamente se conserva el catálogo detallado
de formas y fuentes de financiamiento.

#### 3. Pago y contrato

- Importe de reserva.
- Comprobante de pago.
- Plantilla de contrato.
- Datos de las personas que firmarán.
- Contrato generado y contrato firmado.
- Condiciones acordadas.

La reserva debe ofrecer dos acciones:

- **Guardar avance:** conserva la información capturada como borrador, no
  cambia el estado de la propiedad y no extiende el apartado.
- **Confirmar reserva:** valida los requisitos obligatorios y cambia la
  propiedad a `reservada` cuando todos estén cumplidos.

Los calendarios, documentos adicionales, actividades y seguimientos posteriores
se consultan en **Detalles de la operación**, sin saturar el formulario inicial.

La propiedad solo cambia a `reservada` cuando se cumplen los requisitos de
formalización definidos. Un borrador de reserva no prolonga automáticamente el
apartado.

El contrato debe estar dentro del mismo panel que abre el botón `Reservar`.
El agente no debe salir al módulo de documentos ni navegar a otra pantalla para
prepararlo. Desde ese panel debe poder:

- Seleccionar la plantilla del tenant.
- Revisar los datos que se insertarán del comprador o compradores.
- Generar el contrato con la información de la operación.
- Imprimirlo o descargarlo para firma.
- Adjuntar el contrato firmado.
- Guardar el avance junto con los datos de la reserva y sus documentos.

`Guardar avance` conserva el contrato generado o adjunto, pero no cambia la
propiedad a `Reservada`. `Confirmar reserva` valida que exista el contrato
firmado, el pago confirmado y los demás requisitos obligatorios antes de
realizar el cambio de estado.

#### Contrato de la reserva

El contrato forma parte de la formalización de `Reservada`. Cada inmobiliaria
debe poder capturar sus propias plantillas, porque Tal-IA no debe imponer un
contrato legal universal para todos los tenants, tipos de inmueble u
operaciones.

El tenant podrá administrar:

- Nombre de la plantilla.
- Tipo de operación.
- Texto editable del contrato.
- Variables disponibles.
- Versión de la plantilla.
- Estado activo o inactivo.

La plantilla podrá utilizar variables que Tal-IA sustituirá con información
registrada en la operación, por ejemplo:

```text
{{comprador.nombre_completo}}
{{comprador.domicilio}}
{{propiedad.nombre}}
{{propiedad.direccion}}
{{operacion.precio_acordado}}
{{operacion.importe_reserva}}
{{operacion.fecha_reserva}}
{{inmobiliaria.nombre}}
```

Al preparar una reserva, el agente debe poder:

1. Seleccionar la plantilla del tenant.
2. Revisar o completar los datos del comprador o compradores.
3. Identificar a todas las personas que firmarán y su calidad en el contrato.
4. Generar una vista previa con los datos sustituidos.
5. Generar y descargar el contrato.
6. Adjuntar la versión firmada.
7. Confirmar la reserva cuando el contrato, el pago y los demás requisitos
   obligatorios estén completos.

Los firmantes no deben limitarse a un único comprador. La operación debe poder
registrar, cuando corresponda:

- Comprador principal.
- Compradores adicionales.
- Representante legal.
- Propietario o vendedor.
- Representante de la inmobiliaria.

El contrato generado debe conservar una copia inmutable del texto, los datos
utilizados, la versión de la plantilla, la fecha de generación y los
firmantes. Si el tenant modifica posteriormente la plantilla, ese cambio no
debe alterar contratos ya generados.

La firma electrónica integrada puede incorporarse posteriormente. En la
primera versión, Tal-IA debe permitir generar el contrato y adjuntar el
archivo firmado, registrando al menos su estado, fecha y evidencia asociada.

### Finalizar venta

El cierre debe reutilizar los datos ya capturados y mostrar únicamente lo que
falta para completar la venta:

- Comprador precargado.
- Precio final precargado y editable.
- Total recibido calculado.
- Saldo pendiente calculado.
- Fecha de venta predeterminada.
- Documento final.
- Comisión calculada, cuando aplique.
- Documentación de cierre correspondiente.

Si existe un requisito obligatorio pendiente, Tal-IA debe indicarlo claramente
en la misma pantalla y permitir resolverlo desde allí.

## Estados visibles y pendientes

La interfaz no debe mostrar estados administrativos separados como:

- Formalizado.
- Documentación complementaria pendiente.
- Financiamiento pendiente.
- En escrituración.

Estos estados continúan existiendo internamente en el expediente, pero para el
agente se presentan como un único estado comercial acompañado de un pendiente
contextual. Por ejemplo:

```text
RESERVADA
Pendiente: aprobación del crédito hipotecario.
```

El pendiente debe responder automáticamente a la información del expediente y
mostrar el siguiente paso recomendado.

## Patrón de interacción

Las acciones de la operación deben abrirse en un panel lateral (*drawer*) desde
el detalle de la propiedad:

- `Apartar propiedad` abre el panel corto de apartado.
- `Reservar propiedad` abre el panel guiado de reserva.
- `Finalizar venta` abre el panel de cierre.

El agente permanece dentro de la propiedad que está gestionando y no necesita
navegar a una página independiente para cada etapa. En dispositivos móviles,
el panel lateral puede convertirse en una pantalla completa.

La simplicidad visual no elimina los controles internos. Aunque no sean
visibles como estados técnicos, Tal-IA debe seguir validando disponibilidad,
pagos, contratos, permisos, vencimientos y requisitos de cierre.

## Criterios de experiencia

- Apartar: completar normalmente en 30 a 60 segundos.
- Reservar: formulario guiado en tres secciones, con posibilidad de guardar
  avances.
- Vender: revisar pendientes y confirmar el cierre.

No se agregan nuevas etapas comerciales ni estados visibles por estas mejoras.

## Documentos relacionados

- [Plan de estados comerciales y precio por m2 en propiedades](./plan_estados_comerciales_y_precio_m2_propiedades.md)
- [Flujo integrado: propiedades, catalog items y ventas](../ventas_productos_propiedades_unidades/flujo_integrado.md)
- [Plan de normalización de inventario, ventas y personas](./plan_normalizacion_inventario_ventas_personas.md)
- [Changelog de estados visuales de propiedades](./changelog_estados_propiedades.md)

Los documentos anteriores describen el inventario, la integración con ventas y
la representación visual. Este documento fija el significado operativo de las
etapas de la operación inmobiliaria.

## Flujo comercial

```text
Disponible
    |
    v
Apartado
Bloqueo temporal
    |
    v
Reservado
Contrato, pago y expediente de formalización
    |
    v
Vendido
Cierre comercial y documental final
```

También se permiten las siguientes transiciones:

- `disponible -> apartado`
- `disponible -> reservado`, cuando no se necesita un apartado previo
- `apartado -> disponible`, por cancelación o vencimiento válido
- `apartado -> reservado`, al completar los requisitos de formalización
- `reservado -> disponible`, cuando la operación se cancela conforme a sus condiciones
- `reservado -> vendido`, al cumplir los criterios de cierre

No se permite que una oferta o una oportunidad, por sí solas, cambien la
disponibilidad de la propiedad.

## Estados de disponibilidad

Los estados comerciales de `propiedad_unidades` son:

| Estado | Color | Significado |
| --- | --- | --- |
| `disponible` | Verde | Puede comercializarse y no tiene un bloqueo operativo activo. |
| `apartado` | Amarillo | Tiene un bloqueo temporal sin pago ni contrato de compraventa. |
| `reservado` | Naranja | Existe un compromiso formal con pago y contrato. |
| `vendido` | Rojo | El cierre comercial y documental final fue validado. |

El estado de disponibilidad es la representación actual de la operación, pero
la fuente de verdad es la entidad de operación inmobiliaria y su historial de
transiciones.

## Responsabilidad de cada etapa

### Apartado

El apartado permite bloquear temporalmente una unidad para que el interesado
complete su decisión o reúna los requisitos de formalización.

Debe ser rápido y solicitar únicamente la información mínima:

- Propiedad.
- Cliente o compradores básicos.
- Agente responsable.
- Fecha y hora de inicio, generada por el sistema.
- Fecha y hora de vencimiento, generada según la política de la inmobiliaria.
- Motivo del apartado.
- Forma de adquisición prevista, que puede quedar como `por definir`.
- Precio ofrecido y observaciones, cuando existan.

Reglas:

- No requiere pago.
- No requiere contrato de compraventa.
- Solo puede existir un apartado activo que bloquee una propiedad.
- El cliente debe estar registrado en el CRM.
- El vencimiento es obligatorio.
- La duración inicial recomendada es de 48 horas.
- La inmobiliaria puede configurar 24, 48 o 72 horas.
- La extensión debe ser excepcional, única y autorizada.
- El vencimiento libera la unidad automáticamente si no existe una reserva
  formalizada u otra condición válida registrada.
- El vencimiento y las extensiones deben quedar auditados.

Un borrador de reserva no prolonga por sí mismo el apartado. Si se necesita
más tiempo, debe registrarse una extensión autorizada.

### Reservado

La reserva es el compromiso formal de la operación. La acción **Convertir a
reserva** reutiliza la información del apartado, la oportunidad o la oferta,
pero exige completar y validar los requisitos de formalización.

Requisitos mínimos para cambiar la propiedad a `reservado`:

- Compradores definitivos identificados.
- Agente responsable.
- Precio acordado.
- Forma de adquisición confirmada.
- Fuentes de financiamiento registradas, cuando correspondan.
- Importe de reserva registrado.
- Pago confirmado y comprobante asociado.
- Contrato firmado por las partes correspondientes.
- Fecha límite de la reserva.
- Condiciones de cancelación y devolución.
- Condiciones para aplicar el pago al precio.

La reserva puede estar condicionada a la aprobación definitiva o dispersión de
un crédito si esa condición está documentada. En ese caso se registra como
seguimiento contractual y no se cancela automáticamente por una regla general
del sistema.

El expediente de reserva debe distinguir entre:

- Requisitos obligatorios para formalizar la reserva.
- Documentación complementaria pendiente.
- Condiciones financieras posteriores.
- Actividades de escrituración y cierre.

Por tanto, “expediente completo” significa completo para formalizar la
reserva; no significa que ya estén terminados el crédito, el avalúo, la
notaría o la escritura.

### Vendido

La acción **Finalizar venta** presenta una lista de verificación con los
pendientes del expediente y reutiliza los datos ya capturados.

Debe registrar y validar:

- Documento final de compraventa.
- Precio final.
- Estado de pagos y liquidación.
- Fecha de formalización.
- Documentación de cierre.
- Comisión, cuando aplique.
- Información notarial y de escrituración, cuando corresponda.
- Criterio de cierre configurado por la inmobiliaria.

La etapa Vendido no vuelve a solicitar el expediente completo. Solo completa,
valida y congela la información final de la operación.

El estado de escrituración, entrega, liquidación o cierre jurídico se administra
dentro del expediente y no crea nuevos estados comerciales de disponibilidad.

## Información progresiva

La oportunidad comercial y las ofertas permanecen independientes del flujo
operativo. Pueden precargar información, pero no son pasos obligatorios.

| Información | Apartado | Reservado | Vendido |
| --- | --- | --- | --- |
| Compradores | Básicos | Definitivos | Validados en cierre |
| Agente | Obligatorio | Heredado y validado | Heredado |
| Precio | Ofrecido, opcional | Acordado | Final |
| Forma de adquisición | Prevista | Confirmada | Validada |
| Financiamiento | Tipo previsto | Expediente financiero | Cumplimiento |
| Pagos | No requerido | Reserva y calendario | Liquidación |
| Contratos | No requerido | Contrato obligatorio | Documento final |
| Documentos | Mínimos | Expediente de formalización | Complementarios de cierre |
| Vencimiento | Automático | Contractual | No aplica |
| Cancelación | Simple y auditada | Según contrato | Procedimiento de cierre |
| Comisión | No | Proyección | Liquidación |

## Forma de adquisición y financiamiento

La forma de adquisición puede capturarse desde la oportunidad como dato
previsto, pero se vuelve obligatoria al formalizar la reserva.

Las opciones configurables incluyen:

- Contado.
- Crédito hipotecario bancario.
- Infonavit.
- Fovissste.
- Cofinanciamiento.
- Financiamiento del desarrollador.
- Pago directo en parcialidades.
- Operación mixta.
- Por definir.

Debe mantenerse la separación entre:

- Forma de adquisición.
- Fuentes de financiamiento.
- Calendario de pagos.
- Pagos efectivamente recibidos.

Un crédito aprobado no equivale a un pago recibido. El expediente debe poder
registrar varios compradores y varias fuentes de financiamiento para una misma
operación.

## Estado del expediente

El estado del expediente es independiente del estado comercial:

| Disponibilidad | Expediente posible |
| --- | --- |
| `apartada` | Vigente o por vencer |
| `reservada` | Formalizado, documentación complementaria pendiente, financiamiento pendiente o en escrituración |
| `vendida` | Cerrado |

No se deben crear nuevos estados comerciales cada vez que aparece una tarea
administrativa o financiera.

## Modelo conceptual

La entidad central será `operaciones_inmobiliarias`. Debe conservar la relación
con la propiedad, compradores, agente, oportunidad y oferta, así como el
historial completo de la operación.

Entidades relacionadas previstas:

- Apartados y extensiones.
- Compradores y participantes.
- Ofertas.
- Contratos y documentos.
- Fuentes de financiamiento y solicitudes de crédito.
- Calendarios de pago.
- Pagos recibidos, devoluciones y conciliaciones.
- Cancelaciones.
- Comisiones.
- Escrituración y cierre legal.
- Auditoría de transiciones.

Una propiedad puede tener múltiples operaciones históricas, pero como máximo
una operación activa puede bloquear su disponibilidad comercial.

Esta regla debe protegerse con transacciones, índices y restricciones en
PostgreSQL; la interfaz no es suficiente para evitar apartados o reservas
simultáneas.

## Reglas de cierre y automatizaciones

### Vencimiento de apartados

Tal-IA debe notificar al agente y al cliente antes del vencimiento y liberar la
propiedad automáticamente cuando corresponda. El proceso debe ser idempotente
y verificar que el apartado siga siendo el vigente antes de modificar el
estado.

### Reservas próximas a vencer

Tal-IA debe alertar sobre:

- Reserva próxima a vencer.
- Crédito aún no aprobado.
- Documentos obligatorios pendientes.
- Pago comprometido pendiente.
- Diferencia entre el precio acordado y las fuentes confirmadas.
- Avalúo, notaría o escrituración pendientes.

### Ventas en riesgo

El dashboard debe poder identificar operaciones reservadas en riesgo sin
confundir ese riesgo con un nuevo estado comercial. El riesgo se calcula a
partir de fechas, documentos, financiamiento, pagos y condiciones contractuales.

## Reglas de integridad

- Una unidad no puede tener simultáneamente dos operaciones activas que la
  bloqueen.
- Apartar y reservar deben ejecutarse dentro de una transacción.
- Las transiciones deben guardar actor, fecha, estado anterior, estado nuevo y
  motivo cuando aplique.
- Un borrador no puede cambiar la disponibilidad de la unidad.
- Una oportunidad ganada o una oferta aceptada no cambia por sí sola el estado
  de la propiedad.
- La cancelación debe conservar el historial, los pagos y los documentos.
- Los contratos generados deben conservar su versión y no deben modificarse
  cuando cambie la plantilla del tenant.
- La liberación automática no debe borrar la operación histórica.
- Los requisitos documentales pueden configurarse por inmobiliaria y tipo de
  inmueble, manteniendo columnas y relaciones explícitas para los datos
  importantes.

## Fuera de alcance de esta definición

- Crear todavía las tablas o migraciones.
- Implementar el expediente financiero.
- Definir el contenido legal de los contratos; cada tenant debe proporcionar y
  revisar sus propias plantillas.
- Recibir o custodiar dinero en Tal-IA.
- Crear un estado comercial adicional para escrituración.
- Hacer obligatorias las oportunidades u ofertas para iniciar un apartado o
  una reserva.

## Decisión funcional

La definición vigente para Tal-IA Inmobiliarias es:

1. **Apartado:** rapidez, datos mínimos, bloqueo temporal y vencimiento.
2. **Reservado:** formalización contractual, pago confirmado y expediente
   principal.
3. **Vendido:** validación y cierre comercial/documental final.

La disponibilidad de la propiedad refleja la transición controlada de la
operación, mientras que la operación inmobiliaria conserva la fuente completa
de verdad y el historial.
