# Roadmap: Sección Demográfica – Mapa de Conversión

> **Condición clave**: toda la nueva sección se renderizará dentro de un componente `Wrapper` (contenedor flexible/responsivo) que gestione layout, breakpoints y estados de carga. Cada submódulo (mapas, tablas, filtros, KPIs) deberá vivir como “slot” o children dentro de este Wrapper.

---

## 1. Inventario de Datos y Brechas

1. **Dataset actual Webchat (IP)**
   - Fuentes: `webchat_visitantes`, `panel_visitantes_sin_chat_*`, `panel_webchat_visitas_detalle`.
   - Campos clave: país, estado, municipio, ciudad, cvegeo, conversión chat/no chat.
   - Pendientes: identificar payload consolidado que incluya etapas posteriores si el visitante termina como lead.

2. **Dataset actual Voz / WhatsApp (LADA)**
   - Fuentes: `panel_leads_geo_base`, `panel_leads_geo_estados/municipios`, catálogos en `backend/app/data/ladas`.
   - Campos clave: país/estado derivado por LADA, etapa y canal del lead.
   - Pendientes:
     - Confirmar mapeo LADA → municipio/localidad (hoy es sólo estado).
     - Validar disponibilidad de etapas del lead dentro de la respuesta geográfica (puede requerir extender el RPC).

3. **Dataset etapas/canales**
   - Revisar si `panel_leads_resumen` o funciones derivadas devuelven etapas por lead y si se pueden cruzar con la capa geográfica sin consultas per-lead.
   - Definir si necesitaremos nueva vista materializada (p. ej. `panel_leads_geo_etapas`) para rendimiento.

### Entregable 1
- Documento de mapeo de campos (fuente → destino → uso en UI).
- Lista de brechas técnicas (ej. “faltan etapas en `panel_leads_geo_*`”).
- Aprobar alcance con stakeholder.

---

## 2. Diseño de API / Servicios

1. **Wrapper de datos**
   - Endpoint server-side único que agregue:
     - País → Estado → Municipio para Webchat.
     - País → Estado → (Municipio opcional) para WhatsApp/Voz usando LADA.
     - Métricas de etapa (abierto, negociación, ganado, perdido).
   - Parametrizable por rango de fechas, canal y etapa.

2. **Nuevas funciones/RPC en Supabase**
   - Extender `panel_leads_geo_base` o crear `panel_leads_geo_resumen` con breakdown de etapas.
   - Crear `panel_visitantes_geo_resumen` con posibilidad de agrupar por país/estado/municipio.

3. **Backend FastAPI**
   - Exponer `/api/kpis/demografia/…` que orqueste las llamadas a Supabase y devuelva JSON listo para el Wrapper.
   - Gestionar cache/batching para evitar múltiples round-trips desde el frontend.

### Entregable 2
- Especificación técnica de endpoints + contrato de respuesta.
- Migraciones SQL o scripts de prueba listos para revisión.

---

## 3. Diseño de UI (dentro de `Wrapper`)

1. **Wrapper**
   - Componente que reciba `slots` para: filtros, KPIs, mapa, tabla detalle, tendencias.
   - Props: `level` (país/estado/municipio), `channel`, `stage`, `onLevelChange`…
   - Responsividad (grid adaptable, manejo de skeleton/loading/error).

2. **Subcomponentes**
   - **Selector jerárquico**: drop-down o breadcrumbs (País → Estado → Municipio/LADA → Ciudad).
   - **Mapas**:
     - World map (país) para resumen global.
     - Choropleth nacional (estados/municipios) para Webchat/WhatsApp.
   - **Gráfico comparativo** (stacked bars o heatmap) por canal y etapa.
   - **Tabla detalle** con paginación: nombre de ubicación, visitas por canal, leads por etapa, variación vs periodo anterior.

3. **Interacción**
   - Al cambiar nivel en Wrapper, todos los children actualizan su dataset.
   - Mantener estado global (ej. `useDemographicsStore`) para sincronizar selección con URL/params.

### Entregable 3
- Wireframes de alta fidelidad.
- Checklist de componentes React a implementar (incluyendo reutilización de existentes).

---

## 4. Implementación Iterativa

1. **Sprint 1: Datos**
   - Migraciones Supabase + tests.
   - Endpoints FastAPI con dummy response y logging.

2. **Sprint 2: Wrapper + filtros básicos**
   - Crear `Wrapper` (estructura, loading states).
   - Primer submódulo: KPIs y gráfico comparativo (usando datos reales).

3. **Sprint 3: Mapas + tablas**
   - Integrar GeoJSON (paises/estados/municipios).
   - Añadir tabla detalle y tooltips por canal/etapa.

4. **Sprint 4: Pulido**
   - Optimizaciones, fallback de datos, documentación final.
   - QA con dataset real + pruebas de performance.

---

## 5. Documentación y QA

- Actualizar manuales (`docs/mapa_de_conversion.md`) con nuevo flujo.
- Añadir guías de operación (cómo interpretar choropleth, etapas, LADA).
- Plan de pruebas: datos sintéticos, ambientes staging, validación cruzada con reportes actuales.

---

### Próximos pasos inmediatos
1. Validar este plan con stakeholders y definir prioridades (¿todos los canales en primera versión o incremental?).
2. Confirmar disponibilidad de recursos para migraciones (DBA/Supabase) y diseño (UX/UI).
3. Programar kickoff de Sprint 1 tras aprobación, asignando responsables por entregable.

`Wrapper` será el núcleo de la implementación: sin él no se comienza ningún submódulo.
