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
const THEME_STORAGE_KEY = 'talia-theme-preference-v2';
const THEMES = ['theme-aurora', 'theme-ice', 'theme-void'];
const THEME_META = {
  'theme-aurora': { themeColor: '#060414' },
  'theme-ice': { themeColor: '#fdf4ff' },
  'theme-void': { themeColor: '#050505' },
};

const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const currentYearEl = document.getElementById('current-year');

let typingBubble = null;

const FALLBACK_MESSAGE = 'Tu mensaje llegó, pero tuve un problema momentáneo al responder. Intentemos de nuevo en unos segundos o envíame otra línea.';

function getScrollContainer() {
  return document.scrollingElement || document.documentElement;
}

function isNearViewportBottom(container, tolerance = 160) {
  if (!container) return false;
  const viewportHeight = window.innerHeight || container.clientHeight || 0;
  const distanceToBottom = container.scrollHeight - (container.scrollTop + viewportHeight);
  return distanceToBottom <= tolerance;
}

function maintainViewportBottom(behavior = 'auto', tolerance) {
  const container = getScrollContainer();
  const shouldStick = isNearViewportBottom(container, tolerance);
  if (!container || !shouldStick) return;
  requestAnimationFrame(() => {
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  });
}

function applyTheme(theme) {
  const selected = THEMES.includes(theme) ? theme : THEMES[0];
  body.classList.remove(...THEMES);
  body.classList.add(selected);
  if (themeSelect) {
    themeSelect.value = selected;
  }
  // Actualizar meta theme-color para status bars
  const metaCfg = THEME_META[selected];
  if (themeColorMeta && metaCfg?.themeColor) {
    themeColorMeta.setAttribute('content', metaCfg.themeColor);
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, selected);
  } catch (error) {
    console.warn('No se pudo guardar la preferencia de tema.', error);
  }
}

function initialiseTheme() {
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo leer la preferencia de tema.', error);
  }
  const defaultTheme = body.className
    .split(' ')
    .find((cls) => THEMES.includes(cls)) || THEMES[0];
  applyTheme(storedTheme || defaultTheme);
}

function createMessageElement(text, role = 'assistant') {
  const wrapper = document.createElement('div');
  wrapper.className = `message message--${role}`;
  wrapper.innerText = text;
  return wrapper;
}

function appendMessage(text, role = 'assistant', scrollBehavior = 'auto') {
  if (!chatLog) return;
  const container = getScrollContainer();
  const shouldStick = isNearViewportBottom(container);
  const element = createMessageElement(text, role);
  chatLog.appendChild(element);
  if (shouldStick) {
    maintainViewportBottom(scrollBehavior);
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
}

function removeTypingIndicator() {
  if (typingBubble && typingBubble.parentNode) {
    typingBubble.parentNode.removeChild(typingBubble);
  }
  typingBubble = null;
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
    if (!data?.reply) {
      throw new Error('Respuesta vacía del asistente');
    }
    return data.reply;
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
  appendMessage(userMessage, 'user');
  chatInput.focus();

  // En lugar de enviar inmediatamente, agregamos al buffer por tiempo.
  aggregator.push(userMessage);
}

function initialiseChat() {
  if (chatForm) {
    chatForm.addEventListener('submit', handleSubmit);
  }
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

if (themeSelect) {
  themeSelect.addEventListener('change', (event) => {
    const selectedTheme = event.target.value;
    applyTheme(selectedTheme);
  });
}

initialiseTheme();
initialiseChat();
initialiseMobileNav();

if (currentYearEl) {
  currentYearEl.textContent = new Date().getFullYear();
}

// --- Agregación por tiempo (buffer de mensajes) ---

function createAggregator({ idleMs = 3000, maxWaitMs = 15000, delimiter = '\n', onFlush }) {
  let buffer = '';
  let idleTimer = null;
  let maxTimer = null;

  const clearTimers = () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
  };

  const flush = async () => {
    if (!buffer) return;
    const text = buffer;
    buffer = '';
    clearTimers();
    try {
      renderTypingIndicator();
      const reply = await sendToAssistant(text);
      removeTypingIndicator();
      appendMessage(reply, 'assistant');
    } catch (error) {
      removeTypingIndicator();
      appendMessage(getFallbackResponse(), 'assistant');
      console.error('Error obteniendo respuesta de TalIA:', error);
    }
  };

  const schedule = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(flush, idleMs);
    if (!maxTimer) maxTimer = setTimeout(flush, maxWaitMs);
  };

  const push = (chunk) => {
    buffer += (buffer ? delimiter : '') + chunk;
    schedule();
  };

  return { push, flush };
}

// Instancia global del agregador para el chat del landing
const aggregator = createAggregator({
  idleMs: 3000,      // envía tras 3s sin nuevos trozos
  maxWaitMs: 15000,  // o a los 15s como máximo
  delimiter: '\n',
});
