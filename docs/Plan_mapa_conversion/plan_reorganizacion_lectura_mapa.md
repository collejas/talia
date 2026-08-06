# Plan derivado · Reorganizacion de lectura del Mapa de Conversion

Fecha: 2026-08-06

## Diagnostico

El plan maestro separo fuentes de datos, pero la pantalla siguio presentando en un mismo recorrido:

- trafico web y sesiones;
- campañas de correo;
- campañas de WhatsApp;
- conversaciones WebChat, WhatsApp, correo y voz;
- CTAs y frases de atribucion;
- ubicaciones geograficas;
- etapas y oportunidades.

La separacion tecnica no fue suficiente para que el usuario entendiera que cada bloque responde una pregunta distinta.

## Nueva estructura de lectura

La vista usa cuatro lecturas excluyentes, con los mismos filtros:

### Resumen

Pregunta: ¿que paso en general?

- sesiones web;
- sesiones con contacto;
- personas unicas;
- tasa de contacto;
- sesiones por origen.

### Trafico web

Pregunta: ¿de donde llegaron las visitas?

- fuentes y medios;
- campañas de correo que generaron sesiones;
- plantillas de correo que generaron sesiones;
- referencias externas;
- detalle de sesiones web.

### Conversaciones

Pregunta: ¿quien inicio o respondio una conversacion?

- WebChat;
- WhatsApp;
- correo;
- voz;
- atribucion WhatsApp por canal;
- oportunidades de WhatsApp por campaña y plantilla;
- detalle de conversaciones.

### Mapa y embudo

Pregunta: ¿en que ubicacion y etapa se concentran los resultados?

- mapa geografico;
- tabla por ubicacion;
- etapas del embudo.

No debe mostrar rankings de campañas ni detalle de conversaciones dentro de esta lectura.

## Regla de producto

Una visita, una conversacion, un contacto y una oportunidad son eventos diferentes. La UI no debe ponerlos en la misma tarjeta ni usar una misma palabra, como conversion, para todos ellos.

## Cambios aplicados

- Se agregaron las lecturas `Resumen`, `Trafico web`, `Conversaciones` y `Mapa y embudo`.
- `AcquisitionSummary` ahora renderiza bloques segun la lectura seleccionada.
- Las tablas diferidas cargan solo sesiones web o solo conversaciones segun la lectura activa.
- Se retiro el bloque mixto de KPIs del recorrido normal.
- Se corrigio la repeticion visual del total en las tarjetas de campañas.

## Pendientes

- Validar visualmente cada lectura en desktop y movil.
- Revisar si el mapa debe tener una capa exclusiva de trafico web y otra exclusiva de conversaciones, en lugar de mostrar ambas en el mismo tooltip.
- Mantener oportunidades del pipeline como una lectura posterior, no como sinonimo de visita o conversacion.
