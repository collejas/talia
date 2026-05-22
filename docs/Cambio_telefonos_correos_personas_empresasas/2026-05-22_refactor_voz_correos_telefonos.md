# Refactor del canal voz a campos nuevos de contacto

Fecha: 2026-05-22 (UTC)
Estado: En progreso

## Qué se cambió

El canal `voz` no crea ni edita personas como tal, pero sí depende de la información de contacto para:

- generar contexto de llamada
- construir notificaciones a ventas
- resolver el número de destino para llamadas salientes

En esta etapa se migraron esas lecturas para que prioricen los campos nuevos del modelo:

- `correo_principal`
- `correo_secundario`
- `telefono_principal_e164`
- `telefono_principal_tipo_linea`
- `telefono_principal_extension`
- `telefono_movil_1_e164`
- `telefono_movil_2_e164`
- `telefono_secundario_e164`

## Alcance técnico

### `sales_notifications.py`

Las notificaciones comerciales ya construyen el mensaje usando primero:

- correo principal
- correo secundario
- teléfono principal nuevo

Esto afecta los avisos y resúmenes que acompañan la operación de llamadas.

### `context_formatter.py`

El formato de contexto ahora muestra:

- correo principal o secundario
- teléfono principal o móvil 1

antes que los aliases heredados.

### `prospeccion_contact_sender.py`

El worker de envíos para llamadas y mensajes ahora resuelve el destinatario usando:

1. `telefono_principal_e164`
2. `telefono_movil_1_e164`
3. `telefono_e164`
4. `phone_e164`
5. `phone`
6. `telefono`

Además, la normalización de destinatario para llamadas prioriza esos campos nuevos.

## Qué no se tocó

- El callback de estado de `voice` no cambió, porque no persiste correo ni teléfono.
- No se retiraron los aliases legacy.
- No se cambió la lógica de Twilio status callbacks.

## Por qué se hizo

Aunque `voz` no escribe los datos de contacto, sí los usa para ejecutar y explicar la operación.

Si no se ajustaba este paso:

- los mensajes de seguimiento seguirían mostrando campos viejos
- las llamadas podrían seguir resolviendo destinatarios solo por alias heredados
- la transición al nuevo modelo quedaría incompleta

## Resultado esperado

Con este paso, `voz` queda alineado al nuevo modelo en lectura operativa de contacto, y ya solo faltaría seguir retirando compatibilidad legacy cuando todo el resto del sistema esté migrado.

