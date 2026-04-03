# KPIs Dashboard

Fecha: 2026-04-03  
Última actualización: 2026-04-03

## Objetivo
Documentar el estado real del dashboard KPI, las decisiones tomadas, los bloques implementados, las fuentes de datos usadas y los pendientes que siguen abiertos.

El criterio usado durante toda la iteración fue:
- cada KPI debe ayudar a tomar una decisión,
- evitar totales agregados que no expliquen comportamiento,
- priorizar métricas accionables por bloque.

## Estado actual

### Implementado
- Dashboard conectado a datos reales.
- Filtros globales por rango y fechas manuales.
- Rangos soportados:
  - `Hoy`
  - `Ayer`
  - `Semana`
  - `15 días`
  - `Últimos 30 días`
  - `Bimestre`
  - `Trimestre`
  - `Semestre`
  - `Año`
  - `Fechas manuales`
- Encabezados visibles por bloque:
  - `Ventas · Leads`
  - `Atención · Conversaciones`
  - `Oportunidades · Pipeline`
  - `Marketing · Prospección`
  - `Agenda · Citas`
  - `Evolución de Leads`
  - `Rendimiento de Campañas`
- Layout refinado en secciones clave:
  - `Atención · Conversaciones`: tarjetas `2x2` a la izquierda + gráfica a la derecha.
  - `Oportunidades · Pipeline`: gráfica a la izquierda + tarjetas `2x2` a la derecha.
- Estilo de tarjetas, badges y footers unificado en los bloques principales.

### Gráficas implementadas
- `Evolución de Leads`
- `Rendimiento de Campañas`
- `Conversaciones por canal`
- `Pipeline por salud`
- `CatalogSalesCard`
- `CatalogPipelineCard`

## Hallazgos importantes confirmados
- En `conversaciones`, el canal `manual` corresponde en la práctica a correo y se normalizó como `email`.
- Las métricas de prospección dependen del timezone efectivo del tenant. El dashboard se alinea al timezone operativo real, no a UTC puro.
- El bloque `Ventas · Leads` dejó de depender de `pipeline/overview` porque con ventanas amplias daba resultados inconsistentes; hoy se reconstruye desde `/crm/oportunidades`.
- El KPI de `Leads ganados` requería considerar `etapa.categoria = ganada`, no solo `estado = ganada`.
- `Rendimiento de campañas` tuvo que rellenar días vacíos con `0` para no recortar visualmente el periodo.
- En agenda, el dato real actual está mucho más orientado a bookings ligados a conversación/contacto que a una operación madura de citas por estado.

## Fuentes de datos usadas

### Ventas · Leads
- `GET /crm/oportunidades`
- `public.oportunidades`
- Cálculo en frontend para:
  - nuevos
  - ganados
  - perdidos
  - abiertas
  - valor ganado
  - ticket promedio
  - días a cierre
  - top vendedor

### Atención · Conversaciones
- `GET /crm/dashboard/kpis`
- RPC `public.dashboard_kpis(...)`
- `public.conversaciones`
- `public.mensajes`
- `public.contactos`

### Oportunidades · Pipeline
- `GET /crm/oportunidades`
- `public.oportunidades`
- datos de etapa embebidos en el payload de oportunidades

### Marketing · Prospección
- `GET /crm/prospeccion/metricas`
- `campanas.summary`
- `campanas.items`
- `campanas.timeseries`
- `frases_whatsapp.summary`
- `frases_whatsapp.by_rule`
- `frases_whatsapp.timeseries`

### Agenda · Citas
- `GET /crm/agenda/bookings`
- `public.calendar_bookings`
- `public.panel_calendar_bookings`
- cálculos derivados sobre items normalizados del frontend

## Bloques implementados

### 1) Ventas · Leads
Objetivo del bloque:
- medir entrada comercial,
- conversión,
- revenue,
- responsable con mayor volumen.

#### KPI actuales
1. `Leads nuevos`
2. `Leads ganados`
3. `Valor ganado`
4. `Top vendedor`

#### Contexto mostrado en footers / badges
- `% de nuevos sobre total`
- `% de conversión`
- `abiertos`
- `perdidos`
- `días promedio a cierre`
- `ticket promedio`
- `total de leads`

#### Qué resuelve bien
- separa entrada vs. resultado,
- hace visible la conversión real,
- hace visible el monto ganado,
- deja claro el ticket promedio y el tiempo a cierre.

#### Pendientes potenciales
- `Top vendedor por monto`, no solo por volumen.
- `Comparativo periodo anterior`.
- `Conversión por vendedor`.

### 2) Atención · Conversaciones
Objetivo del bloque:
- medir atención real,
- detectar conversaciones sin seguimiento,
- comparar desempeño entre canales,
- medir conversión a contacto.

#### KPI actuales
1. `Conversaciones`
2. `Sin respuesta`
3. `Primera respuesta`
4. `Conversión a contacto`

#### Contexto mostrado en footers / badges
- distribución por canal:
  - WhatsApp
  - Email
  - Voz
  - Otros
- `canales activos`
- `sin respuesta por canal`
- `activas en 24h`
- `abiertas`
- `canal más ágil`
- `canal más lento`
- `con contacto creado`
- `mejor canal por conversión`

#### Gráfica complementaria
- `Conversaciones por canal`
  - volumen total por canal
  - sin respuesta por canal

#### Qué resuelve bien
- detecta backlog de atención,
- permite comparar canales,
- hace visible el costo operativo de no responder,
- conecta conversaciones con generación de contacto.

#### Pendientes potenciales
- `Conversaciones cerradas vs abiertas` como serie.
- `Tasa conversación → oportunidad`.
- `Tiempo de respuesta por responsable`.

### 3) Oportunidades · Pipeline
Objetivo del bloque:
- medir salud del pipeline,
- detectar atasco,
- detectar falta de asignación,
- ver valor económico bruto y ponderado.

#### KPI actuales
1. `Oportunidades activas`
2. `Monto estimado pipeline`
3. `Oportunidades sin asignar`
4. `Oportunidades estancadas`

#### Contexto mostrado en footers / badges
- `etapa dominante`
- `monto ponderado`
- `cierres probables en 14 días`
- `% sin asignar`
- `ya asignadas`
- `etapa con mayor atasco`
- `edad promedio`

#### Gráfica complementaria
- `Pipeline por salud`
  - activas
  - sin asignar
  - estancadas
  - cierres probables en 14 días

#### Qué resuelve bien
- permite ver si el pipeline existe pero está inmóvil,
- permite ver riesgo por falta de asignación,
- permite priorizar limpieza y seguimiento.

#### Limitación actual
- `Monto ponderado` depende de que `probabilidad` esté cargada en oportunidades. En tenants donde está en `0/null`, el KPI también será `0`.

#### Pendientes potenciales
- `Oportunidades con cita / sin cita`.
- `Aging por etapa` más formal.
- `Top vendedor con más pipeline estancado`.

### 4) Marketing · Prospección
Objetivo del bloque:
- medir qué plantilla, campaña o enlace está funcionando mejor,
- evitar métricas demasiado agregadas.

#### Contexto funcional confirmado
El flujo real de prospección es:
1. descubrimiento de prospectos en:
   - `prospeccion/google-busqueda`
   - `prospeccion/denue-busqueda`
2. guardado en:
   - `prospeccion/prospectos`
3. ejecución de campañas en frío desde prospectos:
   - correo
   - WhatsApp
   - voz
4. plantillas definidas en:
   - `prospeccion/campanas`
5. enlaces con atribución WA generados en:
   - `prospeccion/whatsapp-atribucion`

#### KPI actuales
1. `Email con más clicks`
2. `Email con mejor apertura`
3. `Email con más rebotes`
4. `Mejor plantilla WhatsApp`
5. `Enlace WA con más conversaciones`
6. `Enlace WA con más oportunidades`

#### Gráfica complementaria
- `Rendimiento de campañas`
  - entregas
  - respuestas
  - WA atribuido

#### Qué resuelve bien
- ya no muestra solo agregados,
- ya permite identificar mejor plantilla o enlace,
- ya traduce la data de prospección a comportamiento útil.

#### Pendientes potenciales
- separar por canal con tabs o filtros,
- ranking `Top 5` visible por plantilla/campaña,
- campañas de voz mejor representadas,
- comparativo entre plantillas de correo por `open/click/bounce` en una tabla o mini chart.

### 5) Agenda · Citas
Objetivo del bloque:
- medir cobertura operativa real de agenda,
- visibilidad de vínculo con conversación/contacto,
- detectar bookings sin responsable.

#### KPI actuales
1. `Citas en total`
2. `Ligadas a conversación`
3. `Sin asignar`
4. `Con contacto`

#### Contexto mostrado en footers / badges
- `activas`
- `próximas 24h`
- `realizadas`
- `% ligadas a conversación`
- `% con contacto`
- `canceladas`
- `reuniones virtuales`

#### Qué resuelve bien
- da visibilidad de cobertura y calidad del booking,
- muestra si el booking está realmente conectado al flujo comercial,
- detecta bookings sin responsable visible.

#### Limitación actual
- el dato actual de agenda todavía no tiene suficiente madurez en estados operativos (`confirmada`, `cancelada`, `realizada`) para construir KPIs más comerciales.

#### Pendientes potenciales
- `Tasa de confirmación real`.
- `Reprogramadas`.
- `Tiempo entre lead y cita`.
- `Citas por canal de origen` cuando el dato esté más estructurado.

## Gráficas implementadas y criterio

### Evolución de Leads
- respeta el rango global,
- muestra días vacíos,
- sirve para lectura temporal de entrada/cierre.

### Rendimiento de Campañas
- respeta el rango global,
- muestra días vacíos,
- sirve para lectura temporal de entregas, respuestas y atribución WA.

### Conversaciones por canal
- sirve para detectar rápidamente dónde está el volumen y dónde está el backlog.

### Pipeline por salud
- sirve para leer salud operativa del pipeline, no solo tamaño.

## Cambios técnicos importantes realizados
- `dashboard_kpis` fue extendido para incluir:
  - `por_canal`
  - `sin_respuesta_total`
  - `sin_respuesta_por_canal`
  - `abiertas_total`
  - `activas_24h`
  - `tiempos_respuesta.por_canal`
  - `contactos.desde_conversaciones`
- `manual/correo/email` se normalizó como `email`.
- `voz/voice/llamada/call` se normalizó como `voz`.
- `Ventas · Leads` se reconstruyó desde `/crm/oportunidades` para evitar inconsistencias con ventanas amplias.
- se corrigieron overflows visuales de badges en tarjetas.
- se alineó el comportamiento del gráfico de campañas al de leads para mostrar días sin datos.
- se reordenaron secciones con layout combinado tarjetas + gráfica.

## Pendientes abiertos

### Datos / backend
1. `Top vendedor por monto` en ventas.
2. `Conversación → oportunidad` en atención.
3. `Con cita / sin cita` en pipeline.
4. `Aging por etapa` más detallado.
5. `Tasa de confirmación` y `tiempo lead → cita` en agenda.
6. Mejor soporte de voz en marketing.

### UX / visual
1. Revisar en pantalla final el orden exacto de bloques si cambia prioridad operativa.
2. Evaluar si `Agenda · Citas` merece mantener 4 tarjetas o reducirse mientras el dato madura.
3. Considerar una tabla o ranking visible debajo de `Marketing · Prospección`.

## Resultado actual
El dashboard ya dejó de ser un resumen superficial. Hoy cada bloque principal responde mejor a una pregunta operativa concreta:
- `Ventas · Leads`: entrada, conversión, revenue y responsable.
- `Atención · Conversaciones`: backlog, velocidad de respuesta, canal y conversión a contacto.
- `Oportunidades · Pipeline`: salud, atasco, asignación y valor.
- `Marketing · Prospección`: qué plantilla, campaña o enlace está funcionando.
- `Agenda · Citas`: cobertura y calidad operativa del booking.
