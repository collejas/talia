import { $, fetchJSONWithAuth } from './common.js';

const state = {
  board: '',
  channel: '',
  period: 'hoy',
  dateFrom: '',
  dateTo: '',
  busy: false,
  requestId: 0,
};

export function setupEmbudo() {
  const boardEl = $('embudo-board');
  if (!boardEl) return;

  const boardSelect = $('embudo-board-select');
  const channelSelect = $('embudo-filter-channel');
  const periodSelect = $('embudo-period-select');
  const dateFromInput = $('embudo-date-from');
  const dateToInput = $('embudo-date-to');
  const refreshBtn = $('embudo-refresh');

  if (boardSelect) boardSelect.addEventListener('change', () => void loadBoard());
  if (channelSelect) channelSelect.addEventListener('change', () => void loadBoard());
  if (periodSelect) {
    state.period = periodSelect.value || 'hoy';
    toggleCustomDates(state.period);
    periodSelect.addEventListener('change', () => {
      state.period = periodSelect.value || '';
      toggleCustomDates(state.period);
      if (state.period !== 'fechas') {
        state.dateFrom = '';
        state.dateTo = '';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
      }
      void loadBoard();
    });
  } else {
    toggleCustomDates(state.period);
  }
  const dateChangeHandler = () => {
    if (state.period !== 'fechas') return;
    state.dateFrom = dateFromInput?.value?.trim() || '';
    state.dateTo = dateToInput?.value?.trim() || '';
    void loadBoard();
  };
  if (dateFromInput) dateFromInput.addEventListener('change', dateChangeHandler);
  if (dateToInput) dateToInput.addEventListener('change', dateChangeHandler);
  if (refreshBtn) refreshBtn.addEventListener('click', () => void loadBoard());

  void loadBoards().then(() => loadBoard());
}

async function loadBoards() {
  const boardSelect = $('embudo-board-select');
  if (!boardSelect) return;
  const response = await fetchJSONWithAuth('/api/embudo/tableros');
  if (!response.ok || !response.json?.ok) return;
  const items = response.json.items || [];
  boardSelect.innerHTML = '<option value="">General</option>';
  for (const board of items) {
    const option = document.createElement('option');
    option.value = board.slug || board.id;
    option.textContent = board.nombre || board.slug || 'Tablero';
    option.dataset.boardId = board.id || option.value;
    boardSelect.appendChild(option);
  }
}

function toggleCustomDates(period) {
  const container = $('embudo-custom-dates');
  if (!container) return;
  if (period === 'fechas') {
    container.classList.remove('embudo-hidden');
  } else {
    container.classList.add('embudo-hidden');
  }
}

async function loadBoard() {
  if (state.busy) return;
  state.busy = true;
  state.requestId += 1;
  const requestTag = state.requestId;

  const boardSelect = $('embudo-board-select');
  const channelSelect = $('embudo-filter-channel');
  const periodSelect = $('embudo-period-select');
  const dateFromInput = $('embudo-date-from');
  const dateToInput = $('embudo-date-to');

  const params = [];
  const boardValue = boardSelect?.value?.trim();
  const channelValue = channelSelect?.value?.trim();
  state.board = boardValue || '';
  state.channel = channelValue || '';
  if (state.board) params.push(`tablero=${encodeURIComponent(state.board)}`);
  if (state.channel) params.push(`canales=${encodeURIComponent(state.channel)}`);
  const periodValue = periodSelect?.value?.trim();
  state.period = periodValue || '';
  if (state.period) params.push(`rango=${encodeURIComponent(state.period)}`);
  if (state.period === 'fechas') {
    const fromValue = dateFromInput?.value?.trim() || '';
    const toValue = dateToInput?.value?.trim() || '';
    state.dateFrom = fromValue;
    state.dateTo = toValue;
    if (state.dateFrom) params.push(`desde=${encodeURIComponent(state.dateFrom)}`);
    if (state.dateTo) params.push(`hasta=${encodeURIComponent(state.dateTo)}`);
  } else {
    state.dateFrom = '';
    state.dateTo = '';
  }
  const url = `/api/embudo${params.length ? `?${params.join('&')}` : ''}`;

  showState('loading');

  let response;
  try {
    response = await fetchJSONWithAuth(url);
  } catch (error) {
    state.busy = false;
    if (requestTag !== state.requestId) return;
    console.error('[embudo] fetch error', error);
    showState('error', 'No fue posible cargar el embudo. Intenta nuevamente.');
    return;
  }

  state.busy = false;
  if (requestTag !== state.requestId) return;

  if (!response.ok || !response.json?.ok) {
    showState('error', 'No fue posible cargar el embudo. Intenta nuevamente.');
    return;
  }

  const data = response.json;
  renderSummary(data);
  renderBoard(data);
}

function renderSummary(data) {
  const nameEl = $('embudo-board-name');
  const totalEl = $('embudo-total');
  const categoriesEl = $('embudo-categories');
  if (nameEl) nameEl.textContent = data.board?.nombre || 'Embudo de proceso';
  const total = data.totals?.cards ?? 0;
  if (totalEl) totalEl.textContent = `${total} lead${total === 1 ? '' : 's'}`;
  if (categoriesEl) {
    const catTotals = data.totals?.por_categoria || {};
    const parts = Object.entries(catTotals)
      .map(([label, value]) => `${formatLabel(label)}: ${value}`)
      .join(' · ');
    categoriesEl.textContent = parts;
  }
}

function renderBoard(data) {
  const container = $('embudo-board');
  if (!container) return;
  const stages = data.stages || [];
  if (!stages.length) {
    container.innerHTML = '';
    showState('empty');
    return;
  }
  const html = stages.map((stage) => renderStage(stage)).join('');
  container.innerHTML = html;
  showState('ready');
}

function renderStage(stage) {
  if (stage.counter_only) {
    const total = stage.total || 0;
    return `
      <div class="embudo-column embudo-column-counter">
        <div class="embudo-column-header">
          <div class="embudo-column-title">Visitas al webchat sin interacción durante el período seleccionado.</div>
        <div class="embudo-column-count"></div>
        </div>
        <div class="embudo-column-body embudo-counter-body">
          <p class="embudo-counter-copy">${total} visita${total === 1 ? '' : 's'}</p>
        </div>
      </div>
    `;
  }

  const cards = (stage.cards || []).map((card) => renderCard(card)).join('');
  return `
    <div class="embudo-column">
      <div class="embudo-column-header">
        <div class="embudo-column-title">${escapeHtml(stage.nombre || 'Etapa')}</div>
        <div class="embudo-column-count">${stage.total || 0} lead${stage.total === 1 ? '' : 's'}</div>
      </div>
      <div class="embudo-column-body">
        ${cards || '<p class="muted" style="margin:0;">Sin leads en esta etapa.</p>'}
      </div>
    </div>
  `;
}

function renderCard(card) {
  const contacto = card.contacto || {};
  const conversacion = card.conversacion || {};
  const metadata = card.metadata || {};
  const name = contacto.nombre || contacto.correo || contacto.telefono || 'Lead sin nombre';
  const score = typeof card.lead_score === 'number' ? card.lead_score : null;
  const probability = typeof card.probabilidad === 'number' ? Math.round(card.probabilidad) : null;
  const tags = Array.isArray(card.tags) ? card.tags : [];
  const insights = card.insights || {};
  const nextAction = insights.siguiente_accion || metadata.siguiente_accion;

  const metaParts = [];
  if (contacto.telefono) metaParts.push(escapeHtml(contacto.telefono));
  if (contacto.correo) metaParts.push(escapeHtml(contacto.correo));
  if (conversacion.canal) metaParts.push(escapeHtml(String(conversacion.canal).toUpperCase()));

  const tagHtml = tags
    .map((tag) => `<span class="embudo-pill">${escapeHtml(tag)}</span>`)
    .join('');

  return `
    <article class="embudo-card-item">
      <div class="embudo-card-title">
        <span>${escapeHtml(name)}</span>
        ${score !== null ? `<span class="embudo-score">Score ${score}</span>` : ''}
      </div>
      ${
        metaParts.length
          ? `<div class="embudo-card-meta">${metaParts.map((v) => `<span>${v}</span>`).join('')}</div>`
          : ''
      }
      ${probability !== null ? `<div class="embudo-card-meta"><span>${probability}% prob.</span></div>` : ''}
      ${nextAction ? `<p class="embudo-next">Siguiente acción: ${escapeHtml(nextAction)}</p>` : ''}
      ${tagHtml ? `<div class="embudo-card-meta">${tagHtml}</div>` : ''}
    </article>
  `;
}

function showState(stateName, message) {
  const loading = $('embudo-loading');
  const error = $('embudo-error');
  const empty = $('embudo-empty');
  const board = $('embudo-board');

  if (loading) loading.classList.add('embudo-hidden');
  if (error) error.classList.add('embudo-hidden');
  if (empty) empty.classList.add('embudo-hidden');
  if (board && stateName !== 'ready') board.innerHTML = '';

  switch (stateName) {
    case 'loading':
      if (loading) loading.classList.remove('embudo-hidden');
      break;
    case 'error':
      if (error) {
        error.textContent = message || 'No fue posible cargar el embudo.';
        error.classList.remove('embudo-hidden');
      }
      break;
    case 'empty':
      if (empty) empty.classList.remove('embudo-hidden');
      break;
    case 'ready':
    default:
      break;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLabel(label) {
  switch (label) {
    case 'visitantes':
      return 'Visitantes';
    case 'ganada':
      return 'Ganadas';
    case 'perdida':
      return 'Perdidas';
    case 'abierta':
    default:
      return 'Abiertas';
  }
}
