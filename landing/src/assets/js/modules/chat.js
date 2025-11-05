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
  getScrollContainer: () => {
    const layout = document.querySelector('.layout');
    return layout || document.scrollingElement || document.documentElement;
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

let config = { ...defaultConfig };
let freshLoad = true;

export function initialiseChat(options = {}) {
  config = { ...defaultConfig, ...options };

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
  void ensureVisitRegistered();

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
  void ensureVisitRegistered(true);
  const url = `${config.apiBaseUrl}/close`;
  const clientMeta = collectClientMetadata();
  const payload = { session_id: state.sessionId };
  if (clientMeta && Object.keys(clientMeta).length > 0) {
    payload.metadata = { client: clientMeta };
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

function createMessageElement(text, role = 'assistant', metadata = null, attachments = []) {
  const wrapper = document.createElement('div');
  wrapper.className = `message message--${role}`;
  if (role === 'human') {
    const label = document.createElement('span');
    label.className = 'message__label';
    const agentName =
      metadata && typeof metadata.agent_name === 'string' && metadata.agent_name.trim()
        ? metadata.agent_name.trim()
        : 'sin nombre';
    label.textContent = `Este mensaje es de 'humano': '${agentName}', ya no hablas con Tal-IA`;
    wrapper.appendChild(label);
  }
  if (text && text.length) {
    const body = document.createElement('div');
    body.className = 'message__body';
    body.innerText = text;
    wrapper.appendChild(body);
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

function extractAttachmentsFromMessage(item) {
  if (!item) return [];
  const direct = Array.isArray(item.attachments) ? item.attachments : [];
  const metadataAttachments =
    item.metadata && Array.isArray(item.metadata.attachments) ? item.metadata.attachments : [];

  const all = [...direct, ...metadataAttachments];
  const seen = new Set();
  return all.filter((attachment) => {
    if (!attachment || typeof attachment.url !== 'string') return false;
    const key = attachment.url + (attachment.name || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  await ensureVisitRegistered();
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

function mapHistoryRole(message) {
  if (!message || message.direction !== 'saliente') {
    return 'user';
  }
  const senderType =
    typeof message.sender_type === 'string' ? message.sender_type.toLowerCase() : '';
  if (senderType.startsWith('human')) return 'human';
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
      state.conversationId = data.conversation_id;
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
  if (clientMeta && Object.keys(clientMeta).length > 0) {
    payload.metadata = { client: clientMeta };
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
    void ensureVisitRegistered();
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
    metaPayload.client = clientMeta;
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
      state.conversationId = metadata.conversation_id;
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
