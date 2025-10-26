const themeSelect = document.getElementById('theme-select');
const body = document.body;
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const menuToggle = document.getElementById('menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');

// Contenedor donde insertaremos elementos en el menú móvil
const mobileMenuList = mobileMenu ? mobileMenu.querySelector('.mobile-menu-list') : null;

// Breakpoint para tratar como "móvil"
const MQ_MOBILE = window.matchMedia('(max-width: 960px)');

// Guardar posiciones originales para restaurar en escritorio
const originalPositions = new Map();

function rememberPosition(node) {
  if (!node || originalPositions.has(node)) return;
  originalPositions.set(node, { parent: node.parentNode, next: node.nextSibling });
}

function restorePosition(node) {
  const pos = originalPositions.get(node);
  if (!pos) return;
  pos.parent.insertBefore(node, pos.next);
}
let themeManager = null;

async function initialiseTheme() {
  if (!body) return;
  try {
    const module = await import('/api/panel/assets/js/theme.js');
    themeManager = module.createThemeManager({
      selectEl: themeSelect,
      bodyEl: body,
      metaEl: themeColorMeta,
      storageKey: 'talia-theme-preference-v2',
    });
  } catch (error) {
    console.warn('[landing] No se pudo cargar el gestor de temas compartido, usando fallback.', error);
    fallbackInitialiseTheme();
  }
}

function fallbackInitialiseTheme() {
  if (!body) return;
  const THEMES = ['theme-aurora', 'theme-ice', 'theme-void'];
  const THEME_META = {
    'theme-aurora': { themeColor: '#060414' },
    'theme-ice': { themeColor: '#fdf4ff' },
    'theme-void': { themeColor: '#050505' },
  };
  const storageKey = 'talia-theme-preference-v2';

  const defaultTheme =
    body.className.split(' ').find((cls) => THEMES.includes(cls)) || THEMES[0];

  let storedTheme = null;
  try {
    storedTheme = window.localStorage.getItem(storageKey);
  } catch (error) {
    console.warn('[landing] No se pudo leer preferencia de tema.', error);
  }

  const applyTheme = (theme, { persist = true } = {}) => {
    const selected = THEMES.includes(theme) ? theme : THEMES[0];
    body.classList.remove(...THEMES);
    body.classList.add(selected);
    if (themeSelect) {
      themeSelect.value = selected;
    }
    const metaCfg = THEME_META[selected];
    if (themeColorMeta && metaCfg?.themeColor) {
      themeColorMeta.setAttribute('content', metaCfg.themeColor);
    }
    if (persist) {
      try {
        window.localStorage.setItem(storageKey, selected);
      } catch (error) {
        console.warn('[landing] No se pudo guardar la preferencia de tema.', error);
      }
    }
  };

  applyTheme(storedTheme || defaultTheme, { persist: false });

  if (themeSelect) {
    themeSelect.addEventListener('change', (event) => {
      applyTheme(event.target.value);
    });
  }
}

const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const currentYearEl = document.getElementById('current-year');

let typingBubble = null;
let assistantReplyPending = false;

const FALLBACK_MESSAGE = 'Tu mensaje llegó, pero tuve un problema momentáneo al responder. Intentemos de nuevo en unos segundos o envíame otra línea.';

function getScrollContainer() {
  const layout = document.querySelector('.layout');
  return layout || document.scrollingElement || document.documentElement;
}

function isNearViewportBottom(container, tolerance = 160) {
  if (!container) return false;
  const usesDocument =
    container === document.documentElement || container === document.body;
  const viewportHeight = usesDocument
    ? (window.innerHeight || container.clientHeight || 0)
    : container.clientHeight;
  const scrollTop = usesDocument ? (window.scrollY || container.scrollTop) : container.scrollTop;
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

function createMessageElement(text, role = 'assistant', metadata = null) {
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
  const body = document.createElement('div');
  body.className = 'message__body';
  body.innerText = text;
  wrapper.appendChild(body);
  return wrapper;
}

function normalizeScrollOptions(options) {
  if (typeof options === 'string') {
    return { behavior: options };
  }
  return options || {};
}

function appendMessage(text, role = 'assistant', metadata = null, scrollOptions = {}) {
  if (!chatLog) return;
  const { behavior = 'auto', force = false, tolerance } = normalizeScrollOptions(scrollOptions);
  const container = getScrollContainer();
  const shouldStick = force || isNearViewportBottom(container, tolerance);
  const element = createMessageElement(text, role, metadata);
  chatLog.appendChild(element);
  if (shouldStick) {
    maintainViewportBottom(behavior, tolerance, force);
  }
}

function renderTypingIndicator() {
  if (!chatLog) return;
  const bubble = document.createElement('div');
  bubble.className = 'message message--assistant';
  bubble.setAttribute('data-typing', 'true');

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';

  bubble.appendChild(indicator);
  const container = getScrollContainer();
  const shouldStick = isNearViewportBottom(container);
  chatLog.appendChild(bubble);
  if (shouldStick) {
    maintainViewportBottom('auto');
  }
  typingBubble = bubble;
  assistantReplyPending = true;
}

function removeTypingIndicator({ preservePending = false } = {}) {
  if (typingBubble && typingBubble.parentNode) {
    typingBubble.parentNode.removeChild(typingBubble);
  }
  typingBubble = null;
  if (!preservePending) {
    assistantReplyPending = false;
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

function historyIdsEqual(messages) {
  const nextIds = (messages || []).map((msg) =>
    String(msg?.message_id ?? `${msg?.direction}-${msg?.created_at}-${msg?.content || ''}`)
  );
  const unchanged =
    nextIds.length === lastHistoryIds.length &&
    nextIds.every((id, index) => id === lastHistoryIds[index]);
  return unchanged;
}

function getMessageIds(messages) {
  return (messages || []).map((msg) =>
    String(msg?.message_id ?? `${msg?.direction}-${msg?.created_at}-${msg?.content || ''}`)
  );
}

function getLastMessageElement() {
  if (!chatLog) return null;
  const nodes = chatLog.querySelectorAll('.message');
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

function appendHistoryDelta(newItems, options = {}) {
  if (!chatLog || !Array.isArray(newItems) || newItems.length === 0) return;
  const { behavior = 'auto', tolerance } = normalizeScrollOptions(options);
  const container = getScrollContainer();
  const shouldStick = isNearViewportBottom(container, tolerance);

  const hadTyping = !!typingBubble;
  if (hadTyping) removeTypingIndicator({ preservePending: true });

  // Deduplicación con eco local: si el primer elemento nuevo es el mismo texto y rol
  // que el último mensaje renderizado marcado como local, lo reemplazamos.
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

    // Evitar duplicados exactos consecutivos (p.ej., si ya fue eco local o ya se agregó)
    const tail = getLastMessageElement();
    if (tail) {
      const tailBody = tail.querySelector('.message__body');
      const tailText = tailBody ? tailBody.innerText : '';
      const tailRole = getElementRole(tail);
      if (tailText === text && tailRole === role) {
        // Si lo último era eco local, reemplazar por la versión del servidor
        if (tail.getAttribute('data-local') === 'true') {
          tail.parentNode.removeChild(tail);
        } else {
          continue; // duplicado exacto; ignorar
        }
      }
    }

    const el = createMessageElement(text, role, metadata);
    chatLog.appendChild(el);
  }

  if (hadTyping) renderTypingIndicator();
  if (shouldStick) maintainViewportBottom(behavior, tolerance);
}

function renderHistoryMessages(messages, options = {}) {
  if (!chatLog) return;
  const { force = false, behavior = 'auto', tolerance } = normalizeScrollOptions(options);
  const shouldRestoreTyping = assistantReplyPending;
  if (shouldRestoreTyping) {
    removeTypingIndicator({ preservePending: true });
  } else {
    removeTypingIndicator();
  }
  const container = getScrollContainer();
  const shouldStick = force || isNearViewportBottom(container, tolerance);
  chatLog.textContent = '';
  for (const item of messages || []) {
    const role = mapHistoryRole(item);
    const text = typeof item.content === 'string' ? item.content : '';
    const el = createMessageElement(text, role, item.metadata || null);
    chatLog.appendChild(el);
  }
  if (shouldRestoreTyping) {
    renderTypingIndicator();
  }
  if (shouldStick) {
    maintainViewportBottom(behavior, tolerance, force);
  }
}

async function syncHistory({ force = false } = {}) {
  if (syncingHistory) return;
  syncingHistory = true;
  try {
    const qs = new URLSearchParams({
      session_id: sessionId,
      limit: String(HISTORY_LIMIT),
    });
    const response = await fetch(`${API_BASE_URL}/messages?${qs.toString()}`, {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    const nextIds = getMessageIds(messages);
    if (!force) {
      const unchanged =
        nextIds.length === lastHistoryIds.length &&
        nextIds.every((id, idx) => id === lastHistoryIds[idx]);
      if (unchanged) return;

      // Camino incremental: si el historial nuevo extiende al anterior, solo anexar delta
      const isExtension =
        nextIds.length >= lastHistoryIds.length &&
        lastHistoryIds.every((id, idx) => id === nextIds[idx]);
      if (isExtension) {
        const delta = messages.slice(lastHistoryIds.length);
        appendHistoryDelta(delta, { behavior: 'auto' });
        lastHistoryIds = nextIds;
        return;
      }
    }
    // Fallback: re-render completo
    renderHistoryMessages(messages, { force, behavior: force ? 'smooth' : 'auto' });
    lastHistoryIds = nextIds;
  } catch (error) {
    console.error('[landing] No se pudo sincronizar historial del webchat:', error);
  } finally {
    syncingHistory = false;
  }
}

function stopHistoryPolling() {
  if (historyPollingTimer) {
    window.clearInterval(historyPollingTimer);
    historyPollingTimer = null;
  }
}

function startHistoryPolling() {
  stopHistoryPolling();
  historyPollingTimer = window.setInterval(() => {
    void syncHistory();
  }, HISTORY_INTERVAL_MS);
}

const API_BASE_URL = '/api/webchat';
const STORAGE_SESSION_KEY = 'talia-webchat-session';

function getFallbackResponse() {
  return FALLBACK_MESSAGE;
}

function generateSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  const random = Math.random().toString(16).slice(2);
  return `sess-${Date.now()}-${random}`;
}

function loadSessionId() {
  try {
    const stored = localStorage.getItem(STORAGE_SESSION_KEY);
    if (stored) return stored;
  } catch (error) {
    console.warn('No se pudo leer el session_id del almacenamiento.', error);
  }
  const fresh = generateSessionId();
  try {
    localStorage.setItem(STORAGE_SESSION_KEY, fresh);
  } catch (error) {
    console.warn('No se pudo guardar el session_id.', error);
  }
  return fresh;
}

const sessionId = loadSessionId();
const HISTORY_LIMIT = 100;
const HISTORY_INTERVAL_MS = 4000;
let historyPollingTimer = null;
let lastHistoryIds = [];
let syncingHistory = false;

async function sendToAssistant(message) {
  const MAX_RETRIES = 2;
  const RETRY_DELAYS_MS = [1000, 2000]; // backoff simple

  async function doFetch() {
    const payload = {
      session_id: sessionId,
      author: 'user',
      content: message,
      locale: navigator.language || 'es-MX',
    };

    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ''}`);
    }
    const data = await response.json();
    const metadata = data?.metadata || {};
    if (!data?.reply && !metadata.manual_mode) {
      throw new Error('Respuesta vacía del asistente');
    }
    return data;
  }

  // Intentos con reintentos y backoff
  let attempt = 0;
  while (true) {
    try {
      return await doFetch();
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] || 1500;
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!chatInput || !chatInput.value.trim()) return;

  const userMessage = chatInput.value.trim();
  chatInput.value = '';
  appendMessage(userMessage, 'user', null, { behavior: 'smooth', force: true });
  // Marcar el último mensaje como eco local para deduplicar al sincronizar con el backend
  const lastEl = getLastMessageElement();
  if (lastEl) lastEl.setAttribute('data-local', 'true');
  chatInput.focus();

  enqueueAssistantReply(userMessage);
  // Evitar sincronización inmediata; el polling incremental añadirá solo lo nuevo
}

function initialiseChat() {
  if (chatForm) {
    chatForm.addEventListener('submit', handleSubmit);
  }
  void syncHistory({ force: true }).finally(() => {
    startHistoryPolling();
  });
}

function openMobileMenu() {
  if (!mobileMenu) return;
  // Calcular la parte inferior del header para colocar el menú justo debajo
  const header = document.querySelector('.site-header');
  const rect = header ? header.getBoundingClientRect() : { bottom: 0 };
  const top = rect.bottom + window.scrollY + 8; // 8px de margen
  mobileMenu.style.top = `${top}px`;
  mobileMenu.hidden = false;
  menuToggle?.setAttribute('aria-expanded', 'true');

  // Cierre con Escape
  document.addEventListener('keydown', escHandler);
  // Cierre al hacer clic fuera
  document.addEventListener('click', outsideClickHandler, { capture: true });
}

function closeMobileMenu() {
  if (!mobileMenu) return;
  mobileMenu.hidden = true;
  menuToggle?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', escHandler);
  document.removeEventListener('click', outsideClickHandler, { capture: true });
}

function escHandler(e) {
  if (e.key === 'Escape') closeMobileMenu();
}

function outsideClickHandler(e) {
  const panel = mobileMenu?.querySelector('.mobile-menu-panel');
  if (!panel) return;
  // Ignorar clics dentro del panel o sobre el botón hamburguesa (o sus hijos)
  const clickOnToggle = menuToggle && (e.target === menuToggle || menuToggle.contains(e.target));
  if (panel.contains(e.target) || clickOnToggle) return;
  closeMobileMenu();
}

function setupMobileMenu() {
  if (!mobileMenuList) return;

  const cta = document.querySelector('.site-header .cta');
  const themeSwitcher = document.querySelector('.theme-switcher');

  // Asegurar recordatorio de posiciones iniciales
  rememberPosition(cta);
  rememberPosition(themeSwitcher);

  // Obtener o crear los contenedores fijos dentro del menú
  let liCta = mobileMenuList.querySelector('[data-menu-item="cta"]');
  let liTheme = mobileMenuList.querySelector('[data-menu-item="theme"]');
  if (!liTheme) {
    liTheme = document.createElement('li');
    liTheme.setAttribute('data-menu-item', 'theme');
    liTheme.role = 'none';
  }
  if (!liCta) {
    liCta = document.createElement('li');
    liCta.setAttribute('data-menu-item', 'cta');
    liCta.role = 'none';
  }

  // Mover SIEMPRE el selector de tema al menú
  if (themeSwitcher && themeSwitcher.parentElement !== liTheme) {
    liTheme.innerHTML = '';
    liTheme.appendChild(themeSwitcher);
  }

  // En móvil, mover CTA al menú; en desktop, restaurarla al header
  if (MQ_MOBILE.matches) {
    if (cta && cta.parentElement !== liCta) {
      liCta.innerHTML = '';
      liCta.appendChild(cta);
    }
    // Insertar en orden: CTA primero, luego selector
    if (liCta.parentElement !== mobileMenuList) {
      mobileMenuList.insertBefore(liCta, mobileMenuList.firstChild);
    }
  } else {
    // Restaurar CTA al header si procede
    if (cta && cta.parentElement === liCta) {
      restorePosition(cta);
      liCta.innerHTML = '';
    }
    // Asegurar que el contenedor CTA no quede en la lista si está vacío
    if (liCta.parentElement === mobileMenuList && !liCta.firstChild) {
      mobileMenuList.removeChild(liCta);
    }
  }

  // Asegurar que el elemento de tema esté en la lista y después del CTA
  if (liTheme.parentElement !== mobileMenuList) {
    mobileMenuList.appendChild(liTheme);
  } else {
    // Si CTA está, garantizar orden
    if (mobileMenuList.firstChild !== liCta && liCta.parentElement === mobileMenuList) {
      mobileMenuList.insertBefore(liCta, liTheme);
    }
  }
}

function teardownMobileMenu() {
  if (!mobileMenuList) return;
  // Solo restauramos la CTA (el selector se queda en el menú)
  const cta = document.querySelector('.mobile-menu .cta') || document.querySelector('.site-header .cta');
  if (cta) restorePosition(cta);
}

function handleViewportChange(e) {
  // Siempre reconfiguramos el menú; CTA depende de e.matches
  setupMobileMenu();
  if (!e.matches) closeMobileMenu();
}

function initialiseMobileNav() {
  // Inicial según viewport + suscripción a cambios
  handleViewportChange(MQ_MOBILE);
  MQ_MOBILE.addEventListener('change', handleViewportChange);
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      if (mobileMenu?.hidden) openMobileMenu();
      else closeMobileMenu();
    });
  }
  // Cerrar al seleccionar cualquier enlace o CTA dentro del menú
  if (mobileMenu) {
    mobileMenu.addEventListener('click', (e) => {
      const actionable = e.target.closest('a, .cta');
      if (actionable && !mobileMenu.hidden) {
        closeMobileMenu();
      }
    });
    // Cerrar al enviar cualquier formulario dentro del menú (p.ej., versión futura de la CTA)
    mobileMenu.addEventListener('submit', () => {
      if (!mobileMenu.hidden) closeMobileMenu();
    });
  }
  // Cerrar al cambiar el selector de tema cuando está dentro del menú
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      if (mobileMenu && !mobileMenu.hidden) closeMobileMenu();
    });
  }
  // No dependemos de breakpoints: menú disponible en todas las resoluciones
}

initialiseTheme();
initialiseChat();
initialiseMobileNav();

if (currentYearEl) {
  currentYearEl.textContent = new Date().getFullYear();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopHistoryPolling();
    else startHistoryPolling();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', stopHistoryPolling);
}

// Ajusta variables CSS para respetar alturas reales de header y capa inferior
function updateLayoutInsets() {
  try {
    const root = document.documentElement;
    const header = document.querySelector('.site-header');
    const composer = document.querySelector('.composer');
    if (header) {
      const h = Math.round(header.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty('--header-h', `${h}px`);
    }
    if (composer) {
      const rect = composer.getBoundingClientRect();
      const cs = getComputedStyle(composer);
      const padTop = parseFloat(cs.paddingTop) || 0;
      // Distancia efectiva que debe reservar el layout: desde el borde inferior de la
      // pantalla hasta el inicio del padding superior del composer.
      const effective = Math.max(0, Math.round(rect.height - padTop));
      root.style.setProperty('--composer-h', `${effective}px`);
    }
  } catch (err) {
    // No bloquear en caso de error de medición.
    console.warn('[landing] No se pudo calcular insets del layout', err);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', updateLayoutInsets, { passive: true });
  window.addEventListener('resize', updateLayoutInsets, { passive: true });
}

let assistantQueue = Promise.resolve();

function enqueueAssistantReply(message) {
  assistantQueue = assistantQueue
    .then(() => handleAssistantReply(message))
    .catch((error) => {
      console.error('[landing] Error en la cola de respuestas:', error);
    });
}

async function handleAssistantReply(message) {
  try {
    renderTypingIndicator();
    const data = await sendToAssistant(message);
    const reply = data.reply;
    const metadata = (data && typeof data.metadata === 'object') ? data.metadata : {};
    removeTypingIndicator();
    if (!metadata.manual_mode) {
      appendMessage(reply, 'assistant', metadata, { behavior: 'smooth', force: true });
    }
    // Evitar re-render forzado inmediato del historial para prevenir jank/parpadeo.
    // La sincronización periódica actualizará el historial sin duplicar scroll animado.
    void syncHistory();
  } catch (error) {
    removeTypingIndicator();
    appendMessage(getFallbackResponse(), 'assistant', null, { behavior: 'smooth', force: true });
    console.error('Error obteniendo respuesta de TalIA:', error);
    // Evitar re-render forzado en errores también.
    void syncHistory();
  }
}
