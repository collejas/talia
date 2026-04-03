# Plan KPIs Dashboard

Fecha: 2026-04-03

## Objetivo
Definir y habilitar KPIs reales en el dashboard, organizados por bloques (ventas, marketing/prospección, oportunidades, atención, agenda), reemplazando datos ficticios y aprovechando endpoints y RPCs ya existentes.

## Lo que ya existe (hallazgos en el repo)

### Frontend
- Vista dashboard: `frontend/panel/src/app/dashboard/page.tsx`
  - Renderiza `SectionCards`, `ChartAreaInteractive`, tarjetas de catálogo y una `DataTable`.
  - Actualmente usa datos ficticios: `frontend/panel/src/app/dashboard/data.json`.
  - No consume `/crm/dashboard/kpis` aún.
- KPI cards actuales (mock): `frontend/panel/src/components/section-cards.tsx`
  - Campos esperados: `LeadCards` (total, abiertas, ganadas, perdidas, nuevas, montoTotal, topVendedor).
- Carga de datos reales (ya implementado para leads/pipeline):
  - `frontend/panel/src/lib/leads/data.ts` -> `loadLeadsData()` llama `/crm/pipeline/overview` y `/crm/leads/restarts`.
  - `frontend/panel/src/app/dashboard/catalog-analytics.ts` -> `/crm/analytics/catalog/ventas` y `/crm/analytics/catalog/embudo`.

### Backend
- Endpoint ya disponible: `GET /crm/dashboard/kpis`
  - Definido en `backend/app/api/routes/crm.py`.
  - Llama a `repo.visitas_dashboard_kpis(...)`.
- RPC Supabase existente: `public.dashboard_kpis(...)`
  - Definido en `supabase/migrations/20260203_150000_tenant_rpc_filters.sql`.
  - Retorna un JSON con métricas de conversaciones, contactos, visitantes, tiempos de respuesta y webchat.

### Prospección/Marketing
Documentación vigente: `docs/Prospeccion/*`.
Endpoints clave:
- `GET /crm/prospeccion/metricas` (dashboard unificado campañas + frases WhatsApp).
- `GET /crm/prospeccion/contacto/metrics` (conversiones, eventos Brevo, etc.).
- `GET /crm/prospeccion/campanas/atribucion` (sesiones UTM, click-to-session).

## Fuentes de datos disponibles (resumen)

### RPC `dashboard_kpis`
Retorna (estructura JSON):
- `conversaciones`: `total`, `por_estado`, `webchat_total`, `canales_activos`
- `contactos`: `total`, `por_estado`, `captura`
- `visitantes`
- `visitas_totales`
- `tiempos_respuesta`: `promedio`, `maximo`
- `webchat`: `visitas_sin_chat`, `conversaciones`, `visitas_totales`, `contactos_completos`

### Leads / Ventas
- `/crm/pipeline/overview` -> `cards`, `chart`, `table`, `total_rows`.
- `/crm/analytics/catalog/ventas` -> ventas por item.
- `/crm/analytics/catalog/embudo` -> pipeline por item.

### Prospección / Marketing
- `/crm/prospeccion/metricas` -> campañas y frases WhatsApp con summary + timeseries.
- `/crm/prospeccion/contacto/metrics` -> conversion por fuente + eventos Brevo.
- `/crm/prospeccion/campanas/atribucion` -> sesiones UTM y atribución de clics.

### Agenda
Tablas disponibles:
- `public.calendar_bookings`
- `public.web_booking_sessions`

## Propuesta de bloques KPI (TODOS)

### 1) Atención y Conversaciones (bloque base)
Objetivo: mostrar salud operativa del sistema en atención inmediata.
KPIs:
1. Conversaciones totales (periodo).
2. Conversaciones por canal (webchat, whatsapp, voz, etc).
3. Canales activos (número).
4. Tiempo promedio de respuesta (segundos).
5. Tiempo máximo de respuesta (segundos).
6. Webchat: visitas sin chat, conversaciones, visitas totales, contactos completos.
Fuente:
- `GET /crm/dashboard/kpis` (RPC `dashboard_kpis`).

### 2) Leads / Ventas (pipeline)
Objetivo: monitorear embudo comercial y resultados.
KPIs:
1. Total de leads.
2. Leads abiertas.
3. Leads ganadas.
4. Leads perdidas.
5. Nuevas hoy / en periodo.
6. Valor ganado (monto total).
7. Tasa de conversión.
8. Top vendedor (nombre + total).
Fuente:
- `GET /crm/pipeline/overview` (ya lo consume `loadLeadsData()`).

### 3) Oportunidades y Pipeline (embudo detallado)
Objetivo: identificar cuellos de botella en etapas.
KPIs:
1. Distribución por etapa (conteos).
2. Monto estimado total en pipeline.
3. Tiempo promedio en etapa (aging).
4. Oportunidades sin actividad reciente (stale).
5. Leads con cotización.
Fuente:
- `public.oportunidades`
- `public.oportunidad_etapas_historial`
- `GET /crm/analytics/catalog/embudo`

### 4) Marketing / Prospección
Objetivo: medir adquisición, contacto y conversión por canal/campaña.
KPIs:
1. Prospectos contactados por canal.
2. Conversion por fuente (`google_places`, `denue`, `usuario`).
3. Entregas, aperturas y clicks (correo).
4. Respuestas por campaña y por canal.
5. CTR y click-to-session en campañas.
Fuente:
- `GET /crm/prospeccion/metricas`
- `GET /crm/prospeccion/contacto/metrics`
- `GET /crm/prospeccion/campanas/atribucion`

### 5) Agenda / Citas
Objetivo: medir automatización de agendamiento.
KPIs:
1. Citas confirmadas (periodo).
2. Citas canceladas / reprogramadas.
3. Tasa de confirmación.
4. Tiempo promedio entre contacto y cita.
Fuente:
- `public.calendar_bookings`
- `public.web_booking_sessions`

### 6) Catálogo / Productos (ventas por item)
Objetivo: visibilidad de performance por producto.
KPIs:
1. Top items vendidos (monto + unidades).
2. Leads ganados por item.
3. Monto pipeline por item.
Fuente:
- `GET /crm/analytics/catalog/ventas`
- `GET /crm/analytics/catalog/embudo`

## Diseño UI propuesto (inspirado en idea_dashboard.jpg)
1. Fila superior de mini-cards (6–8 KPIs rápidos): conversaciones, contactos completos, tiempo respuesta, visitas webchat, leads ganados, citas confirmadas.
2. Fila de cards medianos (2–4): prospectos, mensajes, visitantes mensuales, listings (o inventario).
3. Dos gráficos abajo:
   - Evolución leads (ya existe `ChartAreaInteractive`).
   - Tasa conversión o tasa de rebote (prospects/contactos vs visitas).

## Plan de implementación (paso a paso)

### Paso 1: Conectar KPIs base del dashboard
1. Crear loader server-side para `/crm/dashboard/kpis` en `frontend/panel/src/lib`.
2. Mapear respuesta al bloque “Atención y Conversaciones”.
3. Reemplazar `SectionCards` por datos reales.

### Paso 2: Unificar KPIs de leads y pipeline
1. Usar `loadLeadsData()` para `SectionCards` y `ChartAreaInteractive`.
2. Reemplazar `data.json` por `table` real de `loadLeadsData()`.

### Paso 3: Bloque Marketing / Prospección
1. Crear helper `fetchProspeccionMetrics()` que consuma `/crm/prospeccion/metricas`.
2. Mostrar KPIs resumidos:
   - campañas.summary
   - frases_whatsapp.summary
3. (Opcional) agregar mini-gráfico con `timeseries`.

### Paso 4: Bloque Oportunidades y Pipeline avanzado
1. Agregar endpoint o RPC para distribuciones por etapa y aging.
2. Mostrar card de “stale opportunities”.

### Paso 5: Bloque Agenda
1. Agregar RPC o endpoint `dashboard_agenda_kpis`.
2. Mostrar KPIs de citas confirmadas/canceladas.

### Paso 6: Ajustes UI
1. Mantener el layout actual pero añadir secciones por bloque.
2. Reordenar cards según prioridad del negocio.

## Requerimientos de backend (si faltan métricas)
Para completar KPIs que no estén en endpoints actuales:
1. Crear RPC `dashboard_agenda_kpis` (calendar bookings).
2. Crear RPC `dashboard_pipeline_kpis` (etapas + aging + stale).
3. Extender `dashboard_kpis` para incluir breakdowns por canal y captura.

## Definiciones de KPIs (glosario rápido)
- Conversaciones: registros en `public.conversaciones`.
- Contactos completos: `public.contactos` con `captura_estado = 'completo'`.
- Tiempo de respuesta: primera respuesta saliente posterior al primer mensaje entrante.
- Conversión leads: `ganadas / total`.
- CTR: `clicks / envios`.
- Click-to-session: sesiones UTM / clicks.

## Resultados esperados
1. Dashboard deja de usar datos ficticios.
2. Visibilidad real de salud comercial y marketing.
3. Bloques claros para ventas, marketing, oportunidades, agenda y atención.
