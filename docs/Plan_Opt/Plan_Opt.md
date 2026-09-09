# Plan: bajas de WhatsApp en prospección

## Objetivo

Cuando un prospecto responda `BAJA`, `STOP`, `UNSUBSCRIBE` o una frase equivalente a una negativa definitiva durante una conversación de prospección, el sistema debe registrar una exclusión persistente por organización y canal. Esa exclusión debe impedir futuros envíos de prospección y permitir localizar los contactos que solicitaron no recibir más mensajes.

## Hallazgo inicial

La aplicación ya detectaba respuestas de baja y detenía la conversación, además de marcar la oportunidad como perdida. Sin embargo, no llamaba al registro de exclusiones. La tabla `public.prospeccion_contacto_suppressions` existía, pero no tenía registros al momento de la revisión.

También existía una defensa en el worker de envíos: si encontraba una exclusión activa, omitía el envío. La protección era incompleta porque dependía de que la exclusión hubiera sido creada manualmente o por otra integración.

Las plantillas activas de WhatsApp se revisan en `public.prospeccion_contacto_templates`. El texto de una plantilla puede solicitar la palabra `BAJA`, pero la plantilla por sí sola no puede bloquear envíos: la decisión debe quedar respaldada por la base de datos y el backend.

## Diseño aplicado

### Registro automático

La ruta de negación de prospección registra una fila en `prospeccion_contacto_suppressions` con:

- `organizacion_id`: organización del contacto.
- `canal`: `whatsapp`.
- `prospecto_id`: prospecto resuelto por contacto o teléfono, cuando existe.
- `phone_e164`: teléfono entrante normalizado, cuando cumple formato E.164.
- `motivo`: `baja`.
- `origen`: `whatsapp_inbound`.
- `activo`: `true`.
- `metadata`: únicamente el identificador de conversación para trazabilidad técnica.

Antes de insertar se consulta una exclusión activa para evitar duplicar el registro en reintentos o respuestas repetidas.

### Bloqueo de envíos

Se conservan las dos barreras:

1. Al preparar una campaña, se excluyen los prospectos con opt-out activo para el canal.
2. El worker vuelve a comprobar la exclusión inmediatamente antes de enviar.

La segunda barrera es necesaria para cubrir bajas recibidas después de crear o programar una campaña.

### Listado de prospectos

La vista `prospeccion/prospectos` incorpora el filtro `Estado WhatsApp`:

- `Disponibles para WhatsApp`: opción predeterminada; excluye opt-outs activos.
- `Solicitaron no recibir`: muestra los prospectos con exclusión activa de WhatsApp.
- `Todos los estados`: muestra ambos grupos.

El filtro se aplica en backend sobre el conjunto total de prospectos, antes de la paginación. No depende de los datos ya cargados en el navegador.

## Seguridad y alcance

- Todas las consultas están limitadas por `organizacion_id` y las políticas RLS existentes.
- La creación automática usa el repositorio de worker; no se expone el endpoint administrativo al prospecto.
- No se escriben tokens ni mensajes completos en logs.
- La baja de WhatsApp no bloquea automáticamente correo o llamadas; el alcance es por canal. La exclusión `all` continúa disponible para casos manuales.
- La baja es un opt-out, no un opt-in. El producto debe presentarlo como “Solicitó no recibir mensajes”.

## Archivos principales

- `backend/app/channels/whatsapp/service.py`: detección y registro automático.
- `backend/app/repositories/crm.py`: consulta de exclusiones para el listado.
- `backend/app/api/routes/crm.py`: contrato del filtro backend.
- `frontend/panel/src/lib/prospeccion/prospectos-client.ts`: parámetro del cliente.
- `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx`: filtro visible y vistas guardadas.
- `supabase/migrations/20260228_000000_prospeccion_contacto_suppressions.sql`: tabla, relaciones, índices y RLS existentes.

## Validación pendiente de producción

Para cerrar la validación funcional se debe probar con un prospecto controlado:

1. Enviar una campaña de prospección de WhatsApp.
2. Responder `BAJA`.
3. Confirmar una fila activa en la tabla sin mostrar datos personales en evidencias públicas.
4. Confirmar que el prospecto aparece en `Solicitaron no recibir` y no en `Disponibles para WhatsApp`.
5. Intentar una nueva campaña y comprobar que el resultado indique `opt_out_whatsapp`.
6. Verificar que una campaña previamente programada también sea omitida por el worker.

