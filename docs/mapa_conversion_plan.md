# Roadmap: Sección Demográfica – Mapa de Conversión

> **Condición clave**: toda la nueva sección se renderizará dentro de un componente `Wrapper` (contenedor flexible/responsivo) que gestione layout, breakpoints y estados de carga. Cada submódulo (mapas, tablas, filtros, KPIs) deberá vivir como “slot” o children dentro de este Wrapper.

---

## 1. Inventario de Datos y Brechas ✅ completado

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
- ✅ Documento de mapeo de campos y análisis en `docs/demografia_datasets.md`.
- ✅ Brechas técnicas identificadas (campos país/etapa, municipalización).
- Queda pendiente validación formal con stakeholders.

---

## 2. Diseño de API / Servicios ✅ en producción

1. **Wrapper de datos**
   - Endpoint server-side único que agregue:
     - País → Estado → Municipio para Webchat.
     - País → Estado → (Municipio opcional) para WhatsApp/Voz usando LADA.
     - Métricas de etapa (abierto, negociación, ganado, perdido).
   - Parametrizable por rango de fechas, canal y etapa.

2. **Nuevas funciones/RPC en Supabase**
   - ✅ `panel_leads_geo_base_ext`, `panel_leads_geo_resumen`, `panel_visitantes_geo_resumen` (`supabase/migrations/20251215_100000_demografia_geo_base_ext.sql`).

3. **Backend FastAPI**
   - ✅ Endpoints `/api/kpis/demografia/resumen` y `/api/kpis/demografia/mapa`.
   - Pendiente: políticas de cache/batching (evaluar tras pruebas de carga).

### Entregable 2
- ✅ Migraciones y endpoints implementados.
- 🎯 Documentar contratos en `docs/mapa_de_conversion.md` (próxima tarea).

---

## 3. Diseño de UI (dentro de `Wrapper`) ▶️ en progreso

1. **Wrapper**
   - ✅ Base reutilizada de `vista-2` con layout responsive.
   - ✅ Filtros de nivel/canales (`DemografiaControls`).
   - 🔜 Incorporar estados de carga/skeletons y buscador de municipios.

2. **Subcomponentes**
   - **Selector jerárquico**: ✅ nivel país/estado, faltan municipio/LADA y breadcrumbs.
   - **Mapas**: 🟡 Leaflet integrado para país/estado; siguiente iteración: selección de estado → municipios y derivar localidades por LADA.
   - **Estilos del mapa**: 🔜 definir escala de colores/tooltip enriquecido (porcentaje, leads) y resaltar ubicación activa.
   - **Gráfico comparativo**: ✅ barras apiladas por canal; 🔜 añadir selector temporal (7/30 días) para ver evolución por canal.
   - **Tabla detalle**: ✅ lista de ubicaciones, faltan variaciones vs periodo anterior y vista municipio/LADA.

3. **Interacción**
   - ✅ URL params mantienen nivel/canales.
   - 🔜 Global store para estados más complejos (periodo, municipio seleccionado).

### Entregable 3
- ✅ Checklist actualizado en esta vista.
- 🔜 Definir wireframes para mapas/municipios antes de implementarlos.

---

## 4. Implementación Iterativa

1. **Sprint 1: Datos**
   - ✅ Migraciones y endpoints operativos (logs en FastAPI).

2. **Sprint 2: Wrapper + filtros básicos**
   - ✅ Wrapper y filtros (nivel/canales).
   - ✅ KPIs + gráfico conectados a datos reales.

3. **Sprint 3: Mapas + tablas**
   - 🟡 GeoJSON + Leaflet operativo para país/estado; siguiente iteración: nivel municipio/LADA, estilos/tooltip avanzados.
   - ✅ Tabla detalle básica (falta paginación, variaciones vs periodo y métricas adicionales).

4. **Sprint 4: Pulido**
   - 🔜 Skeletons, cache y tests de performance.
   - 🔜 QA en staging con dataset real.

---

## 5. Documentación y QA

- 🔜 Actualizar `docs/mapa_de_conversion.md` con flujos reales.
- 🔜 Guías de interpretación (etapas, canal, LADA).
- 🔜 Plan de pruebas aún pendiente.

---

## Plan Detallado para la vista jerárquica (pendiente)

### 5.1 SQL / Supabase
- ➕ Versionar `panel_leads_geo_resumen` (o crear `panel_leads_geo_resumen_ext`) para devolver, por ubicación y canal, los totales segmentados por `etapa_codigo`, manteniendo las agregaciones actuales.
- ➕ Extender `panel_visitantes_geo_resumen` para incluir totales por canal (`webchat_total`, `webchat_sin_chat`, `webchat_con_chat`, `whatsapp_total`, `voz_total`) y un indicador `has_data` por polígono.
- ➕ Incorporar filtros opcionales de etapas (`p_etapas` como array de códigos/categorías) en los RPC geo para que el backend pueda limitar resultados a etapas específicas.
- ⚠️ Evaluar materializar las agregaciones si las consultas en producción superan los tiempos aceptables (benchmark en staging).

### 5.2 Backend FastAPI (`demografia_service`)
- Actualizar `fetch_leads_resumen` para normalizar las etapas en: `sin_conversacion`, `captado`, `post_captado` (etapas con orden > captado), `ganadas`, `perdidas`.
- Ajustar `fetch_visitantes_resumen` al nuevo contrato y garantizar totales consistentes por canal.
- Reescribir `build_map_dataset` para:
  - Publicar `visitas_total`, `webchat_total`, `webchat_sin_conversacion`, `webchat_captado`, `webchat_post_captado`, `whatsapp_total`, `voz_total`.
  - Filtrar polígonos sin datos y adjuntar metadatos de navegación (`next_level`).
- Actualizar `/api/kpis/demografia/mapa` con la nueva estructura y controles de drill-down (país → estado → municipio).
- Añadir soporte para filtros de etapas en los endpoints (`?etapas=`), propagando el parámetro a Supabase y conservando los totales globales para referencia.

### 5.3 Frontend (`panel`)
- Actualizar tipos en `@/lib/mapa-conversion/api` y propagar el nuevo contrato a la página y tabla.
- Reconfigurar `LocationComparisonChart`:
  - Pintar únicamente polígonos con datos (`visitas_total > 0`).
  - Mostrar un tooltip con la jerarquía solicitada (totales, webchat con subniveles, whatsapp, voz).
  - Manejar eventos de clic para cambiar de nivel y resaltar la selección.
  - Incorporar breadcrumbs/controles que permitan volver al nivel superior y filtrar estados/municipios sin datos.
- Ajustar `page.tsx` para soportar los parámetros `nivel` y `estado`, estados de carga/skeleton y mensaje vacío en el Wrapper.
- Extender la tabla con columnas derivadas (ej. totales por canal, etapa principal post captado).
- Añadir controles de filtrado por etapa (chips/select multi-etapa) sincronizados con la URL y el backend.

### 5.4 QA y documentación
- Validar la clasificación `captado` vs `post_captado` con el dump `postgres_20251109`.
- Documentar el contrato final en `docs/mapa_de_conversion.md` con ejemplos de los tres niveles.
- Preparar pruebas unitarias ligeras para `build_map_dataset` y plan de QA manual (navegación jerárquica y consistencia de totales).

---

### Próximos pasos inmediatos
1. Integrar mapa GeoJSON (nivel país/estado) y preparar capa municipio/LADA.
2. Extender tabla y KPIs con variaciones vs periodo anterior.
3. Completar documentación/QA y definir plan de lanzamiento con stakeholders.

`Wrapper` será el núcleo de la implementación: sin él no se comienza ningún submódulo.
