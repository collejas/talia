# Refactor de correos y teléfonos por canal

Fecha: 2026-05-22 (UTC)
Estado: En progreso

## Resumen

Se inició el refactor para separar el manejo de correos y teléfonos por tipo de entidad y por canal.

En esta primera etapa se migró `webchat` para que lea y escriba con prioridad en los campos nuevos del modelo:

- `correo_principal`
- `correo_secundario`
- `telefono_principal_e164`
- `telefono_principal_tipo_linea`
- `telefono_principal_extension`
- `telefono_movil_1_e164`
- `telefono_movil_2_e164`
- `telefono_secundario_e164`

La compatibilidad con nombres heredados no se eliminó todavía. Se mantiene como respaldo para que los canales aún no migrados sigan funcionando mientras se avanza uno por uno.

## Por qué se hizo

El modelo anterior mezclaba la persistencia operativa de correos y teléfonos entre campos legacy y aliases técnicos. Eso generaba tres problemas:

1. El asistente de IA y los flujos de canal no tenían una fuente única de verdad.
2. `webchat` seguía dependiendo de aliases antiguos para crear contacto, capturar oportunidad y marcar contacto listo.
3. Si se retiraban de golpe los aliases, se corría el riesgo de romper los flujos que aún los consumen: webchat, WhatsApp, correo y voz.

Por eso el refactor se hizo por etapas:

1. Primero `webchat`.
2. Luego `whatsapp`.
3. Después `correo`.
4. Al final `voz`.

## Qué quedó cambiado en `webchat`

### Asistente

El asistente de `webchat` ahora guarda:

- el correo en `correo_principal`
- el teléfono en `telefono_principal_e164`

También se ajustó la lógica interna para resolver el correo y el teléfono usando primero los campos nuevos.

### Seguimiento de contacto

El seguimiento de `webchat` ahora considera contacto válido usando los campos nuevos como prioridad.

Esto afecta:

- detección de contacto listo
- marcación de entrega de información
- activación de oportunidad
- validaciones previas a agendar o escalar a ventas

### Notificaciones

Las notificaciones de `webchat` ya leen:

- `correo_principal`
- `correo_secundario`
- `telefono_principal_e164`
- `telefono_movil_1_e164`

antes de caer a los aliases heredados.

### Capa compartida

Se agregó soporte en `storage` para resolver correo y teléfono desde los nuevos campos antes que los antiguos.

Eso permite que el canal nuevo avance sin que el resto del sistema se rompa todavía.

## Qué no se tocó todavía

- `whatsapp` sigue usando aliases antiguos en parte de su flujo.
- `correo` todavía crea y deduplica personas con campos heredados en algunos puntos.
- `voz` no se migró en esta etapa.
- Los aliases legacy siguen activos como compatibilidad temporal.

## Criterio técnico

No se retiraron los nombres viejos todavía porque varias rutas siguen dependiendo de ellos:

- ingreso de correo entrante
- auto-promoción de prospectos
- tools del asistente
- seguimiento de webchat
- notificaciones de ventas

La regla aplicada fue:

- migrar primero el consumidor
- mantener fallback legacy
- retirar aliases solo cuando el canal ya no los use

## Archivos principales tocados

- `backend/app/assistants/tools/lead.py`
- `backend/app/services/webchat_followups.py`
- `backend/app/channels/webchat/notifications.py`
- `backend/app/channels/webchat/service.py`
- `backend/app/services/storage.py`

## Siguiente paso

Continuar con la migración de `whatsapp`, manteniendo la misma estrategia:

1. leer y escribir con prioridad en los campos nuevos
2. conservar fallback legacy
3. documentar el avance antes de pasar al siguiente canal

