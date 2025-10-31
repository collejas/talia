import { $, fetchJSONWithAuth } from './common.js';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '—';
  let remaining = Math.floor(value);
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining - minutes * 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && secs) parts.push(`${secs}s`);
  if (!parts.length) parts.push('0s');
  return parts.join(' ');
}

function formatContact(row) {
  const chunks = [];
  if (row.contacto_nombre) chunks.push(row.contacto_nombre);
  const sub = [];
  if (row.contacto_correo) sub.push(row.contacto_correo);
  if (row.contacto_telefono) sub.push(row.contacto_telefono);
  if (sub.length) chunks.push(sub.join(' · '));
  return chunks.join('\n') || 'Sin contacto';
}

function createCell(value, { monospace = false, nowrap = false, multiline = false, breakWord = false } = {}) {
  const td = document.createElement('td');
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  td.textContent = text;
  if (monospace) td.style.fontFamily = 'var(--font-mono)';
  if (nowrap) td.style.whiteSpace = 'nowrap';
  if (multiline) td.style.whiteSpace = 'pre-line';
  if (breakWord) td.style.wordBreak = 'break-all';
  return td;
}

function formatDevice(row) {
  const pieces = [];
  if (row.device_type) pieces.push(row.device_type);
  const deviceInfo = row.dispositivo_cache;
  const platform = row.sistema_operativo || deviceInfo?.plataforma;
  if (platform) pieces.push(platform);
  const pantalla = row.pantalla_cache || deviceInfo?.pantalla;
  if (pantalla && typeof pantalla === 'object') {
    const sizeParts = [];
    if (pantalla.width && pantalla.height) sizeParts.push(`${pantalla.width}×${pantalla.height}`);
    if (pantalla.pixel_ratio) sizeParts.push(`@${pantalla.pixel_ratio}x`);
    if (sizeParts.length) pieces.push(sizeParts.join(' '));
  }
  return pieces.join(' • ') || 'Sin datos';
}

function formatCountry(row) {
  const code = row.country_code ? row.country_code.toUpperCase() : '';
  const name = row.country_name || code;
  if (!name) return 'Sin datos';
  if (code && name.toUpperCase() !== code) return `${name} (${code})`;
  return name;
}

function formatState(row) {
  return row.state_name || 'Sin datos';
}

function formatCity(row) {
  return row.city_name || 'Sin datos';
}

const state = {
  rango: '7d',
  conChat: 'all',
  estado: '',
  search: '',
  limit: 50,
  offset: 0,
  total: 0,
  totalChat: 0,
  totalSinChat: 0,
  loading: false,
};

const tableBody = () => $('visitas-table-body');
const loadingEl = () => $('visitas-loading');
const emptyEl = () => $('visitas-empty');
const summaryTotal = () => $('visitas-total-label');
const summaryChat = () => $('visitas-chat-label');
const summarySinChat = () => $('visitas-sinchat-label');
const loadMoreBtn = () => $('visitas-load-more');

function setLoading(isLoading) {
  state.loading = isLoading;
  const el = loadingEl();
  if (el) el.classList.toggle('is-visible', isLoading);
  const btn = loadMoreBtn();
  if (btn) btn.disabled = isLoading;
}

function renderRows(items, { reset }) {
  const tbody = tableBody();
  if (!tbody) return;

  if (reset) {
    tbody.innerHTML = '';
  }

  if (!items.length && reset) {
    const empty = emptyEl();
    if (empty) empty.classList.add('is-visible');
    return;
  }
  const empty = emptyEl();
  if (empty) empty.classList.remove('is-visible');

  const fragment = document.createDocumentFragment();
  for (const row of items) {
    const tr = document.createElement('tr');

    const chatLabel = row.tuvo_chat
      ? `Sí (${row.mensajes_entrantes || 0} entrantes)`
      : 'No';
    const visitsTotal = row.total_visitas ?? row.visit_count ?? 0;
    const lastEventParts = [formatDateTime(row.ultimo_evento_en)];
    if (row.closed_at) lastEventParts.push(`Cierre: ${formatDateTime(row.closed_at)}`);

    tr.appendChild(createCell(row.session_id, { monospace: true, nowrap: true }));
    tr.appendChild(createCell(row.ip, { breakWord: true }));
    tr.appendChild(createCell(visitsTotal));
    tr.appendChild(createCell(formatDateTime(row.primera_visita_en || row.registrado_en)));
    tr.appendChild(createCell(lastEventParts.join('\n'), { multiline: true }));
    tr.appendChild(createCell(formatDuration(row.stay_seconds)));
    tr.appendChild(createCell(formatDuration(row.avg_stay_seconds)));
    tr.appendChild(createCell(chatLabel));
    tr.appendChild(createCell(formatContact(row), { multiline: true }));
    tr.appendChild(createCell(formatCountry(row)));
    tr.appendChild(createCell(formatState(row)));
    tr.appendChild(createCell(formatCity(row)));
    tr.appendChild(createCell(formatDevice(row)));
    tr.appendChild(createCell(row.referrer, { breakWord: true }));
    tr.appendChild(createCell(row.landing_url, { breakWord: true }));

    fragment.appendChild(tr);
  }

  tbody.appendChild(fragment);
}

function updateSummary() {
  const totalLabel = summaryTotal();
  if (totalLabel) {
    totalLabel.textContent = `Total: ${state.total}`;
  }
  const chatLabel = summaryChat();
  if (chatLabel) {
    chatLabel.textContent = `Con chat: ${state.totalChat}`;
  }
  const sinChatLabel = summarySinChat();
  if (sinChatLabel) {
    sinChatLabel.textContent = `Sin chat: ${state.totalSinChat}`;
  }
}

async function loadVisits({ reset } = { reset: false }) {
  if (state.loading) return;
  setLoading(true);

  if (reset) {
    state.offset = 0;
    state.total = 0;
    state.totalChat = 0;
    state.totalSinChat = 0;
    updateSummary();
  }

  const params = new URLSearchParams();
  params.set('limit', String(state.limit));
  params.set('offset', String(state.offset));
  if (state.rango) params.set('rango', state.rango);
  if (state.conChat === 'with') params.set('con_chat', 'true');
  if (state.conChat === 'without') params.set('con_chat', 'false');
  if (state.estado) params.set('estado', state.estado);
  if (state.search) params.set('q', state.search);

  try {
    const response = await fetchJSONWithAuth(`/api/visitas/webchat?${params.toString()}`);
    if (!response.ok) throw new Error(response.json?.detail || 'Error consultando visitas');

    const items = Array.isArray(response.json?.items) ? response.json.items : [];
    state.total = Number(response.json?.total || (reset ? items.length : state.total));
    state.totalChat = Number(response.json?.totals?.con_chat || 0);
    state.totalSinChat = Number(response.json?.totals?.sin_chat || Math.max(state.total - state.totalChat, 0));

    renderRows(items, { reset });
    updateSummary();

    const nextOffset = state.offset + items.length;

    const btn = loadMoreBtn();
    if (btn) {
      btn.hidden = nextOffset >= state.total;
      btn.disabled = nextOffset >= state.total;
    }

    state.offset = nextOffset;
  } catch (error) {
    console.error('[visitas] load error', error);
    const tbody = tableBody();
    if (tbody && (!tbody.childElementCount || reset)) {
      tbody.innerHTML = '<tr><td colspan="15" class="muted">No fue posible cargar las visitas.</td></tr>';
    }
  } finally {
    setLoading(false);
  }
}

function resetFilters(formEl) {
  state.rango = '7d';
  state.conChat = 'all';
  state.estado = '';
  state.search = '';
  if (formEl) {
    formEl.reset();
    const range = $('visitas-range');
    if (range) range.value = '7d';
    const chat = $('visitas-chat');
    if (chat) chat.value = 'all';
  }
}

export function setupVisitas() {
  const form = $('visitas-filters-form');
  const range = $('visitas-range');
  const chat = $('visitas-chat');
  const stateInput = $('visitas-state');
  const searchInput = $('visitas-search');
  const resetBtn = $('visitas-reset');
  const loadBtn = loadMoreBtn();

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      state.rango = range?.value || '';
      state.conChat = chat?.value || 'all';
      state.estado = stateInput?.value?.trim() || '';
      state.search = searchInput?.value?.trim() || '';
      loadVisits({ reset: true });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetFilters(form);
      loadVisits({ reset: true });
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      loadVisits({ reset: false });
    });
  }

  loadVisits({ reset: true });
}
