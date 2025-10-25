import { $, fetchJSONWithAuth } from './common.js';

const state = {
  board: '',
  channel: '',
  busy: false,
  requestId: 0,
};

export function setupKanban() {
  const boardEl = $('kanban-board');
  if (!boardEl) return;

  const boardSelect = $('kanban-board-select');
  const channelSelect = $('kanban-filter-channel');
  const refreshBtn = $('kanban-refresh');

  if (boardSelect) boardSelect.addEventListener('change', () => void loadBoard());
  if (channelSelect) channelSelect.addEventListener('change', () => void loadBoard());
  if (refreshBtn) refreshBtn.addEventListener('click', () => void loadBoard());

  void loadBoards().then(() => loadBoard());
}

async function loadBoards() {
  const boardSelect = $('kanban-board-select');
  if (!boardSelect) return;
  const response = await fetchJSONWithAuth('/api/kanban/boards');
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

async function loadBoard() {
  if (state.busy) return;
  state.busy = true;
  state.requestId += 1;
  const requestTag = state.requestId;

  const boardSelect = $('kanban-board-select');
  const channelSelect = $('kanban-filter-channel');

  const params = [];
  const boardValue = boardSelect?.value?.trim();
  const channelValue = channelSelect?.value?.trim();
  state.board = boardValue || '';
  state.channel = channelValue || '';
  if (state.board) params.push(`tablero=${encodeURIComponent(state.board)}`);
  if (state.channel) params.push(`canales=${encodeURIComponent(state.channel)}`);
  const url = `/api/kanban/board${params.length ? `?${params.join('&')}` : ''}`;

  showState('loading');

  let response;
  try {
    response = await fetchJSONWithAuth(url);
  } catch (error) {
    state.busy = false;
    if (requestTag !== state.requestId) return;
    console.error('[kanban] fetch error', error);
    showState('error', 'No fue posible cargar el tablero. Intenta nuevamente.');
    return;
  }

  state.busy = false;
  if (requestTag !== state.requestId) return; // Petición superada

  if (!response.ok || !response.json?.ok) {
    showState('error', 'No fue posible cargar el tablero. Intenta nuevamente.');
    return;
  }

  const data = response.json;
  renderSummary(data);
  renderBoard(data);
}

function renderSummary(data) {
  const nameEl = $('kanban-board-name');
  const totalEl = $('kanban-total');
  const categoriesEl = $('kanban-categories');
  if (nameEl) nameEl.textContent = data.board?.nombre || 'Pipeline';
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
  const container = $('kanban-board');
  if (!container) return;
  const stages = data.stages || [];
  const hasCards = stages.some((stage) => (stage.cards || []).length > 0);
  if (!hasCards) {
    container.innerHTML = '';
    showState('empty');
    return;
  }

  const html = stages
    .map((stage) => renderStage(stage))
    .join('');
  container.innerHTML = html;
  showState('ready');
}

function renderStage(stage) {
  const cards = (stage.cards || []).map((card) => renderCard(card)).join('');
  return `
    <div class="kanban-column">
      <div class="kanban-column-header">
        <div class="kanban-column-title">${escapeHtml(stage.nombre || 'Etapa')}</div>
        <div class="kanban-column-count">${stage.total || 0} lead${stage.total === 1 ? '' : 's'}</div>
      </div>
      <div class="kanban-column-body">
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
    .map((tag) => `<span class="kanban-pill">${escapeHtml(tag)}</span>`)
    .join('');

  return `
    <article class="kanban-card-item">
      <div class="kanban-card-title">
        <span>${escapeHtml(name)}</span>
        ${score !== null ? `<span class="kanban-score">Score ${score}</span>` : ''}
      </div>
      ${metaParts.length ? `<div class="kanban-card-meta">${metaParts.map((v) => `<span>${v}</span>`).join('')}</div>` : ''}
      ${probability !== null ? `<div class="kanban-card-meta"><span>${probability}% prob.</span></div>` : ''}
      ${nextAction ? `<p class="kanban-next">Siguiente acción: ${escapeHtml(nextAction)}</p>` : ''}
      ${tagHtml ? `<div class="kanban-card-meta">${tagHtml}</div>` : ''}
    </article>
  `;
}

function showState(stateName, message) {
  const loading = $('kanban-loading');
  const error = $('kanban-error');
  const empty = $('kanban-empty');
  const board = $('kanban-board');

  if (loading) loading.classList.add('kanban-hidden');
  if (error) error.classList.add('kanban-hidden');
  if (empty) empty.classList.add('kanban-hidden');
  if (board && stateName !== 'ready') board.innerHTML = '';

  switch (stateName) {
    case 'loading':
      if (loading) loading.classList.remove('kanban-hidden');
      break;
    case 'error':
      if (error) {
        error.textContent = message || 'No fue posible cargar el tablero.';
        error.classList.remove('kanban-hidden');
      }
      break;
    case 'empty':
      if (empty) empty.classList.remove('kanban-hidden');
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
    case 'ganada':
      return 'Ganadas';
    case 'perdida':
      return 'Perdidas';
    case 'abierta':
    default:
      return 'Abiertas';
  }
}
