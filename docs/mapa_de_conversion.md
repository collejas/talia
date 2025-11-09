# Mapa de Conversión

Este documento resume los hallazgos de las dos revisiones recientes sobre la métrica de “Sin conversación” y la geolocalización de los canales de atención. Sirve como referencia técnica para mantener la vista del panel alineada al backend y a las fuentes de datos.

---

## Métrica “Sin conversación”

- El contador de la tarjeta “Sin conversación” proviene del RPC `embudo_visitantes_contador`, que calcula sesiones de **webchat** cerradas sin mensajes entrantes.  
- El frontend lo consume con `callSupabaseRpc("embudo_visitantes_contador", { body: { p_closed_after: null, p_closed_before: null } })` para evitar ambigüedad entre las dos variantes de la función.  
- El resultado se expone como `visitantesSinChat` y se formatea con `Intl.NumberFormat("es-MX")`, garantizando que la representación coincida entre SSR (Next.js) y el navegador, lo que resuelve el error de hidratación (React #418).  
- En el widget de landing (`landing/src/assets/js/modules/chat.js`) cada visitante ejecuta `/visit` y `/close`, alimentando `webchat_session_closures` y `webchat_visitantes`. El backend (`backend/app/channels/webchat/service.py`) complementa la información con geolocalización IP y metadata del cliente antes de invocar `record_webchat_visitante`.

## Geolocalización por canal

### WhatsApp

- `backend/app/services/leads_geo.py` usa catálogos en `backend/app/data/ladas` para inferir la **LADA** desde números E.164 (+52).  
- La función `infer_contact_location` normaliza `cve_ent`, `cve_mun` y `cvegeo` combinando datos de contacto, LADA inferida y metadatos de identidades.  
- Las migraciones `panel_leads_geo_base`, `panel_leads_geo_estados` y `panel_leads_geo_municipios` (en `supabase/migrations/20251105_160000_panel_leads_geo.sql`) agregan los leads por estado y municipio.  
- El backend expone estos datos vía `fetch_leads_states`, `fetch_leads_municipios` y rutas `/api/kpis/leads/estados` o `/api/kpis/leads/estados/{estado}/municipios`, sumando opcionalmente visitantes.

### Webchat

- Las visitas sin chat se persisten en `webchat_visitantes` junto con IP, device y claves INEGI. El RPC `panel_visitantes_sin_chat_base` y sus variantes (`_estados`, `_municipios`) consolidan esta información.  
- El servicio `geolocation.lookup_ip` (HTTP externa configurable) entrega `city`, `region`, `country`, etc., y la lógica en `webchat/service.py` reutiliza `leads_geo.location_from_geo_metadata` para derivar estado y municipio.  
- Los endpoints `/api/kpis/visitantes/estados` y `/api/kpis/visitantes/estados/{estado}/municipios` ofrecen la misma estructura que los leads pero enfocada en visitantes de webchat.

## GeoJSON y mapas

- `backend/app/services/leads_geo.py` también sirve los GeoJSON necesarios:  
  - `/api/kpis/leads/geo/estados` → estados de México  
  - `/api/kpis/leads/geo/municipios/{estado}` → municipios del estado solicitado  
  - `/api/kpis/leads/geo/paises` → países (para visitantes internacionales)  
- Estas rutas no requieren token; los endpoints de métricas sí exigen enviar `Authorization: Bearer <token>` con el JWT del panel.

---

### Referencias clave

- Frontend: `frontend/panel/src/lib/embudo/data.ts`, `frontend/panel/src/components/embudo/board-client.tsx`  
- Backend (geolocalización y métricas): `backend/app/services/leads_geo.py`, `backend/app/channels/webchat/service.py`, `backend/app/services/storage.py`  
- Supabase / SQL: `backups/postgres_20251109_122803_schema.sql`, `supabase/migrations/20251105_160000_panel_leads_geo.sql`, `supabase/migrations/20251112_134500_visitantes_geo_enrich.sql`  
- Widget webchat: `landing/src/assets/js/modules/chat.js`  
- Datos auxiliares: `backend/app/data/ladas`, `backend/app/data/geo`

Mantén este documento actualizado cuando la vista incorpore nuevas métricas o cambie sus fuentes para asegurar consistencia entre frontend, backend y base de datos.



# • Ideas KPI

  - Visitantes sin Chat (30 días) – total del RPC embudo_visitantes_contador; usa la cifra global y tendencia vs periodo anterior.
  - Conversaciones WhatsApp geolocalizadas – conteo de panel_leads_geo_estados filtrado por canales=whatsapp, destacando % con cvegeo
    válido.
  - Conversión Webchat → Lead – ratio entre visitantes con chat (total_visitas de panel_webchat_visitas_detalle) y leads creados, para
    ver si el funnel mejora.
  - Top Estado/Municipio – estado con más visitantes/whatsapp según los RPC panel_leads_geo_* o panel_visitantes_sin_chat_*, mostrando
    nombre y total.