import { $, ensureSession, fetchJSONWithAuth } from './common.js';
import { setupLeadsMap } from './leads_map.js';

const KPI_IDS = [
  'kpi-conv',
  'kpi-contacts',
  'kpi-channels',
  'kpi-webchat-visitas',
  'kpi-webchat-chats',
  'kpi-webchat-conversion',
  'kpi-dialogos-gen',
  'kpi-dialogos-sr',
  'kpi-lapso-medio',
  'kpi-lapso-max',
];

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '0';
  const num = Number(value);
  return num.toLocaleString('es-MX');
}

function formatSeconds(s) {
  if (s == null || Number.isNaN(Number(s))) return '—';
  const sec = Math.max(0, Math.floor(Number(s)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const pct = Math.max(0, Math.min(1, Number(value))) * 100;
  if (pct >= 100) return '100%';
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function showStatusPlaceholder(text = 'Actualizando…') {
  for (const id of ['status-conversaciones', 'status-contactos', 'status-captura']) {
    const container = $(id);
    if (container) {
      container.innerHTML = `<li class="muted"><span>${text}</span><span>—</span></li>`;
    }
  }
}

function renderStatusList(id, stats = {}, { order = [], labels = {}, total = 0 } = {}) {
  const container = $(id);
  if (!container) return;
  container.innerHTML = '';
  const seen = new Set();

  const appendItem = (key, count) => {
    const label = labels[key] || key;
    const li = document.createElement('li');
    const labelSpan = document.createElement('span');
    labelSpan.className = 'status-label';
    labelSpan.textContent = label;

    const values = document.createElement('span');
    values.className = 'status-values';
    const countSpan = document.createElement('span');
    countSpan.textContent = formatNumber(count);
    values.appendChild(countSpan);

    if (total > 0) {
      const pctLabel = formatPercent(count / total);
      if (pctLabel !== '—') {
        const pill = document.createElement('span');
        pill.className = 'status-pill';
        pill.textContent = pctLabel;
        values.appendChild(pill);
      }
    }

    li.appendChild(labelSpan);
    li.appendChild(values);
    container.appendChild(li);
  };

  const addKey = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const count = Number(stats?.[key] ?? 0);
    appendItem(key, count);
  };

  for (const key of order) addKey(key);
  for (const [key] of Object.entries(stats || {})) addKey(key);

  if (container.childElementCount === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.innerHTML = '<span>Sin datos en el período</span><span>0</span>';
    container.appendChild(li);
  }
}

function applyKpis(data) {
  const conversaciones = data?.conversaciones || {};
  const contactos = data?.contactos || {};
  const visitantesSinChat = Number(data?.visitantes ?? 0);
  const webchat = data?.webchat || {};
  const totalConvs = Number(conversaciones?.total ?? 0);
  const totalContactosCompletos = Number(contactos?.total ?? 0);
  const webchatConversaciones = Number(webchat?.conversaciones ?? conversaciones?.webchat_total ?? 0);
  const webchatVisitasTotales = Number(
    webchat?.visitas_totales ?? visitantesSinChat + webchatConversaciones,
  );
  const webchatContactosCompletos = Number(webchat?.contactos_completos ?? 0);
  const tiemposRespuesta = data?.tiempos_respuesta || {};
  const promedioRespuesta = tiemposRespuesta?.promedio;
  const maxRespuesta = tiemposRespuesta?.maximo;

  setText('kpi-conv', formatNumber(totalConvs));
  setText('kpi-contacts', formatNumber(totalContactosCompletos));
  setText('kpi-channels', formatNumber(conversaciones?.canales_activos ?? 0));
  setText('kpi-webchat-visitas', formatNumber(visitantesSinChat));
  setText('kpi-webchat-chats', formatNumber(webchatConversaciones));
  setText('kpi-lapso-medio', formatSeconds(promedioRespuesta));
  setText('kpi-lapso-max', formatSeconds(maxRespuesta));

  if (webchatVisitasTotales > 0) {
    setText('kpi-webchat-conversion', formatPercent(webchatContactosCompletos / webchatVisitasTotales));
  } else {
    setText('kpi-webchat-conversion', '—');
  }

  const contactosPorEstado = contactos?.por_estado || {};
  const capturaPorEstado = contactos?.captura || {};
  const totalContactosEstado = Object.values(contactosPorEstado).reduce(
    (acc, value) => acc + Number(value ?? 0),
    0,
  );
  const totalContactosCaptura = Object.values(capturaPorEstado).reduce(
    (acc, value) => acc + Number(value ?? 0),
    0,
  );

  renderStatusList('status-conversaciones', conversaciones?.por_estado, {
    order: ['abierta', 'pendiente', 'cerrada', 'desconocido'],
    labels: {
      abierta: 'Abiertas',
      pendiente: 'Pendientes',
      cerrada: 'Cerradas',
      desconocido: 'Sin estado',
    },
    total: totalConvs,
  });

  renderStatusList('status-contactos', contactosPorEstado, {
    order: ['lead', 'activo', 'bloqueado', 'desconocido'],
    labels: {
      lead: 'Leads',
      activo: 'Activos',
      bloqueado: 'Bloqueados',
      desconocido: 'Sin estado',
    },
    total: totalContactosEstado || totalContactosCaptura,
  });

  renderStatusList('status-captura', capturaPorEstado, {
    order: ['completo', 'incompleto'],
    labels: {
      completo: 'Captura completa',
      incompleto: 'Captura incompleta',
    },
    total: totalContactosCaptura,
  });
}

async function loadKpis() {
  const rangeSel = $('dashboard-range');
  const rango = rangeSel ? (rangeSel.value || '7d') : '7d';

  for (const id of KPI_IDS) setText(id, '—');
  showStatusPlaceholder();

  const params = [];
  if (rango) params.push(`rango=${encodeURIComponent(rango)}`);
  const query = params.length ? `?${params.join('&')}` : '';
  try {
    const response = await fetchJSONWithAuth(`/api/dashboard/kpis${query}`);
    if (response.ok && response.json?.ok) {
      applyKpis(response.json.kpis || {});
      return;
    }
  } catch (error) {
    console.error('[dashboard] kpis fetch error', error);
  }
  showStatusPlaceholder('No disponible');
}

async function main() {
  await ensureSession();
  await loadKpis();
  const rangeSel = $('dashboard-range');
  if (rangeSel) rangeSel.addEventListener('change', () => void loadKpis());
  setupLeadsMap();
}

void main();
