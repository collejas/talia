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

El refactor también contempla un rediseño integral de la vista y sus
subvistas. No se busca únicamente reacomodar pestañas: se replantearán la
jerarquía visual, la navegación, la densidad de información y la presentación
de cada estado para lograr una experiencia minimalista, limpia y rápida de
interpretar.

## 1.1 Dirección visual y UX

El nuevo diseño deberá:

- Priorizar el resumen y la decisión principal sobre el detalle técnico.
- Usar una jerarquía visual clara: título, periodo, resultado, tendencia y
  detalle.
- Reducir tarjetas, bordes, colores y elementos decorativos que no ayuden a
  interpretar o actuar.
- Mantener una sola acción principal visible por contexto: revisar resumen,
  cambiar canal, filtrar o exportar.
- Separar visualmente navegación, filtros, indicadores, gráficas y tablas.
- Usar espaciado, tipografía y estados consistentes en todas las subvistas.
- Presentar estados de carga, vacío, error y datos parciales sin romper el
  layout.

La vista deberá responder inmediatamente estas preguntas:

1. ¿Qué periodo y canal estoy viendo?
2. ¿Cuál fue el resultado principal?
3. ¿Qué cambió o requiere atención?
4. ¿Dónde puedo profundizar?

### Estructura visual objetivo

1. Encabezado compacto con título, periodo y acciones.
2. Resumen general con pocos indicadores prioritarios.
3. Navegación de canales como selector principal.
4. Subvista del canal con métricas, tendencia y detalle operativo.
5. Información secundaria dentro de secciones colapsables o tablas simples,
   solo cuando aporte contexto.

El rediseño debe conservar accesibilidad, responsive design, contraste,
lectura rápida y consistencia con los componentes existentes de shadcn/ui y
Radix UI. No se agregarán gráficas o tarjetas solo por llenar espacio: cada
elemento deberá justificar qué decisión facilita.

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

### 4.1 Resultado comercial y costo de WhatsApp

El bloque de WhatsApp debe incluir el resultado comercial directo de las
campañas, porque completa la lectura de rendimiento y costo:

- conversaciones atribuidas;
- respuestas o conversaciones con primera respuesta;
- oportunidades atribuidas;
- clientes ganados, cuando exista etapa comercial confiable;
- costo total conciliado;
- costo por conversación (CPC);
- costo por oportunidad (CPO);
- CAC WhatsApp, cuando existan clientes atribuidos.

Este bloque debe usar el mismo agregado canónico de atribución y cobro que
`mapa-de-conversion`. La duplicidad visual es aceptable cuando cada vista
responde una pregunta distinta; queda prohibido duplicar fórmulas o crear una
segunda fuente de datos.

Responsabilidades:

- `prospeccion/metricas`: eficiencia operativa y comercial de campañas por
  canal, periodo y campaña.
- `mapa-de-conversion`: adquisición, tráfico, conversaciones, atribución y
  contexto del resultado comercial.

Los costos incompletos no deben mostrarse como cero: deben indicar pendiente
de conciliación o no disponible.

La interfaz debe distinguir explícitamente el cohorte técnico de
`conversaciones` respecto de `respuestas`. El cohorte no debe presentarse como
el KPI principal de evaluación de campaña. El embudo visible debe usar
enviados, entregados, respuestas, oportunidades y clientes. Los importes de
costo, CPO y CAC deben conservar precisión contable de cuatro decimales para
coincidir con el mapa de conversión.

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

- Crear el estado inicial de la vista como resumen. **Primer corte
  implementado.**
- Incorporar comparación por canal.
- Evitar mostrar detalle de aperturas, frases o lotes en este nivel.

El primer corte implementado en `frontend/panel/src/app/prospeccion/metricas`
incluye un encabezado visual nuevo, navegación de cuatro estados (resumen,
Correo, WhatsApp y Voz) y una tabla compacta de rendimiento por canal. Los
detalles existentes se mantienen accesibles al seleccionar un canal para
proteger las métricas, filtros y exportaciones durante la transición.

### Fase 3 · Selector y vistas por canal

- Convertir las secciones actuales en vistas internas de canal. **Primer corte
  implementado.**
- Reubicar campañas WhatsApp y frases dentro de WhatsApp.
- Mantener campañas correo dentro de Correo.
- Preparar Voz sin inventar métricas cuando todavía no exista fuente completa.

El primer corte reemplaza el bloque grande de navegación duplicada dentro del
detalle por una cabecera compacta. WhatsApp conserva una navegación secundaria
entre `Campañas` y `Atribución`, sin retirar sus tablas, métricas ni
exportaciones.

### Fase 3.1 · Resultado comercial compartido de WhatsApp

**Primer corte implementado.** El endpoint existente
`GET /prospeccion/metricas` incorpora `resultado_comercial_whatsapp` usando el
RPC canónico `campana_conversion_resumen_rango`. El bloque incluye resumen y
detalle por campaña con conversaciones, oportunidades, clientes, costo, CPO,
CAC y estado de conciliación.

La subvista WhatsApp muestra ahora el resultado comercial sin reemplazar el
detalle operativo de envíos. Si existen cobros pendientes, los costos se
presentan como `Pendiente`; nunca se interpretan como cero conciliado.

### Fase 3.2 · Refactor de análisis de campañas WhatsApp

**Implementado.** La subvista se define como tablero de rendimiento de
campañas de mercadotecnia. Su fuente principal es `resultado_comercial_whatsapp`
y sus KPI son enviados, entregados, respuestas, oportunidades, clientes,
conversión y costos cuando estén conciliados.

Los datos de `campanas_whatsapp` se conservan únicamente para diagnóstico de
ejecución: lotes, eventos del proveedor y trazabilidad. No deben mezclarse con
el total facturable del tenant ni usarse como KPI de campaña.

El diagnóstico técnico no se muestra dentro de esta subvista; los datos
operativos deben permanecer en las vistas de operación de prospección.

Como parte de la simplificación posterior, también se retiraron del layout de
campañas los bloques `Campañas destacadas (Top 5)`, `Resumen operativo de
WhatsApp`, `Enlaces / reglas WA (Top 5)` y `Brevo hoy`. La subvista conserva
únicamente los filtros, el resultado comercial y el detalle útil para evaluar
campañas.

Los KPI superiores específicos de WhatsApp tampoco se duplican: campañas,
enviados, entregados, respuestas y oportunidades se presentan exclusivamente
en `Resultado comercial`.

Dentro de ese bloque, las tasas conservan denominadores explícitos: entrega /
envíos, respuestas / conversaciones y oportunidades / conversaciones.

La tarjeta KPI independiente de `Respuestas` se retiró porque, para este flujo,
la respuesta de prospección se considera oportunidad. También se retiró esa
columna del detalle comercial por campaña para evitar duplicidad conceptual.

El resumen general, el gráfico y las exportaciones CSV respetan la misma
separación de fuentes.

### Fase 3.3 · Resultado de atribución por frase/CTA

**Decisión de producto pendiente de implementación.** La subvista `WhatsApp >
Atribución` medirá el rendimiento de las frases o CTA inbound que activan una
regla de atribución. Este flujo es independiente de `Campañas WhatsApp`: no
lee mensajes outbound de la empresa ni mezcla costos de mensajería.

La estructura visible será:

```text
Resultado por frase
Campaña | Canal | Frase/CTA | Oportunidades | Clientes | Gasto | CPO | CAC
```

La lectura principal se organizará por campaña publicitaria, con un desglose
expandible de sus frases/CTA:

```text
Campaña publicitaria
├── Resultado de campaña
└── Resultado por frase
    ├── Frase/CTA A
    ├── Frase/CTA B
    └── Frase/CTA C
```

Reglas de costo:

- El gasto real pertenece a la campaña publicitaria y se registra por separado
  del costo de mensajes de `Campañas WhatsApp`.
- En el resumen de campaña, `Gasto`, `CPO` y `CAC` son exactos:
  `CPO = gasto real / oportunidades` y `CAC = gasto real / clientes`.
- Si una campaña contiene varias frases, el gasto no se repetirá completo en
  cada fila de frase.
- El desglose por frase podrá mostrar gasto, CPO y CAC prorrateados, siempre
  identificados como prorrateados. Si no existe una regla de distribución
  aprobada, se mostrará el resultado de la frase sin presentar un costo exacto.
- Una campaña con una sola frase puede conservar el gasto exacto de campaña.

La regla de atribución será:

```text
Frase inbound → regla → campaña publicitaria → conversación → oportunidad → cliente
```

La pantalla `prospeccion/whatsapp-atribucion` deberá permitir asociar la regla
con la campaña publicitaria y registrar su presupuesto y gasto real conciliado.
El costo deberá modelarse como dato explícito de la campaña, no dentro de la
frase ni en `metadata`.

La estructura visual de `WhatsApp > Atribución` seguirá el mismo patrón que
`WhatsApp > Campañas`, pero con las unidades propias de atribución:

### Resultado comercial

Resumen agregado del periodo con:

- Oportunidades.
- Clientes.
- Gasto publicitario.
- CPO.
- CAC.

### Resultado por campaña/frase

El detalle se presentará como una tabla jerárquica o expandible:

```text
Campaña publicitaria
└── Frase/CTA
```

Columnas:

```text
Campaña | Canal | Frase/CTA | Oportunidades | Clientes | Gasto | CPO | CAC
```

La fila de campaña mostrará el gasto publicitario exacto y sus indicadores.
Las frases mostrarán sus resultados atribuidos y, cuando corresponda, costos
prorrateados identificados explícitamente. Esta sección conservará su propia
fuente de datos y nunca mezclará el costo publicitario con el costo de mensajes
de `WhatsApp > Campañas`.

La vista de detalle no incluye una sección adicional de `Filtros globales`.
El periodo se selecciona desde el encabezado y el canal desde la navegación
principal, manteniendo la pantalla compacta.

La navegación de canales también está integrada dentro del encabezado de
`Métricas`; no se presenta como una sección independiente. Los botones usan
una fila completa con cuatro columnas iguales, mayor altura y padding uniforme,
para quedar centrados y distribuidos en una zona central más amplia. El
encabezado se divide en periodo a la izquierda, navegación al centro y título
alineado a la derecha.

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
- La subvista WhatsApp muestra resultado comercial por campaña y distingue
  costos conciliados de costos pendientes.
- El resultado por campaña usa el mismo embudo visible del mapa: enviados,
  entregados, respuestas, oportunidades, clientes y costos.
- No se duplican aperturas, clics, conversaciones u oportunidades.
- Se mantienen permisos tenant-aware y estados de carga/error/vacío.
- La vista se valida con datos reales antes de retirar compatibilidad.
- La vista y sus subvistas tienen una jerarquía visual nueva, consistente y
  claramente más simple que la actual.
- El usuario puede identificar periodo, canal, resultado y siguiente acción
  sin recorrer bloques técnicos innecesarios.
- El encabezado superior permite seleccionar periodos preconfigurados o un
  periodo personalizado mediante calendario, sin agregar una sección aparte.
- Los estados de carga, vacío, error y datos parciales conservan la misma
  estructura visual y no generan saltos confusos en la pantalla.
