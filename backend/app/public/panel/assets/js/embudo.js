import { $, fetchJSONWithAuth } from './common.js';

const state = {
  board: '',
  channel: '',
  period: 'hoy',
  dateFrom: '',
  dateTo: '',
  busy: false,
  requestId: 0,
  stageInfo: [],
  captadoIndex: null,
  modalRequestId: 0,
  modalTrigger: null,
  modal: {
    container: null,
    panel: null,
    body: null,
    title: null,
    closeBtn: null,
  },
};

export function setupEmbudo() {
  const boardEl = $('embudo-board');
  if (!boardEl) return;

  state.modal.container = $('embudo-contact-modal');
  state.modal.panel = $('embudo-modal-panel');
  state.modal.body = $('embudo-modal-body');
  state.modal.title = $('embudo-modal-title');
  state.modal.closeBtn = $('embudo-modal-close');

  if (state.modal.closeBtn) {
    state.modal.closeBtn.addEventListener('click', () => closeContactModal());
  }
  if (state.modal.container) {
    state.modal.container.setAttribute('aria-hidden', 'true');
    state.modal.container.addEventListener('click', (event) => {
      if (event.target === state.modal.container) {
        closeContactModal();
      }
    });
  }
  if (state.modal.panel) {
    state.modal.panel.addEventListener('click', (event) => event.stopPropagation());
  }

  boardEl.addEventListener('click', handleBoardClick);
  boardEl.addEventListener('keydown', handleBoardKeydown);
  document.addEventListener('keydown', handleModalKeydown);

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
  const stages = Array.isArray(data.stages) ? data.stages : [];
  if (!stages.length) {
    container.innerHTML = '';
    showState('empty');
    return;
  }
  state.stageInfo = stages.map((stage, index) => ({
    id: stage?.id,
    codigo: stage?.codigo,
    nombre: stage?.nombre,
    index,
  }));
  state.captadoIndex = findCaptadoIndex(state.stageInfo);
  const html = stages
    .map((stage, index) => renderStage(stage, index, state.captadoIndex))
    .join('');
  container.innerHTML = html;
  showState('ready');
}

function renderStage(stage, index, captadoIndex) {
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

  const stageIndex = Number.isFinite(index) ? index : -1;
  const allowInteraction =
    typeof captadoIndex === 'number' && captadoIndex !== null
      ? stageIndex >= captadoIndex
      : false;
  const cards = Array.isArray(stage.cards)
    ? stage.cards.map((card) => renderCard(card, stage, stageIndex, allowInteraction)).join('')
    : '';
  const stageIdAttr =
    stage?.id && typeof stage.id === 'string'
      ? ` data-stage-id="${escapeHtml(stage.id)}"`
      : '';
  const stageIndexAttr = stageIndex >= 0 ? ` data-stage-index="${stageIndex}"` : '';
  const stageNameAttr =
    stage?.nombre && typeof stage.nombre === 'string'
      ? ` data-stage-name="${escapeHtml(stage.nombre)}"`
      : '';
  return `
    <div class="embudo-column"${stageIdAttr}${stageIndexAttr}${stageNameAttr}>
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

function renderCard(card, stage, stageIndex, allowInteraction) {
  const contacto = card?.contacto || {};
  const conversacion = card?.conversacion || {};
  const metadata = card?.metadata || {};
  const name = contacto.nombre || contacto.correo || contacto.telefono || 'Lead sin nombre';
  const score = typeof card.lead_score === 'number' ? card.lead_score : null;
  const probability = typeof card.probabilidad === 'number' ? Math.round(card.probabilidad) : null;
  const tags = Array.isArray(card.tags) ? card.tags : [];
  const insights = card.insights || {};
  const nextAction = insights.siguiente_accion || metadata.siguiente_accion;
  const contactoId = contacto.id || card.contacto_id || null;
  const cardId = card.id || null;
  const stageName = stage?.nombre || '';
  const interactive = Boolean(allowInteraction && contactoId);

  const metaParts = [];
  if (contacto.telefono) metaParts.push(escapeHtml(contacto.telefono));
  if (contacto.correo) metaParts.push(escapeHtml(contacto.correo));
  if (conversacion.canal) metaParts.push(escapeHtml(String(conversacion.canal).toUpperCase()));

  const tagHtml = tags.map((tag) => `<span class="embudo-pill">${escapeHtml(tag)}</span>`).join('');

  const attrParts = [
    'class="embudo-card-item"',
    interactive ? 'data-interactive="true"' : '',
    cardId ? `data-card-id="${escapeHtml(cardId)}"` : '',
    contactoId ? `data-contacto-id="${escapeHtml(contactoId)}"` : '',
    stageName ? `data-stage-name="${escapeHtml(stageName)}"` : '',
    Number.isFinite(stageIndex) && stageIndex >= 0 ? `data-stage-index="${stageIndex}"` : '',
    name ? `data-card-name="${escapeHtml(name)}"` : '',
    interactive ? `role="button"` : '',
    interactive ? `tabindex="0"` : '',
    interactive ? `aria-label="Ver detalles de ${escapeHtml(name)}"` : '',
  ].filter(Boolean);

  return `
    <article ${attrParts.join(' ')}>
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

function handleBoardClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const card = target.closest('.embudo-card-item[data-interactive="true"]');
  if (!card) return;
  event.preventDefault();
  openContactModal(card);
}

function handleBoardKeydown(event) {
  if (!(event.target instanceof HTMLElement)) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.embudo-card-item[data-interactive="true"]');
  if (!card) return;
  event.preventDefault();
  openContactModal(card);
}

function handleModalKeydown(event) {
  if (event.key !== 'Escape') return;
  const container = state.modal.container;
  if (!container || !container.classList.contains('is-open')) return;
  event.preventDefault();
  closeContactModal();
}

async function openContactModal(cardEl) {
  if (!(cardEl instanceof HTMLElement)) return;
  const contactoId = cardEl.dataset.contactoId;
  if (!contactoId) return;

  state.modalTrigger = cardEl;
  const cardName = cardEl.dataset.cardName || '';
  const stageName = cardEl.dataset.stageName || '';
  const requestTag = ++state.modalRequestId;

  showContactModalSkeleton({ cardName });

  let response;
  try {
    response = await fetchJSONWithAuth(`/api/contactos/${encodeURIComponent(contactoId)}`);
  } catch (error) {
    if (requestTag !== state.modalRequestId) return;
    console.error('[embudo] contacto fetch error', error);
    renderContactModalError('No fue posible cargar los datos del contacto.');
    return;
  }

  if (requestTag !== state.modalRequestId) return;

  if (!response.ok || !response.json?.ok) {
    renderContactModalError('No fue posible cargar los datos del contacto.');
    return;
  }

  const contacto = response.json.contacto || null;
  renderContactModal(contacto, { cardName, stageName });
}

function showContactModalSkeleton({ cardName }) {
  const { container, body, title, panel } = state.modal;
  if (!container || !body) return;
  container.classList.add('is-open');
  container.classList.remove('embudo-hidden');
  container.setAttribute('aria-hidden', 'false');
  if (title) {
    title.textContent = cardName || 'Detalles del contacto';
  }
  body.innerHTML = '<p class="muted">Cargando datos del contacto…</p>';
  if (panel) {
    requestAnimationFrame(() => {
      panel.focus();
    });
  }
}

function renderContactModal(contacto, { cardName, stageName }) {
  const { body, title } = state.modal;
  if (!body) return;
  const displayName = (contacto && contacto.nombre) || cardName || 'Detalles del contacto';
  if (title) {
    title.textContent = displayName;
  }
  if (!contacto) {
    renderContactModalError('No se encontró el contacto solicitado.');
    return;
  }

  const details = [
    ['Nombre', contacto.nombre || cardName],
    ['Correo', contacto.correo],
    ['Teléfono', contacto.telefono],
    ['Origen', contacto.origen],
    ['Estado', contacto.estado],
    ['Captura', contacto.captura_estado],
    ['Empresa', contacto.company_name],
    ['Propietario', contacto.propietario_usuario_id],
    ['Creado', formatDateTime(contacto.creado_en)],
  ];

  const detailsHtml = renderDetailList(details);
  const stageBadge = stageName
    ? `<span class="embudo-modal-stage">Etapa: ${escapeHtml(stageName)}</span>`
    : '';

  const necesidadValue = formatDetailValue(contacto.necesidad_proposito);
  const necesidadHtml = necesidadValue
    ? `<div><h4 class="embudo-modal-section-title">Necesidad / propósito</h4><div class="embudo-modal-notes">${escapeHtml(
        necesidadValue
      )}</div></div>`
    : '';

  const notesValue = formatDetailValue(contacto.notes);
  const notesHtml = notesValue
    ? `<div><h4 class="embudo-modal-section-title">Notas</h4><div class="embudo-modal-notes">${escapeHtml(
        notesValue
      )}</div></div>`
    : '';

  const extraHtml = renderExtraDetails(contacto.datos);

  body.innerHTML = `
    ${stageBadge}
    ${detailsHtml || '<p class="muted">No hay datos adicionales disponibles.</p>'}
    ${necesidadHtml}
    ${notesHtml}
    ${extraHtml}
  `;
}

function renderDetailList(entries) {
  if (!Array.isArray(entries) || !entries.length) return '';
  const rows = entries
    .map(([label, value]) => {
      const formatted = formatDetailValue(value);
      if (!formatted) return '';
      return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatted)}</dd>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `<dl class="embudo-modal-details">${rows}</dl>`;
}

function renderExtraDetails(datos) {
  if (!datos || typeof datos !== 'object') return '';
  const entries = Object.entries(datos).filter(([key]) => !shouldHideExtraField(key));
  if (!entries.length) return '';
  const rows = entries
    .map(([key, value]) => {
      const formatted = formatDetailValue(value);
      if (!formatted) return '';
      return `<dt>${escapeHtml(formatExtraLabel(key))}</dt><dd>${escapeHtml(formatted)}</dd>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `
    <div>
      <h4 class="embudo-modal-section-title">Datos adicionales</h4>
      <dl class="embudo-modal-details">${rows}</dl>
    </div>
  `;
}

function renderContactModalError(message) {
  const { body, title } = state.modal;
  if (body) {
    body.innerHTML = `<p class="muted">${escapeHtml(
      message || 'No fue posible cargar los datos del contacto.'
    )}</p>`;
  }
  if (title && !title.textContent) {
    title.textContent = 'Detalles del contacto';
  }
}

function closeContactModal() {
  state.modalRequestId += 1;
  const { container, body, title } = state.modal;
  if (container) {
    container.classList.remove('is-open');
    container.classList.add('embudo-hidden');
    container.setAttribute('aria-hidden', 'true');
  }
  if (body) body.innerHTML = '';
  if (title) title.textContent = 'Detalles del contacto';
  const trigger = state.modalTrigger;
  state.modalTrigger = null;
  if (trigger && typeof trigger.focus === 'function') {
    trigger.focus();
  }
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatDetailValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return formatDateTime(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatDetailValue(item)).filter(Boolean).join(', ');
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatExtraLabel(key) {
  return String(key || '')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function shouldHideExtraField(key) {
  const token = normalizeToken(key);
  return (
    token === 'ubicacion' ||
    token === 'sessionid' ||
    token === 'dispositivo' ||
    token === 'trazabilidad'
  );
}

function findCaptadoIndex(stageInfo) {
  if (!Array.isArray(stageInfo)) return null;
  for (const info of stageInfo) {
    if (isCaptadoStage(info)) {
      return typeof info.index === 'number' ? info.index : null;
    }
  }
  return null;
}

function isCaptadoStage(info) {
  const nameToken = normalizeToken(info?.nombre);
  const codeToken = normalizeToken(info?.codigo);
  const targets = new Set(['captado', 'captacion']);
  return targets.has(nameToken) || targets.has(codeToken);
}

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
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
