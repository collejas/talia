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

