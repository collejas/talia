# Backlog maestro · Mapa de conversion

Fecha: 2026-07-01
Ruta: `docs/Plan_mapa_conversion/backlog_maestro_mapa_conversion.md`

## 1) Regla de uso

Este es el unico backlog operativo de la carpeta `docs/Plan_mapa_conversion`.

Todo lo demas en la carpeta es contexto, arquitectura, UX, performance o historial.

Orden de ejecucion obligatorio:

1. Base de datos
2. Backend
3. Frontend

No se debe empezar frontend antes de cerrar el contrato de datos.

## 2) Objetivo final

Dejar alineados:

- `prospeccion/metricas`
- `mapa-de-conversion`
- el refactor de `persona/contacto`
- y las metricas reales de campañas WhatsApp y correo

sin romper compatibilidad ni duplicar semantica.

## 3) Epic A · Base de datos

### A.1 Separar la fuente de verdad de WhatsApp

Objetivo:

- dejar de depender de `prospeccion_contacto_envio` como unico ledger de prospeccion.

Tareas:

- definir el agregado canónico para campañas WhatsApp,
- revisar si hace falta vista o tabla de resumen por batch/campaña,
- asegurar que la atribucion WhatsApp siga usando `persona_id` como llave principal,
- conservar `contacto_id` solo como compatibilidad temporal.

### A.2 Normalizar contrato de conversion

Objetivo:

- asegurar que conversion y oportunidad no queden mezcladas con envio.

Tareas:

- revisar relaciones entre conversaciones, oportunidades y atribucion,
- validar campos que ya existen para trazabilidad,
- evitar depender de JSON para campos estructurales nuevos.

### A.3 Alinear catalogos de campaña

Objetivo:

- distinguir campañas de correo, WhatsApp y conversion.

Tareas:

- revisar catalogo `campanas`,
- revisar lotes `prospeccion_contacto_batch`,
- revisar eventos `prospeccion_whatsapp_atribucion_eventos`,
- definir si hace falta un campo explicito de tipo de bloque en un agregado nuevo.

## 4) Epic B · Backend

### B.1 Separar metadatos de metricas

Objetivo:

- dejar de mezclar correo y WhatsApp en una sola respuesta ambigua.

Tareas:

- refactorizar `prospeccion/metricas` para entregar bloques separados,
- mantener bloque de correo,
- agregar bloque de WhatsApp,
- mantener bloque de frases WhatsApp,
- agregar bloque de conversiones/opportunities si aplica.

### B.2 Ajustar agregacion de WhatsApp

Objetivo:

- construir metricas de WhatsApp desde sus fuentes reales.

Tareas:

- agregar agregacion por batch,
- agregar respuesta y oportunidad por conversacion,
- usar `prospeccion_whatsapp_atribucion_eventos`,
- respetar `persona_id` como llave operativa.

### B.3 Mantener compatibilidad

Objetivo:

- no romper lo que ya consume el panel.

Tareas:

- conservar la forma actual del bloque de correo mientras se migra,
- conservar `contacto_id` donde el contrato viejo lo siga requiriendo,
- no cambiar contratos de front hasta que el backend nuevo exista.

### B.4 Alinear mapa de conversion

Objetivo:

- mantener el mapa como lectura multicanal, no como reporte de envios.

Tareas:

- conservar `traffic_web`,
- conservar `conversation_channels`,
- conservar `whatsapp_atribucion`,
- revisar si hace falta exponer una pequeña capa de resumen adicional para campañas ejecutadas.

## 5) Epic C · Frontend

### C.1 Reordenar `prospeccion/metricas`

Objetivo:

- que el usuario vea claramente correo, WhatsApp y conversion separados.

Tareas:

- dividir cards y tablas por bloque,
- evitar que `campanas` signifique dos cosas distintas,
- mostrar estados vacios y de carga por bloque.

### C.2 Mantener `mapa-de-conversion`

Objetivo:

- no convertir el mapa en un dashboard de campañas.

Tareas:

- seguir mostrando trafico web,
- seguir mostrando conversaciones,
- seguir mostrando atribucion WhatsApp,
- reforzar etiquetas y explicaciones de lectura.

### C.3 Validar exportaciones

Objetivo:

- no romper CSV/XLSX ni filtros.

Tareas:

- revisar export de metricas,
- revisar export del mapa,
- asegurar consistencia con los nuevos bloques.

## 6) Prioridad de entrega

Orden de trabajo sugerido:

1. BD
2. Backend
3. Frontend
4. Validacion

## 7) Definition of done

Se considera terminado cuando:

- el backend expone correo y WhatsApp por separado,
- el mapa sigue estable,
- las oportunidades y respuestas aparecen en sus bloques correctos,
- `persona_id` es la llave principal donde corresponde,
- y `contacto_id` queda solo como compatibilidad temporal.
