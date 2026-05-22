# Refactor de WhatsApp a campos nuevos de contacto

Fecha: 2026-05-22 (UTC)
Estado: En progreso

## Qué se cambió

Se migró el canal `whatsapp` para que priorice los campos nuevos del modelo de contacto en lugar de depender solo de aliases heredados.

En particular, el canal ahora usa como referencia principal:

- `correo_principal`
- `correo_secundario`
- `telefono_principal_e164`
- `telefono_principal_tipo_linea`
- `telefono_principal_extension`
- `telefono_movil_1_e164`
- `telefono_movil_2_e164`
- `telefono_secundario_e164`

La compatibilidad con `correo`, `email`, `telefono_e164` y `telefono` se mantiene por ahora como respaldo.

## Alcance técnico

### `whatsapp/tools.py`

Se ajustaron las herramientas del asistente para que:

- `set_email` persista en `correo_principal`
- `set_phone_number` persista en `telefono_principal_e164`
- la lectura de contacto para seguimiento priorice correo y teléfono nuevos
- la fusión de datos entre persona activa y oportunidad use `correo_principal`

### `whatsapp/service.py`

Se actualizó la resolución de correo para:

- confirmaciones
- cancelaciones
- reutilización de contexto de contacto

### `whatsapp_followups.py`

Se modificó la validación de contacto mínimo para que el seguimiento use los campos nuevos de teléfono.

## Por qué se hizo

`whatsapp` seguía siendo uno de los consumidores directos de los aliases heredados.

Si se retiraran sin migrar este canal, se romperían casos como:

- captura de email/teléfono desde el asistente
- validación de si un contacto ya está listo para oportunidad
- reenganche automático de conversaciones inactivas
- notificaciones hacia ventas

Por eso este paso mantiene fallback legacy, pero ya mueve el canal a los campos nuevos como fuente principal.

## Qué no se hizo todavía

- No se retiraron los aliases antiguos.
- No se migró `correo`.
- No se migró `voz`.

## Resultado esperado

Con este cambio, `whatsapp` queda alineado al nuevo modelo sin romper la operación actual, y el siguiente paso puede ser migrar `correo` con el mismo patrón.

