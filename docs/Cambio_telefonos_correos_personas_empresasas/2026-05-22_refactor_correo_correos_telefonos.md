# Refactor del canal correo a campos nuevos de contacto

Fecha: 2026-05-22 (UTC)
Estado: En progreso

## Qué se cambió

Se migró el canal `correo` para que la creación y resolución de personas priorice los campos nuevos del modelo:

- `correo_principal`
- `correo_secundario`
- `correo_personal_3`
- `telefono_principal_e164`
- `telefono_principal_tipo_linea`
- `telefono_principal_extension`

El canal sigue aceptando compatibilidad con campos heredados, pero ya no crea registros nuevos usando `correo` como campo principal.

## Alcance técnico

### `brevo.py`

El flujo de correo entrante que crea o busca personas ahora:

- busca primero por `correo_principal`, luego por `correo_secundario`
- crea personas nuevas con `correo_principal`
- conserva la trazabilidad de origen `correo`

### `prospeccion_email_inbound_reader.py`

El lector IMAP de correo entrante ahora:

- resuelve personas por los campos nuevos
- crea personas con `correo_principal`
- mantiene la captura de contexto de prospección

### `crm.py`

La búsqueda por email para personas quedó ordenada para priorizar:

1. `correo_principal`
2. `correo_secundario`
3. `correo_institucional`
4. `correo_personal_3`

Esto reduce la dependencia del alias antiguo y permite que el nuevo modelo sea la fuente de verdad para el canal correo.

## Por qué se hizo

Antes, el canal `correo` seguía insertando y resolviendo contactos usando `correo` como nombre operativo principal.

Eso era un problema porque:

- no respetaba la nueva separación del modelo
- mantenía el canal atado a aliases heredados
- dificultaba retirar compatibilidad vieja de forma segura

Con este paso, `correo` ya trabaja con los campos nuevos en su ruta activa, pero sigue tolerando campos heredados para no romper datos existentes.

## Qué no se hizo todavía

- No se retiraron los aliases legacy.
- No se migró `voz`.
- No se tocaron los demás canales fuera del ámbito de correo y la resolución de email.

## Resultado esperado

El canal de correo ya queda alineado con el nuevo modelo de contactos y puede seguir avanzando sin depender del nombre de campo viejo para crear personas nuevas.

