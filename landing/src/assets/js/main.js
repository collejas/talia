const themeSelect = document.getElementById('theme-select');
const body = document.body;
const THEME_STORAGE_KEY = 'talia-theme-preference-v2';
const THEMES = ['theme-aurora', 'theme-ice', 'theme-void'];

const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const currentYearEl = document.getElementById('current-year');

let typingBubble = null;

const FALLBACK_MESSAGE = 'TalIA tuvo un inconveniente momentáneo. Intenta nuevamente en unos segundos.';

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
  const payload = {
    session_id: sessionId,
    author: 'user',
    content: message,
    locale: navigator.language || 'es-MX',
  };

  try {
    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data?.reply) {
      throw new Error('Respuesta vacía del asistente');
    }

    return data.reply;
  } catch (error) {
    console.error('Error al consultar al asistente:', error);
    return getFallbackResponse();
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!chatInput || !chatInput.value.trim()) return;

  const userMessage = chatInput.value.trim();
  chatInput.value = '';
  appendMessage(userMessage, 'user');

  renderTypingIndicator();
  try {
    const assistantMessage = await sendToAssistant(userMessage);
    removeTypingIndicator();
    appendMessage(assistantMessage, 'assistant');
  } catch (error) {
    removeTypingIndicator();
    appendMessage(getFallbackResponse(), 'assistant');
    console.error('Error obteniendo respuesta de TalIA:', error);
  }
  chatInput.focus();
}

function initialiseChat() {
  if (chatForm) {
    chatForm.addEventListener('submit', handleSubmit);
  }
}

if (themeSelect) {
  themeSelect.addEventListener('change', (event) => {
    const selectedTheme = event.target.value;
    applyTheme(selectedTheme);
  });
}

initialiseTheme();
initialiseChat();

if (currentYearEl) {
  currentYearEl.textContent = new Date().getFullYear();
}
