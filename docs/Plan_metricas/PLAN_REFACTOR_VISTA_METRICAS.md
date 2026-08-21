# Plan de refactor · Vista `prospeccion/metricas`

Fecha: 2026-08-21 (UTC)
Estado: propuesta de producto, UX y arquitectura

## 1. Objetivo

Reorganizar `prospeccion/metricas` para que el usuario entienda primero el
resultado global de sus campañas y después pueda profundizar en un canal
específico:

1. Resumen general.
2. Selección de canal.
3. Métricas especializadas del canal seleccionado.

La vista debe ayudar a comparar y decidir rápidamente, sin mezclar métricas
operativas de WhatsApp, Correo y Voz en los mismos bloques.

## 2. Problema actual

La vista actual presenta pestañas y bloques con responsabilidades mezcladas:

- Campañas generales.
- Campañas WhatsApp.
- Frases WhatsApp.
- Filtros globales que aplican de forma distinta según la pestaña.

Esto obliga al usuario a entender la estructura técnica antes de responder
preguntas simples como:

- ¿Cómo funcionaron mis canales?
- ¿Qué canal tuvo mejores resultados?
- ¿Qué ocurrió específicamente con el correo?

Además, algunos indicadores generales combinan unidades distintas: envíos de
correo, mensajes WhatsApp, conversaciones, oportunidades y conversiones.

## 3. Arquitectura de navegación propuesta

### 3.1 Nivel 1 · Resumen general

Vista inicial de la pantalla. Debe mostrar únicamente indicadores comparables
entre canales.

Indicadores sugeridos:

- Actividad total.
- Entregas o contactos efectivos.
- Respuestas.
- Conversaciones.
- Oportunidades.
- Conversiones o clientes.
- Costo total, cuando exista información comparable.

Debe incluir una comparación por canal:

| Canal | Actividad | Resultado efectivo | Respuestas | Oportunidades | Conversión |
| --- | ---: | ---: | ---: | ---: | ---: |
| WhatsApp | — | — | — | — | — |
| Correo | — | — | — | — | — |
| Voz | — | — | — | — | — |

No se deben sumar sin aclaración métricas incompatibles. Por ejemplo, un
mensaje WhatsApp y un envío de correo pueden aparecer en actividad total, pero
deben conservar su etiqueta de canal y unidad.

### 3.2 Nivel 2 · Selector de canal

El usuario podrá seleccionar:

- WhatsApp.
- Correo.
- Voz.

El selector debe ser una navegación principal visible, no un filtro escondido
en una sección secundaria.

Al seleccionar un canal, el encabezado debe indicar claramente:

- canal activo;
- periodo;
- campaña seleccionada, si aplica;
- unidad principal de medición.

### 3.3 Nivel 3 · Vista especializada

#### WhatsApp

- Lotes.
- Mensajes enviados.
- Mensajes entregados.
- Mensajes leídos.
- Mensajes fallidos.
- Conversaciones.
- Respuestas.
- Oportunidades.
- Clientes.
- Costos, CPO y CAC cuando existan.
- Atribución por frases, reglas, campaña y plantilla.

#### Correo

- Envíos.
- Entregados.
- Aperturas únicas.
- Clics únicos.
- Rebotes suaves y duros.
- Bloqueos.
- Bajas, cuando aplique.
- Sesiones web atribuidas.
- Rendimiento por campaña y plantilla.

#### Voz

- Llamadas realizadas.
- Llamadas contestadas.
- Llamadas no contestadas.
- Duración, si está disponible.
- Resultado de llamada.
- Respuestas.
- Oportunidades y conversiones.

## 4. Contrato de datos objetivo

La respuesta de `GET /prospeccion/metricas` debe organizarse conceptualmente
en:

```text
resumen_general
  totales
  por_canal

canales
  whatsapp
  correo
  voz
```

Cada canal debe devolver solo las métricas propias de su dominio. El resumen
general puede consumir agregados de los bloques de canal, pero no debe crear
una segunda lógica de cálculo.

Contrato de responsabilidad:

- `campanas_correo`: entregabilidad, aperturas, clics y sesiones atribuidas.
- `campanas_whatsapp`: lotes, mensajes, conversaciones, oportunidades y costo.
- `frases_whatsapp`: atribución por frase, regla y canal publicitario.
- Voz: resultados de llamadas y conversiones cuando el origen esté disponible.
- `resumen_general`: comparación de indicadores compatibles entre canales.

## 5. Reglas de presentación

- Toda tarjeta debe indicar canal y unidad cuando exista posibilidad de
  confusión.
- No mostrar aperturas o clics dentro de WhatsApp.
- No mostrar frases WhatsApp dentro del resumen de correo.
- No mezclar conversaciones con mensajes en una misma tasa.
- Mostrar el denominador de cada porcentaje mediante texto auxiliar o tooltip.
- Las métricas sin datos deben mostrar `—` o un estado vacío claro, no cero
  ambiguo.
- Los filtros de fecha deben ser comunes; los filtros de campaña y canal deben
  aplicarse de forma consistente.

## 6. Diseño de pantalla propuesto

### Encabezado

- Título: `Métricas de prospección`.
- Descripción breve del periodo activo.
- Acciones: actualizar y exportar.

### Resumen general

- Tarjetas generales comparables.
- Tabla o tarjetas comparativas por canal.
- Gráfica compacta de actividad y resultados por canal.

### Navegación de canales

- Tres botones o tabs: `WhatsApp`, `Correo`, `Voz`.
- El estado activo debe ser evidente.
- El resumen general debe seguir disponible para volver sin perder filtros.

### Detalle del canal

- Tarjetas propias del canal.
- Tendencia temporal.
- Tabla por campaña.
- Tabla por plantilla, regla o resultado según el canal.
- Exportación específica del canal.

## 7. Fases de implementación

### Fase 1 · Contrato y semántica

- Confirmar unidades, denominadores y nombres.
- Definir el agregado general sin duplicar lógica.
- Mantener compatibilidad temporal con los campos actuales.
- Verificar tenant, permisos y filtros.

### Fase 2 · Resumen general

- Crear el estado inicial de la vista como resumen.
- Incorporar comparación por canal.
- Evitar mostrar detalle de aperturas, frases o lotes en este nivel.

### Fase 3 · Selector y vistas por canal

- Convertir las secciones actuales en vistas internas de canal.
- Reubicar campañas WhatsApp y frases dentro de WhatsApp.
- Mantener campañas correo dentro de Correo.
- Preparar Voz sin inventar métricas cuando todavía no exista fuente completa.

### Fase 4 · Filtros y exportaciones

- Aplicar periodo y campaña de forma consistente.
- Hacer que CSV/XLSX respeten el canal activo.
- Revisar estados vacíos, carga y errores.

### Fase 5 · Rendimiento y retiro de compatibilidad

- Medir requests del resumen y del canal.
- Evitar cargar detalle de canales no seleccionados cuando no sea necesario.
- Retirar campos legacy solo después de validar consumidores y producción.

## 8. No objetivos

- No modificar listas de precios.
- No cambiar la fuente `web_sessions`.
- No alterar la vista `mapa-de-conversion`.
- No eliminar tablas ni crear una tabla paralela de métricas.
- No inventar métricas de Voz que no tengan fuente confiable.
- No romper exportaciones ni filtros existentes durante la transición.

## 9. Criterios de aceptación

- La pantalla abre primero en resumen general.
- El usuario identifica claramente los resultados de WhatsApp, Correo y Voz.
- Cada canal muestra solo sus métricas propias.
- Las tasas tienen denominadores claros.
- Los filtros funcionan igual en resumen y canal.
- Las exportaciones corresponden al canal y periodo seleccionados.
- No se duplican aperturas, clics, conversaciones u oportunidades.
- Se mantienen permisos tenant-aware y estados de carga/error/vacío.
- La vista se valida con datos reales antes de retirar compatibilidad.
