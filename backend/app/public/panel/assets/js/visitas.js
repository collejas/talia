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
  if (text && text !== '—') {
    td.title = text;
  }
  if (monospace) td.classList.add('monospace');
  if (nowrap) td.classList.add('nowrap');
  if (multiline) td.classList.add('multiline');
  if (breakWord) td.classList.add('break-word');
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

const numberFormatter = new Intl.NumberFormat('es-MX');
const columnWidths = [];
let resizeSetupDone = false;

const state = {
  rango: '7d',
  conChat: 'all',
  estado: '',
  search: '',
  limit: 50,
  page: 0,
  offset: 0,
  total: 0,
  loading: false,
};

const tableBody = () => $('visitas-table-body');
const loadingEl = () => $('visitas-loading');
const emptyEl = () => $('visitas-empty');
const pagerInfo = () => $('visitas-pager-info');
const pagerPrev = () => $('visitas-pager-prev');
const pagerNext = () => $('visitas-pager-next');
const refreshBtn = () => $('visitas-refresh');

function applyColumnWidths() {
  const table = document.querySelector('.o_list_table');
  if (!table) return;

  const headers = table.querySelectorAll('th');
  headers.forEach((th, index) => {
    const width = columnWidths[index];
    if (!width) return;
    const px = `${width}px`;
    th.style.width = px;
    th.style.minWidth = px;
    th.style.maxWidth = px;
  });

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((row) => {
    Array.from(row.children).forEach((cell, index) => {
      const width = columnWidths[index];
      if (!width || cell.colSpan > 1) return;
      const px = `${width}px`;
      cell.style.width = px;
      cell.style.minWidth = px;
      cell.style.maxWidth = px;
    });
  });
}

function startColumnResize(event, th, index) {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startWidth = th.getBoundingClientRect().width;
  const minWidth = 90;
  th.classList.add('is-resizing');

  function onMouseMove(moveEvent) {
    const delta = moveEvent.clientX - startX;
    const newWidth = Math.max(minWidth, Math.round(startWidth + delta));
    columnWidths[index] = newWidth;
    applyColumnWidths();
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    th.classList.remove('is-resizing');
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function setupColumnResizing() {
  if (resizeSetupDone) return;
  const table = document.querySelector('.o_list_table');
  if (!table) return;
  const headers = table.querySelectorAll('th');
  headers.forEach((th, index) => {
    const handle = document.createElement('span');
    handle.className = 'o_resize_handle';
    handle.addEventListener('mousedown', (event) => startColumnResize(event, th, index));
    th.appendChild(handle);
    if (!columnWidths[index]) {
      columnWidths[index] = Math.max(th.getBoundingClientRect().width, 100);
    }
  });
  resizeSetupDone = true;
  applyColumnWidths();
}

function setLoading(isLoading) {
  state.loading = isLoading;
  const el = loadingEl();
  if (el) el.classList.toggle('is-visible', isLoading);
  const refresh = refreshBtn();
  if (refresh) refresh.disabled = isLoading;
  if (isLoading) {
    const empty = emptyEl();
    if (empty) empty.classList.remove('is-visible');
  }
}

function renderRows(items) {
  const tbody = tableBody();
  if (!tbody) return;

  tbody.innerHTML = '';

  const empty = emptyEl();
  if (!items.length) {
    if (empty) empty.classList.add('is-visible');
    const placeholder = document.createElement('tr');
    const placeholderCell = createCell('Sin registros disponibles', { breakWord: true });
    placeholderCell.colSpan = 15;
    placeholderCell.classList.add('muted');
    placeholder.appendChild(placeholderCell);
    tbody.appendChild(placeholder);
    applyColumnWidths();
    return;
  }
  if (empty) empty.classList.remove('is-visible');

  const fragment = document.createDocumentFragment();
  for (const row of items) {
    const tr = document.createElement('tr');

    const inboundMessages = Number(row.mensajes_entrantes || 0);
    const chatLabel = row.tuvo_chat
      ? `Sí (${numberFormatter.format(inboundMessages)} entrantes)`
      : 'No';
    const visitsTotal = row.total_visitas ?? row.visit_count ?? 0;
    const lastEventParts = [formatDateTime(row.ultimo_evento_en)];
    if (row.closed_at) lastEventParts.push(`Cierre: ${formatDateTime(row.closed_at)}`);

    tr.appendChild(createCell(row.session_id, { monospace: true, nowrap: true }));
    tr.appendChild(createCell(row.ip, { breakWord: true }));
    tr.appendChild(createCell(numberFormatter.format(visitsTotal)));
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
  applyColumnWidths();
}

function updatePager(itemsLength) {
  const info = pagerInfo();
  const total = state.total;
  const offset = state.page * state.limit;
  const hasItems = total > 0 && itemsLength > 0;
  const start = hasItems ? offset + 1 : 0;
  const end = hasItems ? Math.min(offset + itemsLength, total) : 0;
  if (info) {
    info.textContent = hasItems
      ? `${numberFormatter.format(start)}-${numberFormatter.format(end)} de ${numberFormatter.format(total)}`
      : `${numberFormatter.format(total)} resultados`;
  }

  const prev = pagerPrev();
  if (prev) {
    prev.disabled = state.loading || state.page <= 0;
  }
  const next = pagerNext();
  if (next) {
    next.disabled = state.loading || offset + itemsLength >= total;
  }
}

async function loadVisits({ reset } = { reset: false }) {
  if (state.loading) return;

  if (reset) {
    state.page = 0;
    state.offset = 0;
    state.total = 0;
  }

  const offset = state.page * state.limit;
  state.offset = offset;

  const params = new URLSearchParams();
  params.set('limit', String(state.limit));
  params.set('offset', String(offset));
  if (state.rango) params.set('rango', state.rango);
  if (state.conChat === 'with') params.set('con_chat', 'true');
  if (state.conChat === 'without') params.set('con_chat', 'false');
  if (state.estado) params.set('estado', state.estado);
  if (state.search) params.set('q', state.search);

  setLoading(true);

  let itemsLength = 0;

  try {
    const response = await fetchJSONWithAuth(`/api/visitas/webchat?${params.toString()}`);
    if (!response.ok) throw new Error(response.json?.detail || 'Error consultando visitas');

    const items = Array.isArray(response.json?.items) ? response.json.items : [];
    state.total = Number(response.json?.total || (reset ? items.length : state.total));

    renderRows(items);
    itemsLength = items.length;
  } catch (error) {
    console.error('[visitas] load error', error);
    const tbody = tableBody();
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="15" class="muted">No fue posible cargar las visitas.</td></tr>';
    }
    const empty = emptyEl();
    if (empty) empty.classList.remove('is-visible');
    state.total = 0;
    itemsLength = 0;
    applyColumnWidths();
  } finally {
    setLoading(false);
    updatePager(itemsLength);
  }
}

function resetFilters(formEl) {
  state.rango = '7d';
  state.conChat = 'all';
  state.estado = '';
  state.search = '';
  state.page = 0;
  state.offset = 0;
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
  const prevBtn = pagerPrev();
  const nextBtn = pagerNext();
  const refresh = refreshBtn();

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

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (state.loading || state.page <= 0) return;
      state.page -= 1;
      loadVisits({ reset: false });
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (state.loading) return;
      const offset = (state.page + 1) * state.limit;
      if (offset >= state.total) return;
      state.page += 1;
      loadVisits({ reset: false });
    });
  }

  if (refresh) {
    refresh.addEventListener('click', () => {
      if (state.loading) return;
      loadVisits({ reset: false });
    });
  }

  setupColumnResizing();
  loadVisits({ reset: true });
}
