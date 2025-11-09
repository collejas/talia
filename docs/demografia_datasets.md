# Demografía Omnicanal – Mapa de Conversión

## 1. Fuentes de datos actuales

| Canal      | Tabla / RPC                           | Claves geo disponibles                                | Observaciones clave                                |
|------------|----------------------------------------|--------------------------------------------------------|----------------------------------------------------|
| Webchat    | `webchat_visitantes`                   | `geo` JSON (país, estado, municipio, ciudad), `cvegeo` | Se llena vía `record_webchat_visitante`; depende de IP + metadata del navegador. |
| Webchat    | `panel_visitantes_sin_chat_base/estados/municipios` | País (derivado), estado (`cve_ent`), municipio (`cvegeo`/`nom_mun`) | Agrega visitas sin chat; falta conteo de chats con interacción. |
| Webchat    | `panel_webchat_visitas_detalle`        | `country_code`, `state_name`, `city_name`             | Incluye visitas con chat y métricas de conversación; no está agregado a nivel país/estado. |
| WhatsApp/Voz | `panel_leads_geo_base`               | `cve_ent`, `cve_mun`, `cvegeo` (cuando se tienen metadatos) | Usa triggers para inferir LADA → estado; municipio puede faltar. |
| WhatsApp/Voz | `panel_leads_geo_estados/municipios` | Estado, municipio                                     | Resumen por canal (solo totales); no incluye etapas del lead. |
| Leads (etapas) | `panel_leads_resumen`, `lead_tarjetas` | Etapa (`lead_etapas`)                                 | Necesitamos cruzarlo con la capa geográfica resultante. |

## 2. Brechas detectadas

1. **Etapas por canal y ubicación**  
   - Ningún RPC actual devuelve la distribución de etapas (abierto, negociación, ganado, perdido) junto al agregado geográfico.
   - Requiere extender `panel_leads_geo_*` o crear un nuevo view/RPC que incluya `le.categoria` y la etapa actual.

2. **Visitantes webchat con chat**  
   - `panel_visitantes_sin_chat_*` cubre solo sesiones sin interacción.  
   - Necesitamos agregar reportes que mezclen ambos estados (con chat / sin chat) y los relacionen con leads creados.

3. **Cobertura por país**  
   - Los RPC devuelven solo estados/municipios mexicanos; para visitantes internacionales se pierde la dimensión país.
   - Hace falta una capa de agregación global (`panel_visitantes_geo_paises`, `panel_leads_geo_paises`).

4. **Voz**  
   - Se trata como un canal más en `lead_tarjetas`, pero no hay una vista que resuma LADA país/localidad; necesitamos validar si existe metadata suficiente.

## 3. Objetivos de datos por nivel

| Nivel      | KPI Webchat                                       | KPI WhatsApp/Voz                                    | Datos comunes               |
|------------|----------------------------------------------------|-----------------------------------------------------|-----------------------------|
| País       | Visitas totales, visitas sin chat, chats con interacción, leads asociados | Leads totales, distribución por etapa, conversaciones iniciadas | Tendencia vs periodo anterior, share por canal |
| Estado     | Igual que país + top municipios/ciudades           | Leads por etapa, penetración vs visitantes          | % participación por canal   |
| Municipio / Localidad | Visitas con/sin chat, leads webchat generados | Leads WhatsApp/Voz (por etapa), LADA              | Histórico (últimas 4 semanas) |

## 4. Supabase – funciones necesarias

1. **`panel_visitantes_geo_resumen` (nuevo)**  
   - Parámetros: `p_nivel` (`pais`/`estado`/`municipio`), `p_from`, `p_to`.  
   - Resultado: filas con ubicación, totales `sin_chat`, `con_chat`, `total_visitas`.  
   - Fuentes: `panel_webchat_visitas_detalle` + `panel_visitantes_sin_chat_base`.

2. **`panel_leads_geo_resumen` (nuevo)**  
   - Parámetros: `p_nivel`, `p_canales`, `p_from`, `p_to`.  
   - Resultado: totales por etapa (`abierta`, `negociacion`, `ganada`, `perdida`), canal y ubicación.  
   - Fuentes: `panel_leads_geo_base` + `lead_tarjetas`.

3. **`panel_leads_geo_paises` (nuevo)**  
   - Permitir agrupar por país (deducido de `contacto_datos` o `identidades`) para mercados fuera de México.

## 5. Backend (FastAPI) – endpoints propuestos

| Endpoint                                      | Descripción                                           |
|-----------------------------------------------|-------------------------------------------------------|
| `GET /api/kpis/demografia/resumen`            | Devuelve KPIs globales por canal (visitantes vs leads). |
| `GET /api/kpis/demografia/mapa`               | Respuesta estructurada para el mapa (GeoJSON + datos por nivel). |
| `GET /api/kpis/demografia/detalle`            | Tabla interactiva (estado/municipio) con filtros de canal y etapa. |
| `GET /api/kpis/demografia/historico`          | Series temporales (semanas) para comparativos entre canales. |

Todos estos endpoints deberán respetar el patrón de `Wrapper`: un único fetch en el server que alimente los componentes React.

## 6. Siguiente paso inmediato

1. Validar esta matriz con el equipo de datos (confirmar tabla/columnas y performance).  
2. Definir los SQL definitivos para las funciones #1-3.  
3. Prototipar el contrato JSON que entregará `/api/kpis/demografia/mapa`.  

Con eso aprobado, podemos crear las migraciones y el Wrapper inicial.***
