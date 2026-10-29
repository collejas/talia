# Validación del apartado inmobiliario

## Flujo operativo

El flujo comercial visible conserva sus tres etapas:

```text
Disponible → Reservado → Apartado → Vendido
```

`Reservado` es el bloqueo inicial y sencillo. El vendedor selecciona al comprador, define el plazo y captura la información mínima. No requiere contrato ni expediente documental.

`Apartado` es el expediente formal. El vendedor completa la información del comprador y adjunta la documentación requerida. El apartado no queda firme inmediatamente: pasa a revisión.

```text
Apartado · Pendiente de validación
        ↓
Apartado · Firme
```

“Firme” es un estado de validación del expediente, no un nuevo color ni un nuevo estado de disponibilidad del mapa.

## Relación con las oportunidades

Una operación inmobiliaria debe quedar ligada a una oportunidad comercial. Por
eso, al seleccionar un comprador desde el modal de Reservar o Apartar, el
sistema debe mostrar únicamente contactos que tengan una oportunidad creada.

Cuando exista una oportunidad inmobiliaria relacionada con la unidad, debe
reutilizarse esa oportunidad. La operación debe conservar la relación:

```text
Contacto → Oportunidad → Unidad → Operación inmobiliaria
```

Si la oportunidad se mueve primero a **Ganada** desde el Embudo, el sistema
crea o reutiliza el apartado y envía al usuario a Propiedades para completar el
expediente. Ganada no significa todavía documentación validada ni propiedad
vendida.

## Documentos del comprador

El vendedor adjunta:

- Acta de nacimiento.
- Acta de matrimonio, cuando aplique.
- INE.
- Constancia de situación fiscal.
- CURP.
- Comprobante de domicilio.

Los documentos obligatorios para enviar a revisión son acta de nacimiento, INE, constancia de situación fiscal, CURP y comprobante de domicilio. El acta de matrimonio se solicita según el estado civil y las reglas contractuales aplicables.

## Revisión por usuario autorizado

El usuario con el permiso `inmobiliaria.apartados.validate` puede:

1. Consultar el expediente.
2. Abrir cada documento.
3. Aprobarlo o solicitar corrección.
4. Generar e imprimir el contrato desde la plantilla del tenant.
5. Firmar el contrato fuera del sistema y adjuntar la copia firmada.
6. Marcar el apartado como firme.

La base de datos no permite marcarlo como firme si falta un documento obligatorio aprobado o un contrato firmado adjunto.

## Responsabilidades

### Vendedor

- Captura el comprador y las condiciones.
- Completa la información contractual.
- Adjunta los documentos.
- Envía el apartado a validación.
- Corrige documentos observados.

### Usuario elevado

- Revisa la información persistida.
- Revisa los documentos.
- Genera, imprime y firma el contrato.
- Adjunta la copia firmada.
- Valida el expediente como firme.

## Separación de módulos

El menú `Operación` corresponde a inventario, envíos y transformaciones de negocios no inmobiliarios. Se oculta cuando el tenant tiene habilitado el módulo de propiedades. La validación inmobiliaria ocurre desde la ficha de la propiedad y utiliza un permiso específico.

## Bandeja de validaciones inmobiliarias

Los usuarios con el permiso `inmobiliaria.apartados.validate` tienen un acceso visible en la vista de propiedades:

- `Validaciones inmobiliarias` muestra un contador de expedientes en `pendiente_revision`.
- Al abrirlo, se listan las unidades pendientes de revisión.
- El mapa se filtra para mostrar únicamente esas unidades.

## Reserva temporal y representación visual

Una acción `Reservar` solo crea una operación `reservada` cuando el usuario ya
capturó los datos obligatorios. La unidad queda bloqueada por 24, 48 o 72 horas.
No existe una operación inmobiliaria en estado `borrador`.

La reserva temporal no crea automáticamente un apartado. Si el cliente decide
continuar, el usuario ejecuta explícitamente `Convertir en apartado`; entonces
la operación pasa a `apartada`, la unidad cambia a apartado y se habilita el
expediente documental y la validación.

Si la reserva vence o se cancela, la operación y su propuesta se conservan como
historial cancelado y la unidad vuelve a `disponible`. La expiración se ejecuta
automáticamente cada 15 minutos.

Para que el mapa no la muestre como disponible, el GeoJSON combina el estado base
de la unidad con la operación inmobiliaria activa y expone estos datos visuales:

- `Apartado en validación`: color amarillo intermedio `#F8D568`.
- `Apartado firme`: color amarillo `#F1C40F`.
- `Reservado`: color naranja `#F97316`.

El estado base de la unidad se conserva para que las acciones disponibles sigan
siendo correctas; el mapa utiliza `display_status`, `display_status_label` y
`status_color` para mostrar el estado operativo real.

Al guardar el apartado detallado o enviarlo a validación, Tal-IA crea una
notificación para cada usuario con el permiso `inmobiliaria.apartados.validate`.
La notificación es deduplicada por operación y enlaza con la vista de propiedades.
- Al seleccionar una unidad se abre el detalle del expediente con la propiedad, el comprador, el precio, la forma de adquisición y los documentos.
- El usuario puede abrir, aprobar o solicitar corrección de cada documento y marcar el apartado como firme.

La bandeja es un acceso operativo para encontrar pendientes; la propiedad y su expediente siguen siendo la fuente de verdad.

