# Informe tecnico · Metricas WhatsApp de prospeccion

Fecha: 2026-07-02
Ruta: `docs/Plan_mapa_conversion/informe_metricas_whatsapp_prospeccion.md`

## 1) Proposito

Documentar el hallazgo real sobre las metricas de WhatsApp de prospeccion y dejar claro:

- que universo si corresponde a campañas WhatsApp de prospeccion,
- cual es la fuente correcta de cada metrica,
- por que las vistas actuales quedan incompletas,
- y como se debe corregir para alimentar:
  - `prospeccion/metricas`
  - `mapa-de-conversion`
  - `prospeccion/campanas`

## 2) Resumen ejecutivo

La campaña `Campañas Whatapp` del tenant `00000000-0000-0000-0000-000000000001` si tiene actividad real de prospeccion, pero esa actividad no queda bien representada si se consulta solo `prospeccion_contacto_envio`.

Lo correcto es separar cuatro capas:

1. Campana / lote
2. Envio / mensaje
3. Conversacion
4. Oportunidad

El problema actual es que las vistas y el agregador de WhatsApp mezclan o filtran de forma incompleta esas capas.

## 3) Hallazgos reales en BD

### 3.1 Universo de campaña

Para la campaña `Campañas Whatapp`:

- `223` lotes en `prospeccion_contacto_batch`
- `2,417` prospectos acumulados en esos lotes

### 3.2 Conversaciones de prospeccion WhatsApp

En el tenant analizado:

- `62` conversaciones WhatsApp de prospeccion
- `11` conversaciones con al menos una respuesta entrante
- `0` conversaciones cerradas

### 3.3 Mensajes del flujo WhatsApp

En las conversaciones de prospeccion WhatsApp de esa campaña:

- `205` mensajes salientes
- `20` mensajes entrantes
- `225` mensajes totales en el hilo

### 3.4 Estado final de entregas

Tomando el ultimo evento por mensaje en `eventos_entrega`:

- `37` quedaron con ultimo estado `enviado`
- `19` quedaron con ultimo estado `entregado`
- `91` quedaron con ultimo estado `leido`
- `36` quedaron con ultimo estado `fallido`
- `22` no tienen evento de entrega trazable

Nota:

- Los eventos no son mutualmente excluyentes en su conteo bruto.
- Para el funnel operativo hay que usar el ultimo evento por mensaje.

### 3.5 Oportunidades

Ligadas a esas conversaciones:

- `61` oportunidades
- `60` abiertas
- `1` perdida
- `0` ganadas

## 4) Que estaba pasando

### 4.1 No se debe usar `prospeccion_contacto_envio` como verdad unica de WhatsApp

`prospeccion_contacto_envio` sigue siendo util para parte del historial operativo, pero no captura por si sola el universo real de WhatsApp de prospeccion.

Para WhatsApp de prospeccion el rastro real queda distribuido entre:

- `prospeccion_contacto_batch`
- `mensajes`
- `conversaciones`
- `eventos_entrega`
- `oportunidades`

### 4.2 Hay una mezcla semantica entre correo y WhatsApp

Se encontro que:

- `source = 'prospeccion'` no significa automaticamente WhatsApp.
- Hay registros de correo con la misma fuente.
- El canal debe validarse aparte.

Por eso el filtro correcto para campañas WhatsApp debe considerar:

- `datos.channel = 'whatsapp'`
- `inbox_context.canal = 'whatsapp'`
- `campana_id`
- `batch_id`
- y el cruce con conversaciones / oportunidades.

### 4.3 El contrato actual del RPC es estrecho

La funcion `public.prospeccion_campana_whatsapp_metricas_rango` existe, pero su logica actual sigue atada a un subconjunto de campos y no debe considerarse suficiente como lectura final para todas las vistas.

Ademas, esa funcion depende del contexto tenant/auth del panel para resolver organizacion.

## 5) Fuente correcta por metrica

### 5.1 Enviados de campaña WhatsApp

Fuente principal:

- `mensajes`

Claves:

- `conversacion_id`
- `direccion = 'saliente'`
- `datos->>'campana_id'`
- `datos->>'batch_id'`
- `datos->>'twilio_content_sid'`
- `datos->>'source'`

### 5.2 Entregados, leidos y fallidos

Fuente principal:

- `eventos_entrega`

Clave de cruce:

- `eventos_entrega.mensaje_id = mensajes.id`

No usar `twilio_message_sid` como llave principal de cruce para esta capa.

### 5.3 Conversaciones con respuesta

Fuente principal:

- `conversaciones`
- `mensajes` entrantes dentro del hilo

Campo util:

- `conversaciones.inbox_context`

### 5.4 Oportunidades

Fuente principal:

- `oportunidades`

Cruce:

- `oportunidades.metadata->>'conversation_id'`
- `oportunidades.metadata->>'conversacion_id'`

### 5.5 Plantillas

Fuente principal:

- `mensajes.datos->>'twilio_content_sid'`

Fallbacks:

- `template_id`
- `template_slug`
- `template_label`
- `conversaciones.inbox_context`

## 6) Que deben mostrar las vistas

### 6.1 `prospeccion/metricas`

Debe separarse en bloques claros:

- Correo
- WhatsApp de prospeccion
- Frases WhatsApp
- Conversion / oportunidades

Para WhatsApp de prospeccion el bloque debe mostrar:

- lotes
- prospectos
- enviados
- entregados
- leidos
- fallidos
- sin traza
- conversaciones
- respuestas
- oportunidades

### 6.2 `mapa-de-conversion`

No debe leer WhatsApp como envio de correo ni como trafico web.

Debe conservar estas capas separadas:

- trafico web
- conversaciones WhatsApp
- conversion / oportunidades
- atribucion por canal

### 6.3 `prospeccion/campanas`

Debe mostrar para campañas WhatsApp:

- plantillas
- lotes
- prospectos
- envios salientes
- entregados
- leidos
- fallidos
- conversaciones originadas
- oportunidades originadas

No debe quedarse solo en el total de plantillas o solo en el total de lotes.

## 7) Problema de fondo

El problema no es solo de UI.

Es de contrato de datos:

- una parte del flujo vive en lote/campana,
- otra parte vive en mensaje,
- otra en conversacion,
- otra en eventos de entrega,
- y otra en oportunidades.

Si la vista consume solo una de esas capas, la lectura queda incompleta.

## 8) Propuesta tecnica de correccion

### 8.1 Base de datos

Definir o consolidar una fuente agregada que responda a estas preguntas:

- cuantos envios salieron
- cuantos llegaron
- cuantos se leyeron
- cuantos fallaron
- cuantas conversaciones nacieron
- cuantas oportunidades nacieron
- de que plantilla salieron

Recomendacion:

- mantener `mensajes`, `eventos_entrega`, `conversaciones` y `oportunidades` como fuentes operativas
- construir un agregado explicito para WhatsApp de prospeccion

### 8.2 Backend

Ajustar el contrato para que entregue bloques separados:

- `campanas` para correo
- `campanas_whatsapp` para WhatsApp de prospeccion
- `frases_whatsapp` para atribucion por frase/regla
- `conversion` o `opportunities` para lectura comercial

La respuesta de WhatsApp debe usar una logica que no dependa de `prospeccion_contacto_envio` como unica fuente.

### 8.3 Frontend

Actualizar las tres vistas:

- `prospeccion/metricas`
- `mapa-de-conversion`
- `prospeccion/campanas`

para leer el contrato separado y no inferir WhatsApp desde el bloque de correo.

## 9) Orden de ejecucion recomendado

1. BD
2. Backend
3. Frontend
4. Validacion con datos reales

## 10) Criterio de exito

Consideramos resuelto cuando:

- WhatsApp de prospeccion deja de mezclarse con correo
- las vistas muestran el mismo universo
- las plantillas se pueden atribuir correctamente
- las oportunidades se contabilizan por conversacion real
- y `mapa-de-conversion` sigue siendo mapa, no dashboard de envios

