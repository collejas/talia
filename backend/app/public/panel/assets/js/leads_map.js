import { $, fetchJSON, fetchJSONWithAuth } from './common.js';

const LEAFLET_CSS =
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS =
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';

const SCALE_OPTIONS = ['quantile', 'equal', 'log'];

const CHANNEL_OPTIONS = {
  whatsapp: 'WhatsApp',
  webchat: 'Webchat',
  visitantes: 'Visitantes (sin chat)',
  todos: 'Todos',
};

const PALETTES = {
  dusk: ['#fde68a', '#f59e0b', '#f97316', '#ea580c', '#c026d3'],
  viridis: ['#e7e419', '#7ad151', '#22a884', '#2a788e', '#414487'],
  blues: ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8'],
};

const NUMBER_FORMAT = new Intl.NumberFormat('es-MX');
const FALLBACK_COLOR = 'rgba(255,255,255,0.15)';
const MAP_MIN_ZOOM_MX = 3;
const MAP_MIN_ZOOM_WORLD = 1;
const MAP_MAX_ZOOM = 12;

const controls = {
  resetButton: null,
  channelSelect: null,
  modeSelect: null,
};

let leafletPromise = null;

function loadStylesheet(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[data-lazy="${url}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.lazy = url;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    document.head.appendChild(link);
  });
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lazy="${url}"]`);
    if (existing) {
      if (window.L) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () =>
          reject(new Error(`No se pudo cargar ${url}`)),
        );
      }
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.defer = true;
    script.dataset.lazy = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    document.head.appendChild(script);
  });
}

async function ensureLeaflet() {
  if (window.L) {
    return window.L;
  }
  if (!leafletPromise) {
    leafletPromise = Promise.all([loadStylesheet(LEAFLET_CSS), loadScript(LEAFLET_JS)]).then(
      () => window.L,
    );
    leafletPromise.catch(() => {
      leafletPromise = null;
    });
  }
  return leafletPromise;
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return '0';
  }
  return NUMBER_FORMAT.format(Number(value));
}

function dedupeSorted(values) {
  const unique = [];
  for (const value of values) {
    if (!unique.length || unique[unique.length - 1] !== value) {
      unique.push(value);
    }
  }
  return unique;
}

function computeQuantiles(values, buckets) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const thresholds = [];
  for (let i = 1; i <= buckets; i += 1) {
    const position = Math.ceil((i / buckets) * sorted.length) - 1;
    thresholds.push(sorted[Math.max(0, Math.min(position, sorted.length - 1))]);
  }
  return dedupeSorted(thresholds);
}

function computeEqualIntervals(values, buckets) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [max];
  }
  const thresholds = [];
  const step = (max - min) / buckets;
  for (let i = 1; i <= buckets; i += 1) {
    thresholds.push(Math.round(min + step * i));
  }
  return dedupeSorted(thresholds);
}

function computeLogScale(values, buckets) {
  const positives = values.filter((value) => value > 0);
  if (!positives.length) return [];
  const min = Math.min(...positives);
  const max = Math.max(...positives);
  if (min === max) {
    return [max];
  }
  const start = Math.log10(min);
  const end = Math.log10(max);
  const step = (end - start) / buckets;
  const thresholds = [];
  for (let i = 1; i <= buckets; i += 1) {
    const value = Math.pow(10, start + step * i);
    thresholds.push(Math.round(value));
  }
  return dedupeSorted(thresholds);
}

function buildScale(values, paletteName, mode) {
  const palette = PALETTES[paletteName] || PALETTES.dusk;
  const validValues = (values || []).filter((value) => value != null && value > 0);

  let thresholds = [];
  if (!validValues.length) {
    thresholds = [];
  } else if (mode === 'log') {
    thresholds = computeLogScale(validValues, palette.length);
  } else if (mode === 'equal') {
    thresholds = computeEqualIntervals(validValues, palette.length);
  } else {
    thresholds = computeQuantiles(validValues, palette.length);
  }

  if (thresholds.length > palette.length) {
    thresholds = thresholds.slice(0, palette.length);
  }

  if (!thresholds.length && validValues.length) {
    thresholds = [Math.max(...validValues)];
  }

  const colors = palette.slice(-thresholds.length);

  const colorFor = (value) => {
    if (value == null || value <= 0) {
      return FALLBACK_COLOR;
    }
    for (let i = 0; i < thresholds.length; i += 1) {
      if (value <= thresholds[i]) {
        return colors[i];
      }
    }
    return colors[colors.length - 1];
  };

  const legendItems = [
    { label: 'Sin datos', color: FALLBACK_COLOR },
  ];

  for (let i = 0; i < thresholds.length; i += 1) {
    const max = thresholds[i];
    const min = i === 0 ? 1 : thresholds[i - 1] + 1;
    legendItems.push({
      label: `${formatNumber(min)} – ${formatNumber(max)}`,
      color: colors[i],
    });
  }

  return { colorFor, legendItems };
}

const state = {
  initialized: false,
  map: null,
  layer: null,
  view: 'states',
  selectedState: null,
  scale: 'quantile',
  palette: 'dusk',
  channelKey: 'todos',
  prevChannelKey: 'todos',
  mode: 'mx',
  statesCache: new Map(),
  municipalityCache: new Map(),
  worldCache: new Map(),
  tileLayer: null,
  currentCountry: null,
  parentLevel: null,
  worldSummaryBase: '',
  applyMode: null,
};

function getRangeQuery() {
  const rangeSelect = $('dashboard-range');
  const value = rangeSelect ? rangeSelect.value : null;
  return value ? `?rango=${encodeURIComponent(value)}` : '';
}

function getChannelParam(key) {
  if (key === 'todos') {
    return 'whatsapp,webchat,visitantes';
  }
  if (key === 'visitantes') {
    return 'visitantes';
  }
  return key || 'whatsapp';
}

function channelLabel(key) {
  return CHANNEL_OPTIONS[key] || 'Leads';
}

function channelName(key) {
  if (CHANNEL_OPTIONS[key] && key !== 'todos') {
    return CHANNEL_OPTIONS[key];
  }
  if (!key) return '—';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function buildTooltip(label, total, breakdown) {
  const isVisitantes = state.channelKey === 'visitantes';
  const isTodos = state.channelKey === 'todos';
  const singular = isVisitantes ? 'visitante' : isTodos ? 'registro' : 'lead';
  const plural = isVisitantes ? 'visitantes' : isTodos ? 'registros' : 'leads';
  const totalLabel = `${formatNumber(total)} ${total === 1 ? singular : plural}`;
  const entries = Object.entries(breakdown || {}).filter(([, value]) => Number(value) > 0);
  if (!entries.length) {
    return `${label}: ${totalLabel}`;
  }
  const lines = entries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([channel, value]) => `${channelName(channel)}: ${formatNumber(value)}`)
    .join('<br>');
  return `<strong>${label}</strong><br>${lines}<br><span>Total: ${totalLabel}</span>`;
}

function setLoading(isLoading) {
  const el = $('leads-map-loading');
  if (el) {
    el.style.display = isLoading ? 'flex' : 'none';
  }
}

function setError(visible, message) {
  const el = $('leads-map-error');
  if (!el) return;
  if (visible) {
    el.hidden = false;
    if (message) el.textContent = message;
  } else {
    el.hidden = true;
  }
}

function updateSummary(text) {
  const el = $('leads-map-summary');
  if (el) {
    el.textContent = text;
  }
}

function updateLegend(items) {
  const container = $('leads-map-legend');
  if (!container) return;
  if (!items || !items.length) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  const rows = items
    .map(
      (item) => `
        <div class="map-legend-item">
          <span class="map-legend-swatch" style="background:${item.color};"></span>
          <span class="map-legend-range">${item.label}</span>
        </div>
      `,
    )
    .join('');
  const legendTitle =
    state.channelKey === 'visitantes'
      ? 'Visitantes'
      : state.channelKey === 'todos'
        ? 'Leads y visitantes'
        : 'Leads';
  container.innerHTML = `
    <div class="map-legend-title">${legendTitle}</div>
    <div class="map-legend-scale">${rows}</div>
  `;
  container.hidden = false;
}

function resetLayer() {
  if (state.layer && state.map) {
    state.map.removeLayer(state.layer);
    state.layer = null;
  }
}

function keyForFeature(feature, property, pad) {
  if (!feature || !feature.properties) return null;
  const raw = feature.properties[property];
  if (raw == null) return null;
  const str = String(raw);
  if (!pad) return str;
  return str.padStart(pad, '0');
}

function attachFeatureInteractions(layer, tooltip, onClick) {
  layer.bindTooltip(tooltip, { sticky: true });
  layer.on('mouseover', () => {
    layer.setStyle({ weight: 2, color: 'rgba(255,255,255,0.85)', fillOpacity: 0.85 });
  });
  layer.on('mouseout', () => {
    layer.setStyle({ weight: 1, color: 'rgba(255,255,255,0.3)', fillOpacity: 0.7 });
  });
  if (onClick) {
    layer.on('click', onClick);
  }
}

async function getStatesData(channelParam) {
  const cacheKey = channelParam;
  if (!state.statesCache.has(cacheKey)) {
    const promise = (async () => {
      const metricsPromise =
        channelParam === 'visitantes'
          ? fetchJSONWithAuth('/api/kpis/visitantes/estados')
          : fetchJSONWithAuth(
              `/api/kpis/leads/estados?canales=${encodeURIComponent(channelParam)}`,
            );
      const [geo, metrics] = await Promise.all([
        fetchJSON('/api/kpis/leads/geo/estados'),
        metricsPromise,
      ]);
      if (!geo.ok || !geo.json?.geojson) {
        throw new Error('geo_states_failed');
      }
      if (!metrics.ok || !metrics.json?.ok) {
        throw new Error('metrics_states_failed');
      }
      return { geojson: geo.json.geojson, metrics: metrics.json };
    })();
    promise.catch(() => {
      state.statesCache.delete(cacheKey);
    });
    state.statesCache.set(cacheKey, promise);
  }
  return state.statesCache.get(cacheKey);
}

async function getMunicipalityData(channelParam, stateCode) {
  const code = String(stateCode).padStart(2, '0');
  const cacheKey = `${channelParam}:${code}`;
  if (!state.municipalityCache.has(cacheKey)) {
    const promise = (async () => {
      const metricsPromise =
        channelParam === 'visitantes'
          ? fetchJSONWithAuth(`/api/kpis/visitantes/estados/${code}/municipios`)
          : fetchJSONWithAuth(
              `/api/kpis/leads/estados/${code}/municipios?canales=${encodeURIComponent(
                channelParam,
              )}`,
            );
      const [geo, metrics] = await Promise.all([
        fetchJSON(`/api/kpis/leads/geo/municipios/${code}`),
        metricsPromise,
      ]);
      if (!geo.ok || !geo.json?.geojson) {
        throw new Error('geo_muni_failed');
      }
      if (!metrics.ok || !metrics.json?.ok) {
        throw new Error('metrics_muni_failed');
      }
      return { geojson: geo.json.geojson, metrics: metrics.json };
    })();
    promise.catch(() => {
      state.municipalityCache.delete(cacheKey);
    });
    state.municipalityCache.set(cacheKey, promise);
  }
  return state.municipalityCache.get(cacheKey);
}

async function getWorldResources() {
  const rangeQuery = getRangeQuery();
  const cacheKey = rangeQuery || '__default__';
  if (!state.worldCache.has(cacheKey)) {
    const promise = (async () => {
      const [geo, metrics] = await Promise.all([
        fetchJSON('/api/kpis/leads/geo/paises'),
        fetchJSONWithAuth(`/api/kpis/visitantes/paises${rangeQuery}`),
      ]);
      if (!geo.ok || !geo.json?.geojson) {
        throw new Error('geo_world_failed');
      }
      if (!metrics.ok || !metrics.json?.ok) {
        throw new Error('metrics_world_failed');
      }
      return { geojson: geo.json.geojson, metrics: metrics.json };
    })();
    promise.catch(() => {
      state.worldCache.delete(cacheKey);
    });
    state.worldCache.set(cacheKey, promise);
  }
  return state.worldCache.get(cacheKey);
}

function drawPolygons({ geojson, metrics, keyProperty, pad, viewMode, onFeatureClick }) {
  if (!state.map) return;
  const valuesByKey = new Map();
  const labelsByKey = new Map();
  const totals = [];
  const channelsByKey = new Map();

  for (const item of metrics.items || []) {
    let key = null;
    let label = null;
    if (viewMode === 'states') {
      key = String(item.cve_ent).padStart(2, '0');
      label = item.nombre || key;
    } else if (viewMode === 'municipalities') {
      key = String(item.cvegeo).padStart(5, '0');
      label = item.nombre || item.cve_mun || key;
    } else if (viewMode === 'countries') {
      const countryCode = item.country_code ? String(item.country_code).toUpperCase() : '';
      if (!countryCode || countryCode === 'UNK') {
        continue;
      }
      key = countryCode;
      label = item.nombre || countryCode;
    }
    if (!key) continue;
    const totalValue = Number(item.total || 0);
    valuesByKey.set(key, totalValue);
    labelsByKey.set(key, label || key);
    const breakdown =
      item.por_canal && typeof item.por_canal === 'object' ? item.por_canal : { visitantes: totalValue };
    channelsByKey.set(key, breakdown);
    totals.push(totalValue);
  }

  const { colorFor, legendItems } = buildScale(totals, state.palette, state.scale);
  updateLegend(legendItems);

  resetLayer();
  state.layer = window.L.geoJSON(geojson, {
    style: (feature) => {
      const key = keyForFeature(feature, keyProperty, pad);
      const total = key ? valuesByKey.get(key) || 0 : 0;
      return {
        color: 'rgba(255,255,255,0.3)',
        weight: 1,
        fillColor: colorFor(total),
        fillOpacity: total > 0 ? 0.7 : 0.4,
      };
    },
    onEachFeature: (feature, layer) => {
      const key = keyForFeature(feature, keyProperty, pad);
      const total = key ? valuesByKey.get(key) || 0 : 0;
      const label = key ? labelsByKey.get(key) || key : 'Sin nombre';
      const breakdown = key ? channelsByKey.get(key) || {} : {};
      const tooltip = buildTooltip(label, total, breakdown);
      attachFeatureInteractions(layer, tooltip, () => {
        if (onFeatureClick && key) {
          onFeatureClick({ code: key, name: label, total });
        }
      });
    },
  });

  state.layer.addTo(state.map);
  const bounds = state.layer.getBounds();
  if (bounds.isValid()) {
    const padding = viewMode === 'states' ? [40, 40] : [30, 30];
    state.map.fitBounds(bounds, { padding });
  }
}

function setMinZoom(minZoom) {
  if (state.map) {
    state.map.setMinZoom(minZoom);
  }
  if (state.tileLayer && typeof state.tileLayer.setMinZoom === 'function') {
    state.tileLayer.setMinZoom(minZoom);
  } else if (state.tileLayer) {
    state.tileLayer.options.minZoom = minZoom;
  }
}

async function renderStates() {
  state.view = 'states';
  if (state.mode === 'world') {
    await renderWorld();
    return;
  }
  setMinZoom(MAP_MIN_ZOOM_MX);
  setLoading(true);
  setError(false);
  try {
    const channelParam = getChannelParam(state.channelKey);
    const resources = await getStatesData(channelParam);
    drawPolygons({
      geojson: resources.geojson,
      metrics: resources.metrics,
      keyProperty: 'cve_ent',
      pad: 2,
      viewMode: 'states',
      onFeatureClick: (data) => {
        state.selectedState = { code: data.code, name: data.name };
        state.view = 'municipalities';
        $('leads-map-reset')?.removeAttribute('disabled');
        void renderMunicipalities(data.code);
      },
    });
    const ubicados = formatNumber(resources.metrics.total_ubicados || 0);
    const totalValue = Number(resources.metrics.total_contactos || 0);
    const sinValue = Number(resources.metrics.sin_ubicacion || 0);
    const total = formatNumber(totalValue);
    const sinUbicacion = formatNumber(sinValue);
    const channelName = channelLabel(state.channelKey);
    const isVisitantes = state.channelKey === 'visitantes';
    const isTodos = state.channelKey === 'todos';
    const singular = isVisitantes ? 'visitante' : isTodos ? 'registro' : 'lead';
    const plural = isVisitantes ? 'visitantes' : isTodos ? 'registros' : 'leads';
    const ubicadosLabel = isVisitantes
      ? 'Visitantes ubicados'
      : isTodos
        ? 'Registros ubicados'
        : 'Leads ubicados';
    const sinLabel = isVisitantes
      ? 'Visitantes sin ubicación'
      : isTodos
        ? 'Registros sin ubicación'
        : 'Sin ubicación';
    updateSummary(
      `${channelName}: Total ${total} ${totalValue === 1 ? singular : plural}. ${ubicadosLabel}: ${ubicados}. ${sinLabel}: ${sinUbicacion}.`,
    );
  } catch (error) {
    console.error('[leads-map] estados', error);
    setError(true, 'No fue posible cargar los estados.');
  } finally {
    const resetBtn = controls.resetButton;
    if (resetBtn) {
      if (state.parentLevel === 'world') {
        resetBtn.removeAttribute('disabled');
      } else if (!state.selectedState) {
        resetBtn.setAttribute('disabled', 'true');
      }
    }
    setLoading(false);
  }
}

async function renderWorld() {
  state.view = 'countries';
  state.selectedState = null;
  state.currentCountry = null;
  if (state.mode === 'world') {
    state.parentLevel = null;
  }
  setMinZoom(MAP_MIN_ZOOM_WORLD);
  setLoading(true);
  setError(false);
  try {
    const resources = await getWorldResources();
    const items = Array.isArray(resources.metrics.items) ? resources.metrics.items : [];
    const enrichedItems = items.map((item) => ({
      country_code: item.country_code ? String(item.country_code).toUpperCase() : 'UNK',
      nombre: item.nombre || item.country_code || 'Desconocido',
      total: Number(item.total || 0),
      por_canal: { visitantes: Number(item.total || 0) },
    }));
    const totals = resources.metrics.totals || {};
    const totalValue = Number(totals.total || 0);
    const ubicadosValue = Number(totals.ubicados || 0);
    const sinPaisValue = Number(totals.sin_pais || 0);
    const countriesWithData = enrichedItems.filter(
      (item) => item.country_code && item.country_code !== 'UNK' && item.total > 0,
    ).length;
    const summaryBase = `Visitantes globales: Total ${formatNumber(
      totalValue,
    )}. Países con datos: ${formatNumber(
      countriesWithData,
    )}. Con país identificado: ${formatNumber(
      ubicadosValue,
    )}. Sin país: ${formatNumber(sinPaisValue)}.`;
    state.worldSummaryBase = summaryBase;
    const handleCountryClick = (data) => {
      if (!data || !data.code) return;
      const iso = String(data.code).toUpperCase();
      const total = Number(data.total || 0);
      const name = data.name || iso;
      if (iso === 'MX') {
        state.currentCountry = { code: iso, name, total };
        state.parentLevel = 'world';
        if (controls.modeSelect) {
          controls.modeSelect.value = 'mx';
        }
        state.applyMode?.('mx', { fromWorld: true, country: state.currentCountry });
        return;
      }
      updateSummary(`${summaryBase} ${name}: ${formatNumber(total)} visitantes.`);
    };
    drawPolygons({
      geojson: resources.geojson,
      metrics: { items: enrichedItems },
      keyProperty: 'ISO_A2',
      pad: 0,
      viewMode: 'countries',
      onFeatureClick: handleCountryClick,
    });
    updateSummary(summaryBase);
    if (state.map) {
      const bounds = state.layer?.getBounds();
      if (bounds && bounds.isValid()) {
        state.map.fitBounds(bounds, { padding: [30, 30] });
      } else {
        state.map.fitWorld({ animate: false });
      }
    }
  } catch (error) {
    console.error('[leads-map] world', error);
    setError(true, 'No fue posible cargar los países.');
  } finally {
    const resetBtn = controls.resetButton;
    if (resetBtn) {
      resetBtn.setAttribute('disabled', 'true');
    }
    setLoading(false);
  }
}

async function renderMunicipalities(stateCode) {
  state.view = 'municipalities';
  if (state.mode === 'world') {
    return;
  }
  setLoading(true);
  setError(false);
  const code = String(stateCode).padStart(2, '0');
  try {
    const channelParam = getChannelParam(state.channelKey);
    const resources = await getMunicipalityData(channelParam, code);
    drawPolygons({
      geojson: resources.geojson,
      metrics: resources.metrics,
      keyProperty: 'cvegeo',
      pad: 5,
      viewMode: 'municipalities',
      onFeatureClick: null,
    });
    const ubicadosValue = Number(resources.metrics.total_ubicados || 0);
    const totalValue = Number(resources.metrics.total_contactos || 0);
    const sinValue = Number(resources.metrics.sin_ubicacion || 0);
    const ubicados = formatNumber(ubicadosValue);
    const total = formatNumber(totalValue);
    const sinUbicacion = formatNumber(sinValue);
    const nombre = resources.metrics.estado?.nombre || `Estado ${code}`;
    const channelName = channelLabel(state.channelKey);
    const isVisitantes = state.channelKey === 'visitantes';
    const isTodos = state.channelKey === 'todos';
    const singular = isVisitantes ? 'visitante' : isTodos ? 'registro' : 'lead';
    const plural = isVisitantes ? 'visitantes' : isTodos ? 'registros' : 'leads';
    const ubicadosLabel = isVisitantes
      ? 'Visitantes ubicados'
      : isTodos
        ? 'Registros ubicados'
        : 'Leads ubicados';
    const sinLabel = isVisitantes
      ? 'Visitantes sin ubicación'
      : isTodos
        ? 'Registros sin ubicación'
        : 'Sin ubicación';
    updateSummary(
      `${channelName} · ${nombre}: ${ubicados} ${ubicadosValue === 1 ? singular : plural} ubicados de ${total}. ${sinLabel}: ${sinUbicacion}.`,
    );
  } catch (error) {
    console.error('[leads-map] municipios', error);
    setError(true, 'No se pudieron cargar los municipios seleccionados.');
  } finally {
    const resetBtn = controls.resetButton;
    if (resetBtn) {
      resetBtn.removeAttribute('disabled');
    }
    setLoading(false);
  }
}

function handlePaletteChange(palette) {
  if (!PALETTES[palette]) return;
  state.palette = palette;
  if (!state.initialized) return;
  if (state.mode === 'world') {
    void renderWorld();
    return;
  }
  if (state.view === 'states') {
    void renderStates();
  } else if (state.selectedState) {
    void renderMunicipalities(state.selectedState.code);
  }
}

function handleScaleChange(scale) {
  if (!SCALE_OPTIONS.includes(scale)) return;
  state.scale = scale;
  if (!state.initialized) return;
  if (state.mode === 'world') {
    void renderWorld();
    return;
  }
  if (state.view === 'states') {
    void renderStates();
  } else if (state.selectedState) {
    void renderMunicipalities(state.selectedState.code);
  }
}

async function initializeMap() {
  try {
    const L = await ensureLeaflet();
    if (!L) throw new Error('Leaflet no disponible');
    const container = $('leads-map');
    if (!container) return;
    container.setAttribute('aria-hidden', 'false');
    state.map = L.map(container, {
      zoomControl: true,
      attributionControl: false,
    });

    state.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: MAP_MAX_ZOOM,
      minZoom: MAP_MIN_ZOOM_MX,
      attribution: '&copy; OpenStreetMap',
    }).addTo(state.map);

    state.map.setView([23.6345, -102.5528], 4.6);
    window.setTimeout(() => state.map?.invalidateSize(), 120);
    await renderStates();
    state.initialized = true;
  } catch (error) {
    console.error('[leads-map] init', error);
    setError(true, 'No fue posible inicializar el mapa.');
  }
}

export function setupLeadsMap() {
  const wrapper = $('leads-map-wrapper');
  if (!wrapper || wrapper.dataset.initialized === 'true') {
    return;
  }
  wrapper.dataset.initialized = 'true';

  const paletteSelect = $('leads-map-palette');
  const scaleSelect = $('leads-map-scale');
  const resetButton = $('leads-map-reset');
  const channelSelect = $('leads-map-channel');
  const modeSelect = $('leads-map-mode');
  const rangeSelect = $('dashboard-range');

  controls.resetButton = resetButton;
  controls.channelSelect = channelSelect;
  controls.modeSelect = modeSelect;

  const scheduleRender = () => {
    if (!state.initialized) {
      return;
    }
    if (state.mode === 'world') {
      void renderWorld();
      return;
    }
    if (state.view === 'municipalities' && state.selectedState) {
      void renderMunicipalities(state.selectedState.code);
      return;
    }
    void renderStates();
  };

  const applyMode = (value, options = {}) => {
    const nextMode = value === 'world' ? 'world' : 'mx';
    const { fromWorld = false, country = null, force = false } = options;
    const previousMode = state.mode;
    if (previousMode === nextMode && !force) {
      return;
    }
    state.mode = nextMode;
    state.selectedState = null;
    state.view = nextMode === 'world' ? 'countries' : 'states';
    if (modeSelect) {
      modeSelect.value = nextMode;
    }
    if (nextMode === 'world') {
      state.parentLevel = null;
      state.currentCountry = null;
      state.prevChannelKey = state.channelKey;
      state.channelKey = 'visitantes';
      if (channelSelect) {
        channelSelect.value = 'visitantes';
        channelSelect.disabled = true;
        channelSelect.setAttribute('disabled', 'true');
      }
    } else {
      state.currentCountry = country || (fromWorld ? { code: 'MX', name: 'México' } : state.currentCountry);
      state.parentLevel = fromWorld ? 'world' : null;
      if (channelSelect) {
        channelSelect.removeAttribute('disabled');
        channelSelect.disabled = false;
        const restore =
          state.prevChannelKey && CHANNEL_OPTIONS[state.prevChannelKey]
            ? state.prevChannelKey
            : channelSelect.value && CHANNEL_OPTIONS[channelSelect.value]
              ? channelSelect.value
              : 'todos';
        state.channelKey = restore;
        state.prevChannelKey = restore;
        channelSelect.value = restore;
      }
    }
    if (resetButton) {
      if (nextMode === 'world') {
        resetButton.setAttribute('disabled', 'true');
      } else if (state.parentLevel === 'world') {
        resetButton.removeAttribute('disabled');
      }
    }
    if (previousMode !== nextMode) {
      state.worldCache.clear();
    }
    if (state.initialized) {
      if (nextMode === 'world') {
        void renderWorld();
      } else {
        void renderStates();
      }
    } else {
      void initializeMap();
    }
  };
  state.applyMode = applyMode;
  state.scheduleRender = scheduleRender;

  if (paletteSelect) {
    paletteSelect.addEventListener('change', (event) => {
      handlePaletteChange(event.target.value);
    });
  }

  if (scaleSelect) {
    scaleSelect.addEventListener('change', (event) => {
      handleScaleChange(event.target.value);
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', () => {
      if (state.view === 'municipalities' && state.selectedState) {
        state.selectedState = null;
        state.view = 'states';
        void renderStates();
        return;
      }
      if (state.mode === 'mx' && state.parentLevel === 'world') {
        state.applyMode?.('world', { force: true });
        return;
      }
      state.view = 'states';
      state.selectedState = null;
      resetButton.setAttribute('disabled', 'true');
      void renderStates();
    });
  }

  if (channelSelect) {
    channelSelect.addEventListener('change', (event) => {
      if (channelSelect.disabled || state.mode === 'world') {
        channelSelect.value = state.channelKey;
        return;
      }
      const key = event.target.value;
      if (!CHANNEL_OPTIONS[key]) {
        channelSelect.value = state.channelKey;
        return;
      }
      state.channelKey = key;
      state.prevChannelKey = key;
      state.view = 'states';
      state.selectedState = null;
      if (resetButton) {
        resetButton.setAttribute('disabled', 'true');
      }
      if (state.initialized) {
        void renderStates();
      }
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', (event) => {
      applyMode(event.target.value);
    });
  }

  if (rangeSelect) {
    rangeSelect.addEventListener('change', () => {
      state.statesCache.clear();
      state.municipalityCache.clear();
      state.worldCache.clear();
      state.view = 'states';
      state.selectedState = null;
      if (resetButton) {
        resetButton.setAttribute('disabled', 'true');
      }
      scheduleRender();
    });
  }

  if (modeSelect) {
    modeSelect.value = state.mode;
  }
  if (state.mode === 'world' && channelSelect) {
    channelSelect.value = 'visitantes';
    channelSelect.disabled = true;
    channelSelect.setAttribute('disabled', 'true');
  }

  const intersect = () => {
    if (!state.initialized) {
      void initializeMap();
    }
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        observer.disconnect();
        intersect();
      }
    }, { rootMargin: '120px' });
    observer.observe(wrapper);
  } else {
    intersect();
  }
}
