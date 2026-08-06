# Plan derivado · Reorganizacion de lectura del Mapa de Conversion

Fecha: 2026-08-06

## Diagnostico

El plan maestro separo fuentes de datos, pero la pantalla siguio presentando en un mismo recorrido:

- trafico web y sesiones;
- campañas de correo y WhatsApp;
- conversaciones WebChat, WhatsApp, correo y voz;
- CTAs y frases de atribucion;
- ubicaciones geograficas;
- etapas y oportunidades.

La separacion tecnica no fue suficiente para que el usuario entendiera que cada bloque responde una pregunta distinta.

## Nueva estructura de lectura

La vista usara cuatro lecturas excluyentes, con filtros propios y un resumen transversal.

### Resumen

Pregunta: ¿cual es el estado general?

El resumen no debe repetir el detalle de `Trafico web`. Debe condensar los tres dominios principales:

- trafico web total;
- contactos y personas unicas;
- conversaciones por canal;
- oportunidades;
- tasa de contacto;
- tasa de conversion;
- principales fuentes, canales y campañas como indicadores compactos.

No debe mostrar listados ni las graficas detalladas de fuentes, campañas o plantillas.

### Trafico web

Pregunta: ¿de donde llegaron las visitas al sitio?

- sesiones web;
- origen de sesion: busqueda, referido, otro sitio, campaña, asistente digital, visita directa y otros;
- fuente, medio, campaña y plantilla;
- KPI de sesiones, personas identificadas y contacto generado desde WebChat;
- mapa geografico de las sesiones web;
- filtros por tipo de sesion, referencia, campaña, medio, plantilla y periodo;
- listado de visitas web;
- pais, estado o municipio de procedencia.

### Conversaciones

Pregunta: ¿quien inicio o respondio una conversacion y desde donde?

- mapa geografico de conversaciones, separado del mapa de visitas web;
- WebChat, WhatsApp, correo y voz como canales independientes;
- conversaciones iniciadas, respondidas, contactos y oportunidades;
- conversiones derivadas de conversaciones;
- campaña, CTA o regla de atribucion cuando exista;
- filtros por canal, campaña, CTA, ubicacion y periodo;
- listado de conversaciones.

### Campañas

Pregunta: ¿que resultado produjo cada campaña?

- correo y WhatsApp como bloques separados;
- envios, entregas, aperturas, clics y visitas cuando aplique;
- conversaciones, contactos y oportunidades generadas;
- campaña y plantilla sin mezclar identidades reutilizadas;
- filtros por canal, campaña, plantilla, ubicacion y periodo;
- mapa solamente cuando exista ubicacion confiable de los resultados.

Si una campaña no tiene ubicacion suficiente, debe mostrar tabla y KPI, no una distribucion geografica inventada.

### Filtros por lectura

Cada lectura debe mostrar solamente los filtros que modifican sus propios datos:

- `Resumen`: periodo, alcance geografico y formas de contacto. No muestra filtros de fuente, UTM, campaña o plantilla.
- `Trafico web`: periodo, alcance geografico, tipo de visita, origen, medio y campaña UTM. El canal solo se conserva para contextualizar el contacto generado desde WebChat.
- `Conversaciones`: periodo, alcance geografico, canales, etapas, tipo de campaña, campaña, plantilla y atribución de WhatsApp por canal, campaña o regla de origen.
- `Campañas`: periodo, alcance geografico, tipo de campaña, campaña y plantilla. No muestra filtros propios de sesiones web ni reglas de atribución de conversaciones.

El cambio de lectura no debe conservar filtros visualmente ajenos al contexto. Los parámetros pueden permanecer en la URL para enlaces compartidos, pero los controles visibles deben corresponder al dominio activo.

No existira una vista independiente llamada `Mapa y embudo`. El mapa debe vivir dentro del contexto que representa:

- mapa de sesiones en `Trafico web`;
- mapa de conversaciones en `Conversaciones`;
- mapa de resultados de campaña en `Campañas`, solo con trazabilidad geografica.

## Regla de producto

Una visita, un contacto, una conversacion y una oportunidad son eventos diferentes. La UI no debe ponerlos en la misma tarjeta ni usar una misma palabra, como conversion, para todos ellos.

El embudo semantico sera:

`Visita -> Contacto -> Conversacion -> Oportunidad`

Cada paso debe conservar su propio total, tasa y fuente de verdad.

## Cambios aplicados

- Se reemplazo la lectura inicial `Mapa y embudo` por `Campañas` y se dejo el mapa dentro de cada dominio.
- Se implementaron las lecturas `Resumen`, `Trafico web`, `Conversaciones` y `Campañas`.
- `AcquisitionSummary` ahora renderiza bloques segun la lectura seleccionada.
- Las tablas diferidas cargan solo sesiones web o solo conversaciones segun la lectura activa.
- El componente geografico recibe un `mapScope` para no mezclar sesiones, conversaciones y actividad de campaña en colores, totales o tooltips.
- Se retiro el bloque mixto de KPIs del recorrido normal.
- Se corrigio la repeticion visual del total en las tarjetas de campañas.
- Los controles ahora cambian por lectura: resumen compacto, adquisición web, conversaciones multicanal y resultados de campañas.
- El tooltip de `Campañas` muestra visitas atribuidas, contactos en CRM y conversaciones por canal; no presenta etapas del embudo como si fueran resultados únicos de campaña.

## Pendientes

- Revisar si cada mapa debe tener capas independientes para visitas, contactos, conversaciones y oportunidades.
- Mantener oportunidades del pipeline como una lectura posterior, no como sinonimo de visita o conversacion.
