# Plan KPIs Dashboard

Fecha: 2026-04-03  
Última actualización: 2026-04-03

## Objetivo
Definir y evolucionar el dashboard hacia KPIs reales, útiles y accionables por bloque, evitando métricas “bonitas” pero poco operativas. El criterio central es que cada KPI debe ayudar a responder:

1. Qué está funcionando.
2. Qué no está funcionando.
3. Dónde actuar hoy.

## Estado actual

### Ya implementado
- Dashboard conectado a datos reales.
- Filtros globales por rango y fechas manuales.
- Bloques visibles con encabezados por familia:
  - `Ventas · Leads`
  - `Atención · Conversaciones`
  - `Oportunidades · Pipeline`
  - `Marketing · Prospección`
  - `Agenda · Citas`
  - `Evolución de Leads`
  - `Rendimiento de Campañas`
- Gráfico de leads alineado al rango global.
- Gráfico de campañas con relleno de días sin datos.
- KPI de conversaciones corregido para contar por canal real.
- KPI de leads ganados corregido para considerar `etapa.categoria = ganada`.

### Hallazgos importantes ya confirmados
- En `conversaciones`, el canal `manual` corresponde en la práctica a conversaciones de correo; se decidió normalizarlo como `email`.
- Las métricas de prospección dependen de timezone del tenant. Ejemplo:
  - Últimos 30 días en `America/Mexico_City` sí coinciden con lo que muestra el dashboard.
  - Los mismos 30 días en UTC arrojan cifras diferentes.
- Los KPI de marketing iniciales eran demasiado agregados y no respondían qué campaña, plantilla o enlace está funcionando mejor.

## Fuentes de datos útiles

### Dashboard general
- `GET /crm/dashboard/kpis`
- RPC `public.dashboard_kpis(...)`
- Devuelve:
  - `conversaciones.total`
  - `conversaciones.por_estado`
  - `conversaciones.por_canal`
  - `conversaciones.webchat_total`
  - `conversaciones.canales_activos`
  - `contactos.total`
  - `contactos.captura`
  - `tiempos_respuesta.promedio`
  - `tiempos_respuesta.maximo`
  - `webchat.visitas_sin_chat`
  - `webchat.conversaciones`
  - `webchat.contactos_completos`

### Ventas / Leads
- `GET /crm/pipeline/overview`
- `GET /crm/analytics/catalog/ventas`
- `GET /crm/analytics/catalog/embudo`

### Oportunidades / Pipeline
- `GET /crm/oportunidades`
- Tabla `public.oportunidades`
- Tabla `public.oportunidad_etapas_historial`

### Marketing / Prospección
- `GET /crm/prospeccion/metricas`
  - `campanas.summary`
  - `campanas.items`
  - `campanas.timeseries`
  - `frases_whatsapp.summary`
  - `frases_whatsapp.by_channel`
  - `frases_whatsapp.by_rule`
  - `frases_whatsapp.timeseries`
- `GET /crm/prospeccion/contacto/metrics`
- `GET /crm/prospeccion/campanas/atribucion`
- Tablas y funciones relevantes:
  - `public.prospeccion_contacto_envio`
  - `public.prospeccion_contactos_log`
  - `public.prospeccion_whatsapp_atribucion_eventos`
  - `public.prospeccion_campana_template_atribucion_rango(...)`

### Agenda
- `GET /crm/agenda/bookings`
- `public.calendar_bookings`
- `public.web_booking_sessions`

## Criterio de diseño de KPIs

### KPI útil
Un KPI útil debe responder algo como:
- qué campaña funciona mejor,
- qué plantilla convierte mejor,
- qué canal responde más,
- qué parte del pipeline está atorada,
- dónde hay riesgo operativo.

### KPI poco útil
Un KPI poco útil es un total agregado que no ayuda a decidir nada, por ejemplo:
- “hay muchos prospectos”,
- “hay muchos envíos”,
- “hay muchas oportunidades”.

Si no responde una acción, no debe quedarse como KPI principal.

## Propuesta refinada por bloque

### 1) Ventas · Leads
Objetivo: medir resultado comercial real y eficiencia del embudo.

#### KPI actual implementado
- Total de leads
- Leads abiertas
- Leads ganadas
- Leads perdidas
- Nuevas
- Valor ganado
- Top vendedor

#### Problema del KPI actual
- Mide volumen, pero todavía no mide bien calidad de cierre ni eficiencia comercial.
- Falta separar mejor resultado vs. throughput.

#### KPI propuesto útil y valioso
1. Leads nuevos del periodo
2. Leads ganados
3. Tasa de conversión
   - `ganadas / total`
4. Valor ganado
5. Ticket promedio ganado
   - `valor_ganado / leads_ganados`
6. Leads perdidos
7. Top vendedor
   - por cierres o por monto
8. Tiempo promedio a cierre
   - `cerrado_en - creado_en`

#### Valor operativo
- Permite ver si el volumen está convirtiendo.
- Permite ver si se están cerrando tickets pequeños o grandes.
- Permite detectar si el proceso comercial está tardando demasiado.

#### Fuente
- `GET /crm/pipeline/overview`
- `public.oportunidades`

#### Pendiente técnico
- Si `tiempo promedio a cierre` no está en `pipeline/overview`, conviene agregarlo vía backend o calcularlo desde oportunidades cerradas.

### 2) Atención · Conversaciones
Objetivo: medir capacidad de respuesta, canal y calidad de captura.

#### KPI actual implementado
- Conversaciones totales
- Canales activos
- Tiempo promedio de respuesta
- Tiempo máximo de respuesta
- Webchat: visitas, sin chat, contactos completos
- Desglose por canal:
  - WhatsApp
  - Email
  - Voz
  - Otros

#### Problema del KPI actual
- Sigue demasiado cargado a webchat.
- Falta convertir la atención en métricas operativas de seguimiento.

#### KPI propuesto útil y valioso
1. Conversaciones totales
2. Conversaciones por canal
   - webchat / whatsapp / email / voz
3. Tiempo promedio de primera respuesta
4. Tiempo máximo de respuesta
5. Conversaciones sin respuesta
   - entrantes sin salida posterior
6. Contactos completos generados
7. Tasa visita → conversación
   - para webchat
8. Tasa conversación → contacto
9. Canal con mejor respuesta
   - menor tiempo o mejor conversión
10. Conversaciones activas
   - con actividad reciente / abiertas

#### Valor operativo
- Permite detectar dónde se enfrían leads.
- Permite medir si un canal funciona mejor que otro.
- Permite identificar cuellos de botella de atención y automatización.

#### Fuente
- `GET /crm/dashboard/kpis`
- `public.conversaciones`
- `public.mensajes`
- `public.contactos`

#### Pendiente técnico
- Agregar `conversaciones_sin_respuesta` y `tasa conversacion → contacto` al RPC `dashboard_kpis` o a un endpoint derivado.

### 3) Oportunidades · Pipeline
Objetivo: medir salud del pipeline, no solo volumen.

#### KPI actual implementado
- Oportunidades activas
- Monto total pipeline
- Oportunidades estancadas
- Antigüedad promedio
- Etapa principal

#### Problema del KPI actual
- Aún falta visibilidad de atasco por etapa y salud económica del pipeline.
- Sigue siendo más descriptivo que accionable.

#### KPI propuesto útil y valioso
1. Oportunidades activas
2. Monto total en pipeline
3. Oportunidades estancadas
   - sin movimiento en X días
4. Antigüedad promedio
5. Etapa con más volumen
6. Etapa con más atasco
   - por aging o por conteo de estancadas
7. Monto ponderado
   - `monto * probabilidad`
8. Próximos cierres
   - `fecha_cierre_probable` cercana
9. Oportunidades sin asignar
10. Oportunidades con cita / sin cita

#### Valor operativo
- Te dice cuánto pipeline es realmente rescatable.
- Te dice dónde intervenir hoy.
- Evita leer pipeline como “volumen bonito” cuando en realidad está atorado.

#### Fuente
- `GET /crm/oportunidades`
- `public.oportunidades`
- `public.oportunidad_etapas_historial`

#### Pendiente técnico
- Para “etapa con más atasco”, “monto ponderado”, “sin asignar” y “con cita/sin cita” conviene agregar un endpoint o helper backend específico de pipeline.

### 4) Marketing · Prospección
Objetivo: medir rendimiento real por campaña, plantilla, canal y enlace atribuido.

#### Contexto funcional importante
El flujo real de prospección es:
1. Se descubren prospectos en:
   - `prospeccion/google-busqueda`
   - `prospeccion/denue-busqueda`
2. Se filtran y guardan en:
   - `prospeccion/prospectos`
3. Desde `prospeccion/prospectos` se ejecutan campañas en frío:
   - correo
   - WhatsApp
   - voz
4. Las plantillas se construyen en:
   - `prospeccion/campanas`
5. Los enlaces `wa.me` con palabras clave se generan en:
   - `prospeccion/whatsapp-atribucion`
6. El backend capta la atribución del enlace para saber de qué enlace/campaña provino la conversación.

#### Problema detectado
Los KPI agregados tipo:
- envíos entregados,
- sesiones UTM,
- conversaciones atribuidas,
no son suficientes.

No responden:
- qué campaña funciona mejor,
- qué plantilla funciona mejor,
- qué canal funciona mejor,
- qué enlace de WhatsApp atribuye más conversaciones,
- qué enlace convierte más a oportunidad,
- dónde hay rebote/fallo.

#### KPI propuesto útil y valioso
##### Correo
1. Mejor plantilla email por clicks
2. Mejor plantilla email por open rate
3. Plantilla con mayor riesgo de rebote/fallo
4. Mejor campaña email por entregas
5. Mejor campaña email por click-to-session

##### WhatsApp
6. Mejor plantilla WhatsApp por respuestas
7. Mejor campaña WhatsApp por respuestas
8. Mejor enlace/regla WA por conversaciones atribuidas
9. Mejor enlace/regla WA por oportunidades creadas
10. Mejor enlace/regla WA por monto estimado

##### Voz
11. Mejor campaña/plantilla de voz por respuestas
12. Tasa de respuesta de voz

##### Atribución
13. Top enlace WA por conversaciones
14. Top enlace WA por conversión a oportunidad
15. Top enlace WA por monto estimado generado
16. Click-to-session de campañas correo

#### KPI que no deben quedarse como principales
- Solo “envíos totales”
- Solo “entregados”
- Solo “sesiones UTM”
- Solo “conversaciones atribuidas”

Esos datos sí sirven, pero mejor como soporte o contexto, no como KPI principal.

#### Valor operativo
- Permite decidir qué plantilla dejar, mejorar o apagar.
- Permite detectar si el problema está en entrega, apertura, click o respuesta.
- Permite saber qué enlace WA realmente genera conversación y oportunidad.

#### Fuente
- `GET /crm/prospeccion/metricas`
- `campanas.items`
- `frases_whatsapp.by_rule`
- `frases_whatsapp.by_channel`

#### Nota de implementación
El bloque de marketing debe usar rankings y no solo summaries.
La regla recomendada es:
- usar `campanas.items` para correo / whatsapp / voz,
- usar `frases_whatsapp.by_rule` para enlaces y atribución.

### 5) Agenda · Citas
Objetivo: medir automatización y seguimiento de agenda.

#### KPI actual implementado
- Citas totales
- Activas
- Próximas 24h
- Canceladas
- Realizadas

#### KPI propuesto útil y valioso
1. Citas confirmadas
2. Citas canceladas
3. Citas realizadas
4. Próximas 24h
5. Tasa de confirmación
6. Tiempo entre lead y cita
7. Citas por canal de origen

#### Fuente
- `GET /crm/agenda/bookings`
- `public.calendar_bookings`

## Prioridad de implementación recomendada
Orden recomendado para siguientes iteraciones:

1. Rehacer `Marketing · Prospección` con rankings reales por plantilla/campaña/enlace.
2. Mejorar `Ventas · Leads` con:
   - tasa de conversión,
   - ticket promedio,
   - tiempo a cierre.
3. Mejorar `Atención · Conversaciones` con:
   - sin respuesta,
   - conversación → contacto,
   - canal con mejor desempeño.
4. Mejorar `Oportunidades · Pipeline` con:
   - monto ponderado,
   - etapa con más atasco,
   - sin asignar,
   - con cita/sin cita.

## Requerimientos de backend pendientes
Para cerrar bien los KPI propuestos, probablemente hagan falta estos apoyos:

1. Extender `dashboard_kpis` con:
   - conversaciones sin respuesta
   - tasa conversación → contacto
   - mejor canal por conversión/respuesta
2. Extender pipeline con:
   - monto ponderado
   - aging por etapa
   - oportunidades sin asignar
   - oportunidades con cita/sin cita
3. Si se requiere simplificar frontend:
   - crear endpoint específico `dashboard_marketing_kpis`
   - que ya devuelva top campañas, top plantillas y top reglas WA listos para render.

## Definiciones rápidas
- `Valor ganado`: monto real/cerrado de oportunidades ganadas.
- `Ticket promedio`: valor ganado / número de cierres.
- `Conversaciones sin respuesta`: conversaciones con mensaje entrante y sin primer saliente.
- `Click-to-session`: sesiones web atribuidas / clicks.
- `Monto ponderado`: `monto_estimado * probabilidad`.
- `Estancada`: oportunidad sin actualización por encima de umbral.

## Resultado esperado final
1. El dashboard deja de ser un resumen operativo superficial.
2. Cada bloque responde una pregunta de negocio concreta.
3. Los KPI ayudan a decidir:
   - qué campaña dejar activa,
   - qué plantilla optimizar,
   - qué canal funciona mejor,
   - qué leads convierten mejor,
   - qué oportunidades requieren acción inmediata.
