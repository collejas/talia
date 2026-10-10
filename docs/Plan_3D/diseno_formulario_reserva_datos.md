# Diseño del formulario de reserva inmobiliaria

Fecha: 2026-10-10 (UTC)  
Estado: Definición funcional

## Objetivo

Definir los datos que debe mostrar y solicitar el formulario de **Reservar
propiedad**, evitando que el agente vuelva a capturar información que ya existe
en el CRM.

El formulario debe distinguir entre:

1. Datos precargados desde el contacto y la oportunidad.
2. Datos obtenidos automáticamente de la propiedad y la operación.
3. Datos nuevos que pertenecen específicamente a la reserva.

La reserva debe ser sencilla para el agente, pero suficientemente completa para
generar el contrato, registrar el pago y confirmar la operación.

## Regla principal de experiencia de usuario

El formulario debe ser práctico y sencillo para el vendedor. El vendedor no
debe tener que entender la estructura interna de la operación, el modelo de
datos, las tablas de financiamiento ni los estados administrativos.

La interfaz debe:

- Mostrar primero los datos que ya existen.
- Pedir únicamente lo necesario para continuar.
- Ocultar los campos que no correspondan a la forma de compra seleccionada.
- Evitar repetir datos del contacto, la oportunidad o la propiedad.
- Usar lenguaje comercial: comprador, precio, pago, contrato y reserva.
- Mostrar claramente qué falta y por qué se solicita.
- Permitir guardar el avance sin completar todo en una sola sesión.
- Mantener una sola acción principal por momento.

La información avanzada de financiamiento, documentos, seguimiento y auditoría
debe existir internamente, pero no debe saturar el formulario inicial.

Como referencia de usabilidad:

- **Apartado:** debe completarse en aproximadamente 30 a 60 segundos.
- **Reserva:** debe avanzar por secciones cortas y progresivas.
- **Contrato:** debe utilizar los datos ya capturados, sin volver a escribirlos.
- **Confirmación:** debe explicar los pendientes en lenguaje directo.

El vendedor debe poder responder en todo momento:

1. ¿Qué estoy haciendo?
2. ¿Qué dato necesito proporcionar?
3. ¿Qué información ya está cargada?
4. ¿Qué me falta para confirmar la reserva?

## Fuente de datos

### Contacto o comprador

La tabla `personas` y el recurso completo de contacto ya conservan información
que puede utilizarse en el formulario y en el contrato:

- Nombre completo.
- Nombres.
- Apellido paterno.
- Apellido materno.
- Tipo de persona: física o moral.
- Razón social, cuando corresponda.
- RFC.
- Régimen fiscal o de capital, cuando aplique.
- Correo principal y secundarios.
- Teléfono principal y teléfonos adicionales.
- Domicilio.
- Calle, número exterior e interior.
- Edificio y piso.
- Colonia o asentamiento.
- Código postal.
- Estado, municipio y localidad.
- País.
- Empresa, puesto, área y rol de decisión.
- Cuenta relacionada.
- Relación de representante legal, cuando exista.

El buscador puede mostrar inicialmente nombre, teléfono y correo. Después de
seleccionar el contacto, el formulario debe cargar el registro completo y
mostrar los datos contractuales disponibles.

Los datos precargados deben ser editables para corregir información faltante o
desactualizada. El formulario debe indicar qué dato falta, sin obligar al
agente a volver a capturar todo el contacto.

### Oportunidad

La oportunidad aporta el contexto comercial de la operación:

- Oportunidad vinculada.
- Título.
- Descripción.
- Contacto principal.
- Cuenta relacionada.
- Monto estimado.
- Moneda.
- Probabilidad.
- Fecha probable de cierre.
- Etapa comercial.
- Estado.
- Usuario propietario.
- Usuario asignado.
- Canal de origen.
- Fechas de creación y actualización.

En la reserva deben mostrarse precargados el contacto principal, la oportunidad,
la cuenta relacionada, el agente responsable, la moneda y el monto estimado
como referencia. El monto estimado no sustituye al precio acordado.

### Propiedad y operación

Estos datos deben obtenerse automáticamente y no deben solicitarse nuevamente
al agente:

- Propiedad y unidad.
- Desarrollo.
- Dirección de la propiedad.
- Precio publicado.
- Características de la unidad.
- Estado actual.
- Agente responsable.
- Fecha de inicio de la operación.
- Identificador de la operación.
- Moneda configurada.
- Propietario o vendedor, si está registrado.

## Datos de reserva ya persistidos

`operaciones_inmobiliarias` ya contiene los siguientes datos relevantes:

| Dato | Situación |
| --- | --- |
| Unidad | Persistido |
| Oportunidad | Persistido |
| Comprador principal | Persistido |
| Agente responsable | Persistido |
| Estado de la operación | Persistido |
| Duración del apartado | Persistido |
| Inicio del apartado | Persistido |
| Vencimiento del apartado | Persistido |
| Motivo del apartado | Persistido |
| Forma de adquisición | Persistido |
| Precio ofrecido | Persistido |
| Precio acordado | Persistido |
| Precio final | Persistido |
| Fecha límite de reserva | Persistido |
| Importe de reserva | Persistido |
| Condiciones de reserva | Persistido |
| Moneda | Persistido |
| Cancelación y motivo | Persistido |

Estos datos deben formar la parte comercial del cuestionario:

- Comprador principal.
- Oportunidad.
- Agente responsable.
- Precio acordado.
- Fecha límite de reserva.
- Forma de adquisición.
- Importe de reserva.
- Condiciones de reserva.

## Datos nuevos requeridos para formalizar la reserva

### Compradores y firmantes

Una operación puede tener más de un comprador o firmante. El formulario debe
permitir seleccionar contactos existentes o capturar los datos faltantes para:

- Comprador principal.
- Compradores adicionales.
- Cónyuge o copropietario.
- Representante legal.
- Propietario o vendedor.
- Representante de la inmobiliaria.

Para cada firmante se requiere:

- Persona relacionada, si existe en CRM.
- Nombre completo.
- Tipo de persona.
- RFC.
- CURP, si aplica.
- Domicilio contractual.
- Correo.
- Papel dentro del contrato.
- Orden de firma.

### Financiamiento

Estos campos aparecen solamente cuando la forma de adquisición sea `crédito`,
`mixto` u otra modalidad que los requiera:

- Tipo de crédito: bancario, Infonavit, Fovissste u otro.
- Institución financiera.
- Monto solicitado.
- Monto autorizado.
- Estado del crédito.
- Fecha estimada de autorización.
- Fecha límite para obtener el crédito.
- Ejecutivo o asesor financiero, opcional.
- Carta de autorización.
- Observaciones del financiamiento.

Estados permitidos del crédito:

- Sin solicitar.
- En trámite.
- Preaprobado.
- Aprobado.
- Dispersado.
- Rechazado.
- Cancelado.
- Vencido.

No deben almacenarse contraseñas ni accesos a portales financieros.

### Pago de la reserva

El importe de reserva no es suficiente para acreditar que el pago fue recibido.
Se deben registrar por separado:

- Importe de reserva.
- Fecha de pago.
- Forma de pago.
- Estado del pago.
- Persona o entidad que recibió el dinero.
- Referencia de pago.
- Comprobante de pago.
- Si el importe se aplica al precio final.
- Fecha prevista de aplicación.

Estados iniciales del pago:

- Pendiente.
- Reportado.
- Confirmado.
- Rechazado.

Un crédito aprobado no equivale a dinero recibido. El financiamiento y los
pagos deben permanecer separados.

### Condiciones de la reserva

Además del texto libre de condiciones, la reserva debe poder registrar:

- Fecha límite.
- Condiciones de cancelación.
- Condiciones de devolución.
- Si el importe es reembolsable.
- Importe retenido por cancelación, si aplica.
- Qué sucede si se rechaza el crédito.
- Qué sucede si incumple el comprador.
- Qué sucede si incumple el vendedor.
- Cómo se aplica el importe al precio.
- Condiciones especiales.

El campo de texto libre se conserva como complemento, pero no debe ser el único
lugar donde se almacenen reglas relevantes para la operación.

### Contrato

El formulario debe permitir:

- Seleccionar la plantilla del tenant.
- Conservar la versión de la plantilla.
- Revisar los datos de compradores y firmantes.
- Generar el texto del contrato.
- Mostrar una vista previa.
- Imprimir o descargar el contrato.
- Adjuntar el contrato firmado.
- Registrar la fecha de generación.
- Registrar quién generó el contrato.
- Registrar la fecha de firma.
- Mantener el texto generado como copia inmutable.

Estados del contrato:

- Borrador.
- Generado.
- En firma.
- Firmado.
- Rechazado.
- Sustituido.

## Orden definitivo del formulario

El panel de reserva debe mostrar las secciones en este orden:

### 1. Comprador y oportunidad

Datos precargados:

- Comprador principal.
- Oportunidad.
- Cuenta relacionada.
- Agente responsable.

Acciones disponibles:

- Cambiar contacto.
- Agregar comprador adicional.
- Agregar firmante.

### 2. Datos contractuales

Mostrar los datos del contacto seleccionado:

- Nombre y apellidos.
- Tipo de persona.
- RFC.
- Domicilio.
- Correo.
- Teléfono.

El agente únicamente completa o corrige los datos faltantes.

### 3. Condiciones comerciales

- Precio acordado.
- Fecha límite de reserva.
- Forma de adquisición.
- Importe de reserva.
- Moneda precargada.

### 4. Financiamiento

Se muestra progresivamente según la forma de adquisición seleccionada.

### 5. Pago

- Forma de pago.
- Fecha.
- Estado de confirmación.
- Referencia.
- Comprobante.
- Aplicación al precio.

### 6. Condiciones de reserva

- Cancelación.
- Devolución.
- Aplicación del importe.
- Condiciones especiales.

### 7. Contrato

- Plantilla.
- Firmantes.
- Vista previa.
- Impresión o descarga.
- Contrato firmado.

### 8. Acciones

- `Guardar avance`.
- `Confirmar reserva`.

## Comportamiento de las acciones

### Guardar avance

Debe guardar la información capturada, incluyendo datos contractuales, pagos
reportados y contrato generado o adjunto.

No debe:

- Cambiar la propiedad a `reservada`.
- Extender automáticamente el apartado.
- Considerar confirmado un pago únicamente porque se capturó un importe.

### Confirmar reserva

Debe validar los requisitos configurados para la inmobiliaria antes de cambiar
la propiedad a `reservada`.

Como base, debe comprobar:

- Comprador principal identificado.
- Precio acordado.
- Fecha límite.
- Forma de adquisición definida.
- Importe de reserva capturado.
- Pago confirmado y comprobante, cuando sean obligatorios.
- Condiciones de reserva registradas.
- Contrato generado y firmado.
- Firmantes requeridos identificados.

La aprobación definitiva del crédito, el avalúo, la notaría y la escrituración
pueden quedar como seguimiento posterior si las condiciones contractuales lo
permiten.

## Diseño resumido

```text
Contacto + oportunidad
          ↓
Datos precargados y revisados
          ↓
Condiciones comerciales de la reserva
          ↓
Financiamiento y pago, solo cuando corresponda
          ↓
Contrato con compradores y firmantes
          ↓
Guardar avance o confirmar reserva
```

La interfaz debe ser progresiva: mostrar primero los datos que ya existen,
solicitar después los datos propios de la reserva y mostrar los campos
financieros únicamente cuando sean necesarios.

## Pendientes de implementación

- Cargar el contacto completo al abrir el panel de reserva.
- Mostrar y editar datos contractuales faltantes.
- Permitir compradores y firmantes adicionales.
- Agregar datos de pago y comprobante.
- Agregar campos progresivos de financiamiento.
- Separar condiciones estructuradas del texto libre.
- Implementar validaciones de `Confirmar reserva`.
- Mantener el texto generado y la versión de plantilla junto con la operación.

## Referencias

- [Plan de operaciones inmobiliarias: Apartado, Reservado y Vendido](./plan_operaciones_inmobiliarias_apartado_reservado_vendido.md)
- [Ventas inmobiliarias ligadas a leads y clientes](./ventas_asociadas_leads_clientes.md)
