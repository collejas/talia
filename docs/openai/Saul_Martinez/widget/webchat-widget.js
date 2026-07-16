/* eslint-disable */

const DEFAULT_FALLBACK_MESSAGE =
  'Tu mensaje llegó, pero tuve un problema momentáneo al responder. Intentemos de nuevo en unos segundos o envíame otra línea.';

const defaultConfig = {
  apiBaseUrl: '/api/webchat',
  storageSessionKey: 'talia-webchat-session',
  historyLimit: 100,
  historyIntervalMs: 4000,
  fallbackMessage: DEFAULT_FALLBACK_MESSAGE,
  autoLifecycle: true,
  hiddenInactivityTimeoutMs: 45 * 60 * 1000,
  persistSession: true,
  tenantAlias: null,
  getScrollContainer: () => {
    return (
      document.querySelector('.webchat-widget__messages') ||
      document.getElementById('chat-log') ||
      document.querySelector('.webchat-widget__panel') ||
      document.querySelector('.layout') ||
      document.scrollingElement ||
      document.documentElement ||
      document.body
    );
  },
};

const elements = {
  chatLog: null,
  chatForm: null,
  chatInput: null,
  chatAttachmentButton: null,
  chatFileInput: null,
  chatAttachments: null,
  chatSubmitButton: null,
};

const state = {
  chatEnabled: false,
  typingBubble: null,
  assistantReplyPending: false,
  historyPollingTimer: null,
  lastHistoryIds: [],
  syncingHistory: false,
  sessionId: null,
  conversationId: null,
  openaiConversationId: null,
  lastAssistantResponseId: null,
  manualMode: false,
  assistantQueue: Promise.resolve(),
  lifecycleBound: false,
  hiddenTimeoutHandle: null,
  visitRegistered: false,
  pendingAttachments: [],
  uploadingAttachments: false,
  attachmentError: null,
};

function capitalize(text) {
  if (!text) return '';
  const value = String(text).trim();
  if (!value.length) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normaliseTimezoneLabel(timezone) {
  if (!timezone || typeof timezone !== 'string') return 'America/Mexico City';
  return timezone.replace(/_/g, ' ');
}

function handleCalendarSlotSelection(slot, fallbackTimezone) {
  if (!elements.chatInput) return;
  const inputTimezone = slot.timezone || fallbackTimezone || 'America/Mexico_City';
  const startDate = slot.start_at ? new Date(slot.start_at) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) return;
  calendarDebug('handleCalendarSlotSelection', {
    slotId: slot.slot_id || slot.start_at,
    start_at: slot.start_at,
    timezone: inputTimezone,
  });

  const locale = 'es-MX';
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: inputTimezone,
  });
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: inputTimezone,
  });

  const dayLabel = capitalize(dayFormatter.format(startDate));
  const timeLabel = timeFormatter.format(startDate);
  const message = `Me acomoda la demo el ${dayLabel} a las ${timeLabel} (${normaliseTimezoneLabel(
    inputTimezone,
  )}).`;

  elements.chatInput.value = message;
  elements.chatInput.focus();
  elements.chatInput.setSelectionRange(message.length, message.length);
  updateComposerState();
}

const calendarState = {
  selectedSlotId: null,
};

function ensureCalendarInlineStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('talia-calendar-inline-styles')) return;
  const style = document.createElement('style');
  style.id = 'talia-calendar-inline-styles';
  style.textContent = `
    .message__calendar{margin-top:.75rem;padding:.75rem;border:1px solid rgba(15,23,42,.12);border-radius:.85rem;background:rgba(148,163,184,.12);display:flex;flex-direction:column;gap:.65rem}
    .message__calendar-week{display:grid;gap:.75rem;grid-template-columns:repeat(2,minmax(0,1fr))}
    .message__calendar-column{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.18);border-radius:.85rem;padding:.65rem;display:flex;flex-direction:column;gap:.5rem;min-width:0}
    .message__calendar-slot{width:100%;border-radius:.65rem;border:1px solid rgba(15,23,42,.12);background:#fff;color:#0f172a;font-size:.82rem;padding:.45rem .6rem;cursor:pointer}
    .message__calendar-slot.is-selected{border-color:rgba(59,130,246,.6);background:rgba(59,130,246,.18)}
    .message__calendar-confirm{display:flex;justify-content:space-between;align-items:center;gap:.75rem;padding:.6rem;border:1px dashed rgba(59,130,246,.45);border-radius:.7rem;background:rgba(59,130,246,.08)}
    .message__calendar-confirm-button{border:none;border-radius:.55rem;padding:.35rem .6rem;background:#7f13ec;color:#fff;font-size:.75rem;font-weight:700;cursor:pointer}
    @media (max-width:520px){.message__calendar-week{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function calendarDebug(...args) {
  try {
    console.debug('[calendar]', ...args);
  } catch (error) {
    // ignorar
  }
}

function setConversationId(value) {
  if (!value) return;
  calendarDebug('setConversationId', value);
  state.conversationId = value;
  if (elements.chatInput) {
    elements.chatInput.dataset.conversationId = value;
  }
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function groupSlotsByDay(slots, timezone) {
  const groups = new Map();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  slots
    .filter((slot) => slot && slot.start_at)
    .forEach((slot) => {
      const slotTZ = slot.timezone || timezone;
      const slotDate = new Date(slot.start_at);
      if (Number.isNaN(slotDate.getTime())) {
        return;
      }
      const key = slot.local_date || formatter.format(slotDate);
      if (!groups.has(key)) {
        groups.set(key, {
          date: slotDate,
          timezone: slotTZ,
          slots: [],
        });
      }
      groups.get(key).slots.push(slot);
    });
  return Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function renderWeeklyNavigation(header, availability) {
  const nav = document.createElement('div');
  nav.className = 'message__calendar-nav';
  const rangeStart = availability?.window_start ? new Date(availability.window_start) : null;
  const rangeEnd = availability?.window_end ? new Date(availability.window_end) : null;
  const formatter = new Intl.DateTimeFormat('es-MX', { month: 'short', day: 'numeric' });
  const label = document.createElement('span');
  label.className = 'message__calendar-nav-label';
  if (rangeStart && rangeEnd && !Number.isNaN(rangeStart.getTime()) && !Number.isNaN(rangeEnd.getTime())) {
    label.textContent = `Mostrando ${formatter.format(rangeStart)} - ${formatter.format(rangeEnd)}`;
  } else {
    label.textContent = 'Mostrando semana disponible';
  }
  nav.appendChild(label);
  header.appendChild(nav);
}

function renderAvailabilityCalendar(availability) {
  const timezone = availability?.timezone || 'America/Mexico_City';
  calendarDebug('renderAvailabilityCalendar', {
    timezone,
    windowStart: availability?.window_start,
    windowEnd: availability?.window_end,
    slots: Array.isArray(availability?.slots) ? availability.slots.length : 0,
  });
  const wrapper = document.createElement('div');
  wrapper.className = 'message__calendar';

  const header = document.createElement('div');
  header.className = 'message__calendar-header';

  const title = document.createElement('div');
  title.className = 'message__calendar-title';
  title.textContent = 'Horarios disponibles';
  header.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.className = 'message__calendar-subtitle';
  subtitle.textContent = `Zona horaria: ${normaliseTimezoneLabel(timezone)}`;
  header.appendChild(subtitle);

  if (availability?.window_start && availability?.window_end) {
    const rangeStart = new Date(availability.window_start);
    const rangeEnd = new Date(availability.window_end);
    if (!Number.isNaN(rangeStart.getTime()) && !Number.isNaN(rangeEnd.getTime())) {
      const rangeFormatter = new Intl.DateTimeFormat('es-MX', {
        month: 'short',
        day: '2-digit',
      });
      const rangeText = document.createElement('div');
      rangeText.className = 'message__calendar-window';
      rangeText.textContent = `Disponible del ${rangeFormatter.format(rangeStart)} al ${rangeFormatter.format(
        rangeEnd,
      )}`;
      header.appendChild(rangeText);
    }
  }

  renderWeeklyNavigation(header, availability);
  wrapper.appendChild(header);

  const slots = Array.isArray(availability?.slots) ? availability.slots : [];
  if (!slots.length) {
    const empty = document.createElement('div');
    empty.className = 'message__calendar-empty';
    empty.textContent = 'Por ahora no hay espacios libres. Avísame si quieres que revise otra fecha.';
    wrapper.appendChild(empty);
    return wrapper;
  }

  const groups = groupSlotsByDay(slots, timezone);
  const selectedSlotId = calendarState.selectedSlotId;

  const grid = document.createElement('div');
  grid.className = 'message__calendar-week';

  const locale = 'es-MX';
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  groups.forEach((group) => {
    const column = document.createElement('div');
    column.className = 'message__calendar-column';

    const headerEl = document.createElement('div');
    headerEl.className = 'message__calendar-column-head';
    headerEl.innerHTML = `
      <span class="message__calendar-column-day">${capitalize(dayFormatter.format(group.date))}</span>
      <span class="message__calendar-column-count">
        ${group.slots.length === 1 ? '1 horario' : `${group.slots.length} horarios`}
      </span>
    `;

    const slotList = document.createElement('div');
    slotList.className = 'message__calendar-column-slots';

    group.slots
      .slice()
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .forEach((slot) => {
        const slotStart = new Date(slot.start_at);
        if (Number.isNaN(slotStart.getTime())) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'message__calendar-slot';
        button.textContent = slot.local_time || timeFormatter.format(slotStart);
        button.dataset.slotId = slot.slot_id || `${slot.start_at}`;

        if (selectedSlotId === button.dataset.slotId) {
          button.classList.add('is-selected');
        }

        button.addEventListener('click', () => {
          calendarState.selectedSlotId = button.dataset.slotId;
          handleCalendarSlotSelection(slot, timezone);
          const allButtons = wrapper.querySelectorAll('.message__calendar-slot');
          allButtons.forEach((btn) => btn.classList.remove('is-selected'));
          button.classList.add('is-selected');
        });

        slotList.appendChild(button);
      });

    column.appendChild(headerEl);
    column.appendChild(slotList);
    grid.appendChild(column);
  });

  wrapper.appendChild(grid);

  const hint = document.createElement('p');
  hint.className = 'message__calendar-hint';
  hint.textContent = 'Toca un horario para colocarlo en el mensaje.';
  wrapper.appendChild(hint);

  return wrapper;
}

function appendCalendarToChat(calendarElement) {
  if (!elements.chatLog) return;
  const lastMessage = elements.chatLog.querySelector('.message--assistant:last-of-type');
  if (lastMessage) {
    const availabilityNode = lastMessage.querySelector('.message__calendar');
    if (availabilityNode && availabilityNode.parentElement === lastMessage) {
      availabilityNode.replaceWith(calendarElement);
      return;
    }
  }
  elements.chatLog.appendChild(calendarElement);
}

let config = { ...defaultConfig };
let freshLoad = true;

export function initialiseChat(options = {}) {
  config = { ...defaultConfig, ...options };
  ensureCalendarInlineStyles();

  elements.chatLog = options.chatLog ?? document.getElementById('chat-log');
  elements.chatForm = options.chatForm ?? document.getElementById('chat-form');
  elements.chatInput = options.chatInput ?? document.getElementById('chat-input');
  elements.chatAttachmentButton =
    options.chatAttachmentButton ?? document.getElementById('chat-attachment-button');
  elements.chatFileInput = options.chatFileInput ?? document.getElementById('chat-file-input');
  elements.chatAttachments = options.chatAttachments ?? document.getElementById('chat-attachments');
  elements.chatSubmitButton =
    options.chatSubmitButton ?? elements.chatForm?.querySelector?.('button[type="submit"]') ?? null;

  state.chatEnabled =
    Boolean(elements.chatLog) && Boolean(elements.chatForm) && Boolean(elements.chatInput);

  if (!state.chatEnabled) {
    return {
      start: () => {},
      stop: () => {},
    };
  }

  state.sessionId = loadSessionId(
    config.storageSessionKey,
    config.persistSession,
  );
  state.visitRegistered = false;

  elements.chatForm.addEventListener('submit', handleSubmit);
  elements.chatInput.addEventListener('input', updateComposerState);

  if (elements.chatAttachmentButton && elements.chatFileInput) {
    elements.chatAttachmentButton.addEventListener('click', handleAttachmentButtonClick);
    elements.chatFileInput.addEventListener('change', handleAttachmentFileChange);
  }

  renderPendingAttachments();
  updateComposerState();

  void syncHistory({ force: true }).finally(() => {
    startHistoryPolling();
  });

  if (config.autoLifecycle !== false) {
    setupLifecycleListeners();
  }

  return {
    start: startHistoryPolling,
    stop: stopHistoryPolling,
  };
}

export function startHistoryPolling() {
  if (!state.chatEnabled) return;
  stopHistoryPolling();
  state.historyPollingTimer = window.setInterval(() => {
    void syncHistory();
  }, config.historyIntervalMs);
}

export function stopHistoryPolling() {
  if (!state.chatEnabled) return;
  if (state.historyPollingTimer) {
    window.clearInterval(state.historyPollingTimer);
    state.historyPollingTimer = null;
  }
}

function setupLifecycleListeners() {
  if (state.lifecycleBound || !state.chatEnabled) return;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      try {
        sendSessionClosure({ allowBeacon: true });
      } catch (e) {}
      stopHistoryPolling();
    });
  }
  state.lifecycleBound = true;
}

function handleVisibilityChange() {
  if (!state.chatEnabled) return;
  if (document.hidden) {
    stopHistoryPolling();
    scheduleHiddenTimeout();
  } else {
    clearHiddenTimeout();
    startHistoryPolling();
  }
}

function sendSessionClosure({ allowBeacon = false } = {}) {
  if (!state.sessionId) return false;
  const url = `${config.apiBaseUrl}/close`;
  const clientMeta = collectClientMetadata();
  const payload = { session_id: state.sessionId };
  const metadataPayload = {};
  if (clientMeta && Object.keys(clientMeta).length > 0) {
    metadataPayload.client = clientMeta;
  }
  if (config.tenantAlias) {
    metadataPayload.tenant_alias = config.tenantAlias;
  }
  if (Object.keys(metadataPayload).length > 0) {
    payload.metadata = metadataPayload;
  }
  const jsonPayload = JSON.stringify(payload);
  let sent = false;
  if (allowBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      sent = navigator.sendBeacon(url, new Blob([jsonPayload], { type: 'application/json' }));
    } catch (error) {
      sent = false;
    }
  }
  if (!sent) {
    try {
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonPayload,
        keepalive: true,
        cache: 'no-store',
      });
      sent = true;
    } catch (error) {
      sent = false;
    }
  }
  return sent;
}

function scheduleHiddenTimeout() {
  clearHiddenTimeout();
  const timeout = Number(config.hiddenInactivityTimeoutMs) || 0;
  if (!timeout) return;
  state.hiddenTimeoutHandle = window.setTimeout(() => {
    state.hiddenTimeoutHandle = null;
    try {
      sendSessionClosure({ allowBeacon: false });
      clearPersistedSession();
    } finally {
      try {
        window.location.reload();
      } catch (error) {}
    }
  }, timeout);
}

function clearHiddenTimeout() {
  if (state.hiddenTimeoutHandle) {
    window.clearTimeout(state.hiddenTimeoutHandle);
    state.hiddenTimeoutHandle = null;
  }
}

function clearPersistedSession() {
  try {
    localStorage.removeItem(config.storageSessionKey);
  } catch (error) {
    console.warn('[chat] No se pudo limpiar session_id al expirar inactividad oculta.', error);
  }
  state.sessionId = null;
  state.conversationId = null;
  state.openaiConversationId = null;
  state.lastAssistantResponseId = null;
  state.visitRegistered = false;
}

function getScrollContainer() {
  try {
    const container =
      typeof config.getScrollContainer === 'function' ? config.getScrollContainer() : null;
    if (container) return container;
  } catch (error) {
    console.warn('[chat] No se pudo obtener el contenedor de scroll preferido.', error);
  }
  return document.scrollingElement || document.documentElement || document.body;
}

function isNearViewportBottom(container, tolerance = 160) {
  if (!container) return false;
  const usesDocument =
    container === document.documentElement || container === document.body;
  const viewportHeight = usesDocument
    ? window.innerHeight || container.clientHeight || 0
    : container.clientHeight;
  const scrollTop = usesDocument ? window.scrollY || container.scrollTop : container.scrollTop;
  const distanceToBottom = container.scrollHeight - (scrollTop + viewportHeight);
  return distanceToBottom <= tolerance;
}

function maintainViewportBottom(behavior = 'auto', tolerance, force = false) {
  const container = getScrollContainer();
  if (!container) return;
  if (!force && !isNearViewportBottom(container, tolerance)) return;
  const target = container.scrollHeight;
  const isDocumentContainer =
    container === document.documentElement || container === document.body;

  const fallbackScroll = () => {
    if (isDocumentContainer && typeof window !== 'undefined') {
      window.scrollTo(0, target);
      document.documentElement.scrollTop = target;
      document.body.scrollTop = target;
    } else {
      container.scrollTop = target;
    }
  };

  requestAnimationFrame(() => {
    if (typeof container.scrollTo === 'function') {
      try {
        if (behavior === 'auto') {
          container.scrollTo(0, target);
        } else {
          container.scrollTo({ top: target, behavior });
        }
        return;
      } catch (error) {
        try {
          container.scrollTo(0, target);
          return;
        } catch (legacyError) {
          fallbackScroll();
          return;
        }
      }
    }
    fallbackScroll();
  });
}

function resolveAgentName(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return '';
  }
  const direct = metadata.agent_name;
  if (typeof direct === 'string' && direct.trim().length) {
    return direct.trim();
  }
  const manualAuthor = metadata.manual_author || metadata.manualAuthor;
  if (typeof manualAuthor === 'string' && manualAuthor.trim().length) {
    return manualAuthor.trim();
  }
  const agent = metadata.agent;
  if (agent && typeof agent === 'object') {
    const agentName =
      agent.name ||
      agent.display_name ||
      agent.displayName ||
      agent.full_name ||
      agent.fullName;
    if (typeof agentName === 'string' && agentName.trim().length) {
      return agentName.trim();
    }
  }
  const ownerName = metadata.owner_name || metadata.owner;
  if (typeof ownerName === 'string' && ownerName.trim().length) {
    return ownerName.trim();
  }
  const user = metadata.user;
  if (user && typeof user === 'object') {
    const userName = user.name || user.full_name || user.display_name;
    if (typeof userName === 'string' && userName.trim().length) {
      return userName.trim();
    }
  }
  const author = metadata.author || metadata.author_name || metadata.authorName;
  if (typeof author === 'string' && author.trim().length) {
    return author.trim();
  }
  let extra = metadata.extra;
  if (typeof extra === 'string') {
    try {
      extra = JSON.parse(extra);
    } catch {
      extra = null;
    }
  }
  if (extra && typeof extra === 'object') {
    const fromExtraDirect = extra.agent_name || extra.manual_author || extra.manualAuthor;
    if (typeof fromExtraDirect === 'string' && fromExtraDirect.trim().length) {
      return fromExtraDirect.trim();
    }
    const agentExtra = extra.agent;
    if (agentExtra && typeof agentExtra === 'object') {
      const candidate =
        agentExtra.name ||
        agentExtra.display_name ||
        agentExtra.displayName ||
        agentExtra.full_name ||
        agentExtra.fullName;
      if (typeof candidate === 'string' && candidate.trim().length) {
        return candidate.trim();
      }
    }
    const ownerExtra = extra.owner || extra.owner_name;
    if (typeof ownerExtra === 'string' && ownerExtra.trim().length) {
      return ownerExtra.trim();
    }
    const userExtra = extra.user;
    if (userExtra && typeof userExtra === 'object') {
      const candidate =
        userExtra.name ||
        userExtra.full_name ||
        userExtra.fullName ||
        userExtra.display_name ||
        userExtra.displayName;
      if (typeof candidate === 'string' && candidate.trim().length) {
        return candidate.trim();
      }
    }
    const authorExtra = extra.author || extra.author_name || extra.authorName;
    if (typeof authorExtra === 'string' && authorExtra.trim().length) {
      return authorExtra.trim();
    }
  }
  const emailCandidates = [
    metadata.agent_email,
    metadata.agentEmail,
    metadata.manual_email,
    metadata.manualEmail,
  ];
  for (const candidate of emailCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length) {
      return candidate.trim();
    }
  }
  if (extra && typeof extra === 'object') {
    const extraEmails = [
      extra.agent_email,
      extra.agentEmail,
      extra.manual_email,
      extra.manualEmail,
    ];
    for (const candidate of extraEmails) {
      if (typeof candidate === 'string' && candidate.trim().length) {
        return candidate.trim();
      }
    }
  }
  return '';
}

function createMessageElement(text, role = 'assistant', metadata = null, attachments = []) {
  const wrapper = document.createElement('div');
  wrapper.className = `message message--${role}`;
  if (role === 'human') {
    const label = document.createElement('span');
    let agentName = resolveAgentName(metadata) || 'Miembro del equipo';
    const normalized = agentName.trim().toLowerCase();
    if (normalized === 'agent' || normalized === 'agente') {
      const fallback =
        (metadata && typeof metadata.agent_name === 'string' && metadata.agent_name.trim()) ||
        (metadata && typeof metadata.manual_author === 'string' && metadata.manual_author.trim()) ||
        (metadata && typeof metadata.manualAuthor === 'string' && metadata.manualAuthor.trim());
      if (fallback) {
        agentName = fallback;
      } else {
        agentName = 'Miembro del equipo';
      }
    }
    label.className = 'message__label message__label--human';
    label.textContent = `Humano: ${agentName}`;
    wrapper.appendChild(label);
  }
  if (text && text.length) {
    const body = document.createElement('div');
    body.className = 'message__body';
    body.innerText = text;
    wrapper.appendChild(body);
  }

  if (metadata && typeof metadata === 'object' && metadata.availability) {
    const calendar = renderAvailabilityCalendar(metadata.availability);
    wrapper.appendChild(calendar);
  }

  if (Array.isArray(attachments) && attachments.length) {
    const list = document.createElement('div');
    list.className = 'message__attachments';
    attachments.forEach((attachment) => {
      if (!attachment || typeof attachment.url !== 'string') return;
      const item = document.createElement('a');
      item.className = 'message__attachment';
      item.href = attachment.url;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
      const name = typeof attachment.name === 'string' && attachment.name.length ? attachment.name : attachment.url;
      item.textContent = name;
      if (attachment.size) {
        const size = document.createElement('span');
        size.className = 'message__attachment-size';
        size.textContent = `${(attachment.size / 1024).toFixed(1)} KB`;
        item.appendChild(size);
      }
      list.appendChild(item);
    });
    wrapper.appendChild(list);
  }
  return wrapper;
}

function normalizeScrollOptions(options) {
  if (typeof options === 'string') {
    return { behavior: options };
  }
  return options || {};
}

function createAttachmentId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function updateComposerState() {
  if (!elements.chatSubmitButton || !elements.chatInput) return;
  const hasText = elements.chatInput.value.trim().length > 0;
  const hasAttachments = state.pendingAttachments.length > 0;
  elements.chatSubmitButton.disabled = state.uploadingAttachments || (!hasText && !hasAttachments);
}

function renderPendingAttachments() {
  if (!elements.chatAttachments) return;
  elements.chatAttachments.innerHTML = '';

  if (state.uploadingAttachments) {
    const uploadingNotice = document.createElement('div');
    uploadingNotice.className = 'composer-attachments__uploading';
    uploadingNotice.textContent = 'Subiendo archivos…';
    elements.chatAttachments.appendChild(uploadingNotice);
  }

  if (state.pendingAttachments.length) {
    const list = document.createElement('div');
    list.className = 'composer-attachments__list';
    state.pendingAttachments.forEach((attachment) => {
      const item = document.createElement('div');
      item.className = 'composer-attachments__item';

      const name = document.createElement('span');
      name.textContent = attachment.name || attachment.url;
      item.appendChild(name);

      if (attachment.size) {
        const sizeLabel = document.createElement('span');
        sizeLabel.className = 'composer-attachments__size';
        sizeLabel.textContent = `${(attachment.size / 1024).toFixed(1)} KB`;
        item.appendChild(sizeLabel);
      }

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'composer-attachments__remove';
      removeButton.textContent = '×';
      removeButton.addEventListener('click', () => {
        removePendingAttachment(attachment.id);
      });
      item.appendChild(removeButton);

      list.appendChild(item);
    });
    elements.chatAttachments.appendChild(list);
  }

  if (state.attachmentError) {
    const error = document.createElement('div');
    error.className = 'composer-attachments__error';
    error.textContent = state.attachmentError;
    elements.chatAttachments.appendChild(error);
  }
}

function removePendingAttachment(id) {
  state.pendingAttachments = state.pendingAttachments.filter((item) => item.id !== id);
  if (!state.pendingAttachments.length) {
    state.attachmentError = null;
  }
  renderPendingAttachments();
  updateComposerState();
}

function coerceAttachmentSize(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value.trim());
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractAttachmentsFromMessage(item) {
  if (!item) return [];
  const direct = Array.isArray(item.attachments) ? item.attachments : [];
  const metadataAttachments =
    item.metadata && Array.isArray(item.metadata.attachments) ? item.metadata.attachments : [];

  const merged = new Map();
  const sources = [...direct, ...metadataAttachments];

  sources.forEach((attachment) => {
    if (!attachment || typeof attachment.url !== 'string') return;
    const url = attachment.url;
    const existing = merged.get(url) || {};

    const currentSize = coerceAttachmentSize(existing.size);
    const incomingSize = coerceAttachmentSize(attachment.size);
    const size = typeof incomingSize === 'number' ? incomingSize : currentSize;

    const name =
      typeof attachment.name === 'string' && attachment.name.trim().length
        ? attachment.name.trim()
        : typeof existing.name === 'string' && existing.name.trim().length
          ? existing.name
          : undefined;

    merged.set(url, {
      ...existing,
      ...attachment,
      url,
      name,
      size,
      mime: attachment.mime || existing.mime,
      provider_id: attachment.provider_id || existing.provider_id,
      path: attachment.path || existing.path,
    });
  });

  return Array.from(merged.values());
}

function handleAttachmentButtonClick(event) {
  event.preventDefault();
  if (!elements.chatFileInput || state.uploadingAttachments) return;
  elements.chatFileInput.click();
}

async function handleAttachmentFileChange(event) {
  const input = event.currentTarget;
  await uploadSelectedFiles(input?.files || null);
  if (input) {
    input.value = "";
  }
}

async function uploadSelectedFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  state.uploadingAttachments = true;
  state.attachmentError = null;
  renderPendingAttachments();
  updateComposerState();

  try {
    const files = Array.from(fileList);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file, file.name);
      if (state.conversationId) {
        formData.append("conversation_id", state.conversationId);
      }
      if (state.sessionId) {
        formData.append("session_id", state.sessionId);
      }

      const response = await fetch(`${config.apiBaseUrl}/uploads`, {
        method: "POST",
        body: formData,
        cache: "no-store",
      });

      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch (error) {
        console.error("[chat] upload parse failed", error);
        throw new Error("No se pudo subir el archivo");
      }

      if (!response.ok) {
        const message = typeof payload.error === "string" ? payload.error : "No se pudo subir el archivo";
        throw new Error(message);
      }

      const urlValue = typeof payload.url === "string" && payload.url.length ? payload.url : null;
      if (!urlValue) {
        throw new Error("No se pudo obtener la URL del archivo");
      }

      const sizeValue = payload.size;
      let size = typeof sizeValue === "number" ? sizeValue : undefined;
      if (typeof sizeValue === "string") {
        const parsed = Number(sizeValue);
        if (!Number.isNaN(parsed)) {
          size = parsed;
        }
      }
      if (size === undefined && typeof file.size === "number") {
        size = file.size;
      }

      const attachment = {
        id: createAttachmentId(),
        url: urlValue,
        name: typeof payload.name === "string" && payload.name.length ? payload.name : file.name,
        mime: typeof payload.mime === "string" ? payload.mime : file.type,
        size,
        provider_id: typeof payload.provider_id === "string" ? payload.provider_id : null,
        path: typeof payload.path === "string" ? payload.path : null,
      };
      state.pendingAttachments.push(attachment);
    }
  } catch (error) {
    console.error("[chat] attachment upload failed", error);
    state.attachmentError =
      error instanceof Error && error.message
        ? error.message
        : "No se pudo cargar el archivo. Inténtalo de nuevo.";
  } finally {
    state.uploadingAttachments = false;
    renderPendingAttachments();
    updateComposerState();
  }
}

function appendMessage(text, role = 'assistant', metadata = null, scrollOptions = {}, attachments = []) {
  if (!elements.chatLog) return null;
  const { behavior = 'auto', force = false, tolerance } = normalizeScrollOptions(scrollOptions);
  const container = getScrollContainer();
  const shouldStick = force || isNearViewportBottom(container, tolerance);
  const element = createMessageElement(text, role, metadata, attachments);
  elements.chatLog.appendChild(element);
  if (shouldStick) {
    maintainViewportBottom(behavior, tolerance, force);
  }
  return element;
}

function renderTypingIndicator() {
  if (!elements.chatLog) return;
  const bubble = document.createElement('div');
  bubble.className = 'message message--assistant';
  bubble.setAttribute('data-typing', 'true');

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';

  bubble.appendChild(indicator);
  const container = getScrollContainer();
  const shouldStick = isNearViewportBottom(container);
  elements.chatLog.appendChild(bubble);
  if (shouldStick) {
    maintainViewportBottom('auto');
  }
  state.typingBubble = bubble;
  state.assistantReplyPending = true;
}

function removeTypingIndicator({ preservePending = false } = {}) {
  if (state.typingBubble && state.typingBubble.parentNode) {
    state.typingBubble.parentNode.removeChild(state.typingBubble);
  }
  state.typingBubble = null;
  if (!preservePending) {
    state.assistantReplyPending = false;
  }
}

function normaliseSenderType(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.length) return null;
  if (trimmed.startsWith('human')) return 'human';
  if (trimmed.startsWith('assistant')) return 'assistant';
  if (trimmed.startsWith('user')) return 'user';
  return null;
}

function extractSenderTypeFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const record = metadata;
  const candidates = [
    record.sender_type,
    record.senderType,
    record.sender,
    record.author_type,
    record.agent_type,
  ];
  const sender = record.sender;
  if (sender && typeof sender === 'object') {
    candidates.push(sender.type, sender.sender_type, sender.senderType);
  }
  const agent = record.agent;
  if (agent && typeof agent === 'object') {
    candidates.push(agent.type, agent.sender_type, agent.senderType);
  }
  let extra = record.extra;
  if (typeof extra === 'string') {
    try {
      extra = JSON.parse(extra);
    } catch {
      extra = null;
    }
  }
  if (extra && typeof extra === 'object') {
    candidates.push(
      extra.sender_type,
      extra.senderType,
      extra.sender,
      extra.author_type,
      extra.agent_type,
    );
    const extraSender = extra.sender;
    if (extraSender && typeof extraSender === 'object') {
      candidates.push(extraSender.type, extraSender.sender_type, extraSender.senderType);
    }
    const extraAgent = extra.agent;
    if (extraAgent && typeof extraAgent === 'object') {
      candidates.push(extraAgent.type, extraAgent.sender_type, extraAgent.senderType);
    }
  }
  for (const candidate of candidates) {
    const resolved = normaliseSenderType(candidate);
    if (resolved) {
      return resolved;
    }
  }

  const manualFlag =
    record.manual_override ??
    record.manualOverride ??
    record.manual_mode ??
    record.manualMode;
  if (typeof manualFlag === 'boolean' && manualFlag) {
    return 'human';
  }

  const origin = record.origin;
  if (typeof origin === 'string' && origin.toLowerCase().includes('manual')) {
    return 'human';
  }
  const source = record.source;
  if (typeof source === 'string' && source.toLowerCase().includes('manual')) {
    return 'human';
  }
  if (extra && typeof extra === 'object') {
    const extraManualFlag =
      extra.manual_override ??
      extra.manualOverride ??
      extra.manual_mode ??
      extra.manualMode;
    if (typeof extraManualFlag === 'boolean' && extraManualFlag) {
      return 'human';
    }
    const extraOrigin = extra.origin;
    if (typeof extraOrigin === 'string' && extraOrigin.toLowerCase().includes('manual')) {
      return 'human';
    }
    const extraSource = extra.source;
    if (typeof extraSource === 'string' && extraSource.toLowerCase().includes('manual')) {
      return 'human';
    }
  }

  return null;
}

function mapHistoryRole(message) {
  if (!message || message.direction !== 'saliente') {
    return 'user';
  }
  const direct = normaliseSenderType(message.sender_type);
  if (direct === 'human') {
    return 'human';
  }
  if (direct && direct !== 'human') {
    return 'assistant';
  }
  const metadataType = extractSenderTypeFromMetadata(message.metadata);
  if (metadataType === 'human') {
    return 'human';
  }
  if (metadataType && metadataType !== 'human') {
    return 'assistant';
  }
  return 'assistant';
}

function getMessageIds(messages) {
  return (messages || []).map((msg) =>
    String(
      msg?.message_id ??
        msg?.id ??
        `${msg?.direction}-${msg?.created_at}-${msg?.content || ''}`,
    )
  );
}

function getLastMessageElement() {
  if (!elements.chatLog) return null;
  const nodes = elements.chatLog.querySelectorAll('.message');
  for (let i = nodes.length - 1; i >= 0; i--) {
    const el = nodes[i];
    if (!el.hasAttribute('data-typing')) return el;
  }
  return null;
}

function getElementRole(el) {
  if (!el) return null;
  if (el.classList.contains('message--assistant')) return 'assistant';
  if (el.classList.contains('message--user')) return 'user';
  if (el.classList.contains('message--human')) return 'human';
  return null;
}

function removeLocalPlaceholders() {
  if (!elements.chatLog) return;
  let tail = getLastMessageElement();
  while (tail && tail.getAttribute('data-local') === 'true') {
    const parent = tail.parentNode;
    parent?.removeChild(tail);
    tail = getLastMessageElement();
  }
}

function appendHistoryDelta(newItems, options = {}) {
  if (!elements.chatLog || !Array.isArray(newItems) || newItems.length === 0) return;
  const { behavior = 'auto', tolerance } = normalizeScrollOptions(options);
  const container = getScrollContainer();
  const shouldStick = isNearViewportBottom(container, tolerance);

  const hadTyping = !!state.typingBubble;
  if (hadTyping) removeTypingIndicator({ preservePending: true });

  removeLocalPlaceholders();

  const first = newItems[0];
  const firstRole = mapHistoryRole(first);
  const firstText = typeof first?.content === 'string' ? first.content : '';
  const lastEl = getLastMessageElement();
  if (lastEl && lastEl.getAttribute('data-local') === 'true') {
    const lastBody = lastEl.querySelector('.message__body');
    const lastText = lastBody ? lastBody.innerText : '';
    const lastRole = getElementRole(lastEl);
    if (lastText === firstText && lastRole === firstRole) {
      lastEl.parentNode.removeChild(lastEl);
    }
  }

  for (const item of newItems) {
    const role = mapHistoryRole(item);
    const text = typeof item.content === 'string' ? item.content : '';
    const metadata = item.metadata || null;
    const attachments = extractAttachmentsFromMessage(item);

    const tail = getLastMessageElement();
    if (tail) {
      const tailBody = tail.querySelector('.message__body');
      const tailText = tailBody ? tailBody.innerText : '';
      const tailRole = getElementRole(tail);
      if (tailText === text && tailRole === role) {
        if (tail.getAttribute('data-local') === 'true') {
          tail.parentNode.removeChild(tail);
        } else {
          continue;
        }
      }
    }

    const el = createMessageElement(text, role, metadata, attachments);
    elements.chatLog.appendChild(el);
  }

  if (hadTyping) renderTypingIndicator();
  if (shouldStick) maintainViewportBottom(behavior, tolerance);
}

function renderHistoryMessages(messages, options = {}) {
  if (!elements.chatLog) return;
  const { force = false, behavior = 'auto', tolerance } = normalizeScrollOptions(options);
  const shouldRestoreTyping = state.assistantReplyPending;
  if (shouldRestoreTyping) {
    removeTypingIndicator({ preservePending: true });
  } else {
    removeTypingIndicator();
  }
  const container = getScrollContainer();
  const shouldStick = force || isNearViewportBottom(container, tolerance);
  elements.chatLog.textContent = '';
  for (const item of messages || []) {
    const role = mapHistoryRole(item);
    const text = typeof item.content === 'string' ? item.content : '';
    const attachments = extractAttachmentsFromMessage(item);
    const el = createMessageElement(text, role, item.metadata || null, attachments);
    elements.chatLog.appendChild(el);
  }
  if (shouldRestoreTyping) {
    renderTypingIndicator();
  }
  if (shouldStick) {
    maintainViewportBottom(behavior, tolerance, force);
  }
}

async function syncHistory({ force = false } = {}) {
  if (!state.chatEnabled || state.syncingHistory) return;
  state.syncingHistory = true;
  try {
    const qs = new URLSearchParams({
      session_id: state.sessionId,
      limit: String(config.historyLimit),
    });
    const response = await fetch(`${config.apiBaseUrl}/messages?${qs.toString()}`, {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    if (data?.conversation_id) {
      setConversationId(data.conversation_id);
    }
    state.manualMode = Boolean(data?.manual_mode);
    const nextIds = getMessageIds(messages);
    if (!force) {
      const unchanged =
        nextIds.length === state.lastHistoryIds.length &&
        nextIds.every((id, idx) => id === state.lastHistoryIds[idx]);
      if (unchanged) return;

      const isExtension =
        nextIds.length >= state.lastHistoryIds.length &&
        state.lastHistoryIds.every((id, idx) => id === nextIds[idx]);
      if (isExtension) {
        const delta = messages.slice(state.lastHistoryIds.length);
        appendHistoryDelta(delta, { behavior: 'auto' });
        state.lastHistoryIds = nextIds;
        return;
      }
    }
    renderHistoryMessages(messages, { force, behavior: force ? 'smooth' : 'auto' });
    state.lastHistoryIds = nextIds;
  } catch (error) {
    console.error('[chat] No se pudo sincronizar historial del webchat:', error);
  } finally {
    state.syncingHistory = false;
  }
}

function getFallbackResponse() {
  return config.fallbackMessage;
}

function generateSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  const random = Math.random().toString(16).slice(2);
  return `sess-${Date.now()}-${random}`;
}

function generateClientMessageId() {
  if (window.crypto?.randomUUID) {
    return `msg-${window.crypto.randomUUID()}`;
  }
  const random = Math.random().toString(16).slice(2);
  return `msg-${Date.now()}-${random}`;
}

function loadSessionId(storageKey, shouldPersist = true) {
  const persist = shouldPersist !== false;
  if (persist) {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && typeof stored === 'string' && stored.trim().length > 0) {
        return stored;
      }
    } catch (error) {
      console.warn('[chat] No se pudo recuperar session_id previo.', error);
    }
  } else {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('[chat] No se pudo limpiar session_id previo.', error);
    }
  }

  const fresh = generateSessionId();
  if (persist) {
    try {
      localStorage.setItem(storageKey, fresh);
    } catch (error) {
      console.warn('[chat] No se pudo persistir el session_id nuevo.', error);
    }
  }
  return fresh;
}

function detectDeviceType(userAgent, screenInfo) {
  const ua = (userAgent || '').toLowerCase();
  const width = screenInfo && Number(screenInfo.width);
  const height = screenInfo && Number(screenInfo.height);
  const maxDim = Math.max(width || 0, height || 0);
  if (/mobile|iphone|ipod|android.*mobile|windows phone/.test(ua)) {
    return 'mobile';
  }
  if (/ipad|tablet|android/.test(ua) && !/mobile/.test(ua)) {
    return 'tablet';
  }
  if (maxDim && maxDim < 760 && /android/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

function collectClientMetadata() {
  const nav = typeof window !== 'undefined' ? window.navigator : undefined;
  const scr = typeof window !== 'undefined' ? window.screen : undefined;
  const ua = nav?.userAgent || '';
  const screenInfo = scr
    ? {
        width: scr.width,
        height: scr.height,
        availWidth: scr.availWidth,
        availHeight: scr.availHeight,
        colorDepth: scr.colorDepth,
        pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
      }
    : undefined;
  const tz =
    typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined;

  return {
    user_agent: ua,
    platform: nav?.platform,
    language: nav?.language,
    languages: Array.isArray(nav?.languages) ? nav.languages : undefined,
    hardware_concurrency: nav?.hardwareConcurrency,
    device_memory: nav?.deviceMemory,
    screen: screenInfo,
    timezone: tz,
    prefers_dark_mode:
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : undefined,
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    location_href: typeof window !== 'undefined' ? window.location.href : undefined,
    device_type: detectDeviceType(ua, screenInfo),
  };
}

async function ensureVisitRegistered(force = false) {
  if (!state.chatEnabled || !state.sessionId) return;
  if (state.visitRegistered && !force) return;
  const clientMeta = collectClientMetadata();
  const payload = { session_id: state.sessionId };
  const metadataPayload = {};
  if (clientMeta && Object.keys(clientMeta).length > 0) {
    metadataPayload.client = clientMeta;
  }
  if (config.tenantAlias) {
    metadataPayload.tenant_alias = config.tenantAlias;
  }
  if (Object.keys(metadataPayload).length > 0) {
    payload.metadata = metadataPayload;
  }
  try {
    const response = await fetch(`${config.apiBaseUrl}/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      keepalive: true,
    });
    if (response.ok) {
      state.visitRegistered = true;
    }
  } catch (error) {
    console.warn('[chat] No se pudo registrar la visita inicial.', error);
  }
}

async function sendToAssistant(message, clientMessageId, attachments = []) {
  if (!state.chatEnabled) return { reply: getFallbackResponse(), metadata: {} };

  const MAX_RETRIES = 2;
  const RETRY_DELAYS_MS = [1000, 2000];

  async function doFetch() {
    await ensureVisitRegistered();
    const clientMeta = collectClientMetadata();
    const payload = {
      session_id: state.sessionId,
      author: 'user',
      content: message,
      locale: navigator.language || 'es-MX',
      fresh_load: freshLoad === true,
    };
    const metaPayload = {};
    if (state.conversationId) metaPayload.conversation_id = state.conversationId;
    if (state.openaiConversationId) {
      metaPayload.openai_conversation_id = state.openaiConversationId;
    }
    if (state.lastAssistantResponseId) {
      metaPayload.assistant_response_id = state.lastAssistantResponseId;
    }
    if (clientMeta && Object.keys(clientMeta).length > 0) {
      metaPayload.client = clientMeta;
    }
    if (config.tenantAlias) {
      metaPayload.tenant_alias = config.tenantAlias;
    }
    payload.metadata = metaPayload;
    if (clientMessageId) {
      payload.client_message_id = clientMessageId;
    }
    if (Array.isArray(attachments) && attachments.length) {
      payload.attachments = attachments.map((attachment) => ({
        url: attachment.url,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        provider_id: attachment.provider_id,
        path: attachment.path,
      }));
    }

    const response = await fetch(`${config.apiBaseUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ''}`);
    }
    const data = await response.json();
    freshLoad = false;
    const metadata = data?.metadata || {};
    if (!data?.reply && !metadata.manual_mode) {
      throw new Error('Respuesta vacía del asistente');
    }
    return data;
  }

  let attempt = 0;
  while (true) {
    try {
      return await doFetch();
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] || 1500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!state.chatEnabled || !elements.chatInput) return;

  const userMessage = elements.chatInput.value.trim();
  const attachments = state.pendingAttachments.slice();

  if (!userMessage && attachments.length === 0) {
    return;
  }

  elements.chatInput.value = '';
  state.pendingAttachments = [];
  state.attachmentError = null;

  const localUserMessage = appendMessage(userMessage, 'user', null, {
    behavior: 'smooth',
    force: true,
  }, attachments);
  if (localUserMessage) localUserMessage.setAttribute('data-local', 'true');
  elements.chatInput.focus();
  renderPendingAttachments();
  updateComposerState();

  const clientMessageId = generateClientMessageId();
  enqueueAssistantReply(userMessage, clientMessageId, attachments);
}

function enqueueAssistantReply(message, clientMessageId, attachments) {
  if (!state.chatEnabled) return;
  state.assistantQueue = state.assistantQueue
    .then(() => handleAssistantReply(message, clientMessageId, attachments))
    .catch((error) => {
      console.error('[chat] Error en la cola de respuestas:', error);
    });
}

async function handleAssistantReply(message, clientMessageId, attachments) {
  if (!state.chatEnabled) return;
  try {
    renderTypingIndicator();
    const data = await sendToAssistant(message, clientMessageId, attachments);
    const reply = data.reply;
    const metadata = data && typeof data.metadata === 'object' ? data.metadata : {};
    const responseAttachments = Array.isArray(data.attachments)
      ? data.attachments
      : Array.isArray(metadata.attachments)
        ? metadata.attachments
        : [];
    if (metadata.conversation_id) {
      setConversationId(metadata.conversation_id);
    }
    if (metadata.openai_conversation_id) {
      state.openaiConversationId = metadata.openai_conversation_id;
    }
    if (metadata.assistant_response_id) {
      state.lastAssistantResponseId = metadata.assistant_response_id;
    }
    state.manualMode = Boolean(metadata.manual_mode);

    removeTypingIndicator();
    if (!metadata.manual_mode && reply) {
      const localAssistant = appendMessage(reply, 'assistant', metadata, {
        behavior: 'smooth',
        force: true,
      }, responseAttachments);
      if (localAssistant) localAssistant.setAttribute('data-local', 'true');
    }
    void syncHistory();
  } catch (error) {
    removeTypingIndicator();
    const fallback = appendMessage(getFallbackResponse(), 'assistant', null, {
      behavior: 'smooth',
      force: true,
    });
    if (fallback) fallback.setAttribute('data-local', 'true');
    console.error('Error obteniendo respuesta de TalIA:', error);
    void syncHistory();
  }
}
