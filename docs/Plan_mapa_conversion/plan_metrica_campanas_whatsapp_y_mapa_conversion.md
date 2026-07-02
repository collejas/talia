# Plan de alineacion · Metricas de campañas WhatsApp y mapa de conversion

Fecha: 2026-07-01
Ruta: `docs/Plan_mapa_conversion/plan_metrica_campanas_whatsapp_y_mapa_conversion.md`

## 1) Objetivo

Documentar el desalineamiento detectado entre:

- `prospeccion/metricas`
- `mapa-de-conversion`
- el flujo real de ejecucion de campañas de WhatsApp
- el refactor de `persona/contacto`

La meta es separar con claridad:

- metricas de correo,
- metricas de WhatsApp,
- metricas de conversion y oportunidades,

sin romper lo que ya existe en producto, reportes, exportaciones o compatibilidad temporal.

Esta propuesta se implementa desde el backlog unico:

- `backlog_maestro_mapa_conversion.md`

Y se registra en el changelog unico:

- `changelog_maestro_mapa_conversion.md`

El detalle forense del caso real de WhatsApp de prospeccion se documenta en:

- `informe_metricas_whatsapp_prospeccion.md`

## 2) Diagnostico

### 2.1 Lo que se encontro en datos

Se confirmo que existen campañas de WhatsApp reales en la base de datos, pero no estan entrando al mismo ledger que usa el tablero actual de `prospeccion/metricas`.

Hallazgos relevantes:

- `public.prospeccion_contacto_batch` si contiene batches de WhatsApp.
- `public.mensajes` si contiene mensajes de prospeccion con `batch_id` y `campana_id` asociados a WhatsApp.
- `public.conversaciones` si registra conversaciones respondidas y no respondidas derivadas de esas campañas.
- `public.oportunidades` si registra parte de la conversion posterior.
- `public.prospeccion_contacto_envio` sigue concentrando principalmente correo.

Conclusiones operativas:

- hay campañas de WhatsApp ejecutadas,
- hay respuestas,
- hay conversiones parciales,
- pero la vista de metricas no las mide como bloque independiente.

### 2.2 Lo que esta roto o desalineado

El problema no es solo visual.
La desalineacion viene de que la vista actual de metricas mezcla dos mundos:

- correo/Brevo,
- WhatsApp,

pero la fuente de verdad de cada uno no es la misma.

Puntos clave:

- `prospeccion/metricas` arma el bloque de campañas desde una RPC orientada a envios y tracking de correo.
- `mapa-de-conversion` esta diseñado para lectura multicanal y de atribucion, no para reportar envios de campañas como tal.
- el refactor de `persona/contacto` introdujo compatibilidad temporal, pero no explica por si solo la ausencia de metricas de WhatsApp.

### 2.3 Lo que ya existe y debe preservarse

No se debe romper lo siguiente:

- el bloque actual de metricas de correo,
- la vista de frases WhatsApp,
- el mapa de conversion multicanal,
- la compatibilidad temporal con `contacto_id`,
- la nueva semantica de `persona_id`,
- los exports actuales,
- la navegacion y tabs existentes en el panel.

## 3) Lectura de producto

La vista correcta no debe intentar contar una sola historia.

Debe quedar separada en estas capas:

1. `Metricas de correo`
2. `Metricas de WhatsApp`
3. `Metricas de conversion / oportunidades`

Y, en paralelo:

- `mapa-de-conversion` debe seguir mostrando trafico web, conversaciones y atribucion.
- `prospeccion/metricas` debe convertirse en un tablero de ejecucion y rendimiento de campañas, con WhatsApp y correo separados.

## 4) Causa tecnica raiz

### 4.1 Prospeccion / metricas

El tablero actual usa como base una agregacion de campañas que depende del ledger de envios y del tracking historico de correo.

Eso significa:

- si una campaña es WhatsApp,
- pero su ejecucion no se materializa en `prospeccion_contacto_envio`,

entonces el tablero no la ve como envio.

### 4.2 Mapa de conversion

El mapa de conversion ya esta organizado por fuentes separadas:

- `traffic_web`
- `conversation_channels`
- `whatsapp_atribucion`

Eso esta mejor alineado con la semantica multicanal, pero no sustituye un reporte de envios de campañas.

### 4.3 Refactor de persona/contacto

El refactor de personas es importante, pero aqui actua como contexto, no como causa principal.

La compatibilidad temporal sigue viva:

- `persona_id` es la llave canonica nueva,
- `contacto_id` aun existe en varios contratos por compatibilidad,
- `prospeccion_whatsapp_atribucion_eventos` ya fue adaptada parcialmente a persona.

Por eso la solucion debe respetar ambos contratos mientras dure la migracion.

## 5) Objetivo de la nueva arquitectura de metricas

### 5.1 Separacion funcional

Se propone separar la lectura de metricas en tres bloques:

- `campanas_correo`
- `campanas_whatsapp`
- `frases_whatsapp`

Y un bloque adicional para conversion:

- `conversiones_oportunidades`

### 5.2 Regla de lectura

Cada bloque debe responder una pregunta distinta:

- `campanas_correo` = que se envio por correo y como respondio.
- `campanas_whatsapp` = que batches WhatsApp se ejecutaron, cuantas conversaciones generaron, cuantas respuestas recibieron y cuantas oportunidades produjeron.
- `frases_whatsapp` = que frases o CTAs dispararon atribucion y conversion.
- `conversiones_oportunidades` = que termino en oportunidad y con que canal o atribucion.

### 5.3 Matriz de verdad por vista

Esta es la frontera operativa que debe respetarse en toda la carpeta:

#### `prospeccion/metricas`

Vista de ejecucion y rendimiento de campañas.

- `campanas_correo`
  - envios totales
  - enviados
  - entregados
  - respondidos
  - aperturas y clicks cuando existan
- `campanas_whatsapp`
  - lotes/batches ejecutados
  - mensajes salientes
  - mensajes entrantes
  - conversaciones respondidas / sin respuesta
  - oportunidades generadas por esas conversaciones
- `frases_whatsapp`
  - atribucion por frase, regla o CTA
  - conversion por canal publicitario
  - oportunidades derivadas de atribucion

No debe usar `mapa-de-conversion` como reemplazo de estos bloques, porque el mapa no mide ejecucion de campañas.

#### `mapa-de-conversion`

Vista de adquisicion, atribucion y conversion.

- trafico web
- conversaciones por canal
- atribucion WhatsApp
- conversion a oportunidad
- mapa geografico de visitantes/leads

No debe inferir campañas enviadas como si fueran conversaciones o conversiones.

#### `prospeccion/campanas`

Vista de definicion y configuracion.

- plantillas
- canales
- reglas
- canal operativo

No debe convertirse en tablero de resultados.

#### `prospeccion/prospectos`

Vista de ejecucion del envio y seguimiento puntual.

- lotes
- envios individuales
- estados operativos
- errores y reintentos

No debe convertirse en la fuente principal del resumen global de metricas.

## 6) Fuentes de datos por bloque

### 6.1 Correo

Debe seguir usando el ledger historico de envios y respuestas de correo.

Fuentes esperadas:

- `prospeccion_contacto_envio`
- `prospeccion_contacto_batch`
- `mensajes`
- `campanas`

### 6.2 WhatsApp

Debe usar la ejecucion real de batches y la evidencia de conversacion.

Fuentes esperadas:

- `prospeccion_contacto_batch`
- `mensajes`
- `conversaciones`
- `prospeccion_whatsapp_atribucion_eventos`
- `oportunidades`

### 6.3 Conversion

Debe usar los registros que ya reflejan resultado comercial.

Fuentes esperadas:

- `conversaciones`
- `oportunidades`
- `prospeccion_whatsapp_atribucion_eventos`
- relaciones persona/contacto cuando aplique por compatibilidad

## 7) Propuesta tecnica

### 7.1 Nuevo contrato de respuesta

En `prospeccion/metricas` conviene evolucionar a un payload con bloques explicitos.

Ejemplo conceptual:

```json
{
  "ok": true,
  "campanas_correo": { "summary": {}, "items": [], "timeseries": [] },
  "campanas_whatsapp": { "summary": {}, "items": [], "timeseries": [] },
  "frases_whatsapp": { "summary": {}, "by_channel": [], "by_rule": [], "timeseries": [] },
  "conversiones_oportunidades": { "summary": {}, "items": [], "timeseries": [] }
}
```

La clave es no mezclar semanticas distintas bajo un mismo nombre de `campanas`.

### 7.2 Estrategia de backend

Se recomienda una evolucion por fases:

1. mantener el contrato actual,
2. agregar un bloque nuevo para WhatsApp,
3. migrar el frontend a consumir ambos bloques,
4. una vez validado, decidir si el bloque viejo de correo queda como compatibilidad o se renombra.

### 7.3 Estrategia de datos

Para WhatsApp no se debe forzar la informacion a `prospeccion_contacto_envio`.

Lo correcto es construir un agregado propio desde:

- batches,
- mensajes,
- conversaciones,
- oportunidades,
- atribucion WhatsApp.

### 7.4 Estrategia de compatibilidad

Mientras el refactor de personas siga vivo:

- usar `persona_id` como llave principal,
- conservar `contacto_id` como fallback donde existan contratos viejos,
- no eliminar campos legacy hasta validar que no rompen joins ni filtros.

### 7.5 Definicion de campos operativos

Para evitar futuros cruces incorrectos, esta carpeta debe usar estas reglas:

- `batches_total` = numero de lotes ejecutados.
- `prospectos_total` = numero de destinatarios incluidos en esos lotes, no numero de mensajes.
- `mensajes_salientes` = mensajes reales enviados por WhatsApp.
- `mensajes_entrantes` = respuestas detectadas.
- `conversaciones_total` = conversaciones atribuidas al flujo de prospeccion.
- `oportunidades_total` = oportunidades ligadas a esas conversaciones.
- `envios_totales` en correo = numero de envios reales de correo, no conversaciones ni prospectos.

Estas definiciones son obligatorias para `prospeccion/metricas`, `mapa-de-conversion` y cualquier exportacion derivada.

## 8) Propuesta para `mapa-de-conversion`

La vista de mapa no debe convertirse en un dashboard de envios.

Debe seguir concentrandose en:

- trafico web,
- conversaciones,
- atribucion WhatsApp,
- conversion por canal.

Lo que si puede hacerse es mejorar la lectura visual para que el usuario entienda mejor que:

- `WhatsApp por canal` no es lo mismo que `campañas enviadas`,
- `campañas enviadas` no es lo mismo que `atribucion de frases`,
- `conversaciones` no es lo mismo que `oportunidades`.

## 9) Plan de implementacion sugerido

### Fase 1. Definir contrato

Actividades:

- documentar el nuevo contrato de respuesta de metricas,
- definir que bloque vive en `prospeccion/metricas` y cual en `mapa-de-conversion`,
- fijar nombres explicitos de bloques y series.

### Fase 2. Diseñar agregado de WhatsApp

Actividades:

- diseñar el agregado de campañas WhatsApp,
- definir indicadores de envio, respuesta y oportunidad,
- decidir si la serie diaria se construye desde batches, mensajes o ambos.

### Fase 3. Ajustar backend

Actividades:

- agregar la nueva agregacion sin romper la actual,
- conservar compatibilidad para el bloque de correo,
- usar `persona_id` donde ya exista y `contacto_id` solo como puente.

### Fase 4. Ajustar frontend

Actividades:

- separar visualmente correo, WhatsApp y conversion,
- evitar que el usuario interprete un bloque como si fuera otro,
- mantener estados vacios y de carga por bloque.

### Fase 5. Validar datos

Actividades:

- comparar totales por campaña,
- comparar respuestas vs oportunidades,
- revisar que `mapa-de-conversion` siga mostrando lo que debe mostrar,
- confirmar que no se rompio ningun flujo del plan de personas/contactos.

## 10) Riesgos

- Romper el contrato actual de `prospeccion/metricas`.
- Duplicar conteos entre correo y WhatsApp.
- Mezclar atribucion con envio.
- Volver a depender de `contacto_id` como llave principal.
- Hacer que el mapa de conversion asuma que una campaña enviada es igual a una conversacion.

## 11) Criterio de exito

Se considerara resuelto cuando:

- `prospeccion/metricas` muestre correo y WhatsApp por separado.
- `mapa-de-conversion` siga mostrando trafico, conversaciones y atribucion.
- las metricas de WhatsApp muestren envios, respuestas y oportunidades.
- la semantica de `persona_id` quede respetada.
- nada de lo ya avanzado en los planes anteriores quede roto.

## 12) Decision recomendada

No tocar primero el frontend.

Primero hay que dejar documentado y luego implementar la separacion de fuentes en backend y contrato de respuesta.

La regla es:

- correo sigue con su ledger historico,
- WhatsApp obtiene su propio agregado,
- conversion queda como capa de resultado,
- mapa de conversion mantiene su lectura multicanal.

## 13) Evaluacion de migraciones anteriores

Revisando la documentacion y los commits anteriores hasta `3dc8c7297d0178fb0e8fef941b3a2e16ddc877fe`, la conclusion es:

- no se deben deshacer las migraciones del refactor de personas/contactos,
- si se deben reemplazar o superseder las migraciones de metricas WhatsApp de julio 2026,
- y la correccion debe ser aditiva, no destructiva.

### 13.1 Migraciones que se conservan

Estas piezas siguen alineadas con el runtime actual y con la semantica de conversacion/persona:

- `supabase/migrations/20280512_140000_whatsapp_personas_runtime.sql`
- `supabase/migrations/20280512_141000_whatsapp_registrar_mensaje_personas.sql`
- `supabase/migrations/20280512_160000_inbox_visibility_use_conversation_org.sql`
- `supabase/migrations/20280512_163000_inbox_threads_personas_only.sql`
- `supabase/migrations/20280512_174000_inbox_threads_messages_personas.sql`
- `supabase/migrations/20280604_090000_prospeccion_whatsapp_atribucion_persona_fk.sql`

### 13.2 Migraciones que se deben sustituir

Estas migraciones no deben revertirse a ciegas, pero si deben ser reemplazadas por una version v2 que lea desde la verdad operativa real:

- `supabase/migrations/20260701_200000_prospeccion_campana_whatsapp_metricas_rango.sql`
- `supabase/migrations/20260701_201000_prospeccion_campana_whatsapp_metricas_rango_respuestas.sql`
- `supabase/migrations/20260701_202000_prospeccion_campana_whatsapp_metricas_rango_rate_fix.sql`
- `supabase/migrations/20260701_204000_fix_prospeccion_campana_whatsapp_replies_from_conversations.sql`

### 13.3 Motivo tecnico

La logica actual de esas RPCs depende demasiado de:

- `mensajes.datos->>'source' = 'prospeccion'`
- `mensajes.datos ? 'batch_id'`
- `mensajes.datos ? 'campana_id'`

Pero en la data real el contexto canónico de campaña vive de forma mas confiable en:

- `conversaciones.inbox_context.source`
- `conversaciones.inbox_context.batch_id`
- `conversaciones.inbox_context.campana_id`

Por eso el agregador actual subcuenta o pierde registros validos.

### 13.4 Regla de correccion

La nueva version debe:

- tomar `conversaciones.inbox_context` como base de atribucion,
- cruzar `mensajes`, `eventos_entrega` y `oportunidades`,
- y mantener compatibilidad con lo ya consumido por el panel.
