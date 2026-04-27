/* eslint-disable */

const DEFAULT_FALLBACK_MESSAGE =
  "Tu mensaje llegó, pero tuve un problema momentáneo al responder. Intentemos de nuevo en unos segundos o envíame otra línea.";

const defaultConfig = {
  apiBaseUrl: "/api/webchat",
  storageSessionKey: "talia-webchat-session",
  historyLimit: 100,
  fallbackMessage: DEFAULT_FALLBACK_MESSAGE,
  persistSession: true,
  tenantAlias: null,
};

const elements = {
  chatLog: null,
  chatForm: null,
  chatInput: null,
  chatAttachmentButton: null,
  chatFileInput: null,
  chatAttachments: null,
  chatStatus: null,
};

const state = {
  sessionId: null,
  conversationId: null,
  loadingHistory: false,
  historyTimer: null,
  chatEnabled: false,
  visitRegistered: false,
};

function getSessionId(storageKey, persistSession) {
  if (!persistSession) {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const next = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(storageKey, next);
    return next;
  } catch {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function setStatus(text) {
  if (elements.chatStatus) {
    elements.chatStatus.textContent = text;
  }
}

function renderEmpty(chatLog) {
  if (!chatLog) return;
  chatLog.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "message message--assistant talia-webchat-empty";
  empty.textContent = DEFAULT_FALLBACK_MESSAGE;
  chatLog.appendChild(empty);
}

function appendMessage(chatLog, role, text) {
  if (!chatLog) return null;
  const bubble = document.createElement("div");
  bubble.className = `message message--${role}`;
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

function pickReply(payload) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = [
    payload.reply,
    payload.message,
    payload.text,
    payload.answer,
    payload.content,
    payload.data?.reply,
    payload.data?.message,
    payload.data?.text,
  ];

  for (const candidate of candidates) {
    const text = normalizeText(candidate);
    if (text) return text;
  }

  return "";
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { ok: response.ok, status: response.status, payload };
}

async function loadHistory() {
  if (!state.sessionId || !elements.chatLog) return;
  state.loadingHistory = true;
  try {
    const url = new URL(`${defaultConfig.apiBaseUrl}/messages`, window.location.origin);
    url.searchParams.set("session_id", state.sessionId);
    url.searchParams.set("limit", String(defaultConfig.historyLimit));
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    if (!messages.length) return;
    elements.chatLog.replaceChildren();
    messages.forEach((message) => {
      const role = message.direction === "entrante" ? "user" : "assistant";
      appendMessage(elements.chatLog, role, message.content || "");
    });
    chatScrollToBottom();
  } catch (error) {
    console.warn("[webchat] No se pudo cargar historial.", error);
  } finally {
    state.loadingHistory = false;
  }
}

function chatScrollToBottom() {
  const chatLog = elements.chatLog;
  if (!chatLog) return;
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function registerVisit() {
  if (state.visitRegistered || !state.sessionId) return;
  const metadata = {
    tenant_alias: defaultConfig.tenantAlias || undefined,
    client: {
      user_agent: navigator.userAgent,
      referrer: document.referrer || undefined,
      location_href: window.location.href,
    },
  };
  try {
    const response = await fetch(`${defaultConfig.apiBaseUrl}/visit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Alias": defaultConfig.tenantAlias || "",
      },
      body: JSON.stringify({
        session_id: state.sessionId,
        metadata,
      }),
      cache: "no-store",
    });
    if (response.ok) {
      state.visitRegistered = true;
    }
  } catch (error) {
    console.warn("[webchat] No se pudo registrar la visita.", error);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!elements.chatInput || !elements.chatLog) return;

  const content = elements.chatInput.value.trim();
  if (!content) return;

  const clientMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  elements.chatInput.value = "";
  appendMessage(elements.chatLog, "user", content);
  setStatus("Pensando...");

  try {
    const response = await postJson(`${defaultConfig.apiBaseUrl}/messages`, {
      session_id: state.sessionId,
      author: "user",
      content,
      client_message_id: clientMessageId,
      locale: navigator.language || "es-MX",
      fresh_load: false,
      metadata: {
        tenant_alias: defaultConfig.tenantAlias || undefined,
        client: {
          user_agent: navigator.userAgent,
          referrer: document.referrer || undefined,
          location_href: window.location.href,
        },
      },
    });

    const reply = pickReply(response.payload);
    if (reply) {
      appendMessage(elements.chatLog, "assistant", reply);
      setStatus("Listo");
    } else if (!response.ok) {
      appendMessage(elements.chatLog, "assistant", defaultConfig.fallbackMessage);
      setStatus("Sin respuesta");
    } else {
      setStatus("Listo");
    }
  } catch (error) {
    console.warn("[webchat] No se pudo enviar el mensaje.", error);
    appendMessage(elements.chatLog, "assistant", defaultConfig.fallbackMessage);
    setStatus("Sin respuesta");
  }
}

export function initialiseChat(options = {}) {
  const config = { ...defaultConfig, ...options };
  defaultConfig.apiBaseUrl = config.apiBaseUrl;
  defaultConfig.historyLimit = config.historyLimit;
  defaultConfig.fallbackMessage = config.fallbackMessage;
  defaultConfig.persistSession = config.persistSession;
  defaultConfig.tenantAlias = config.tenantAlias;

  elements.chatLog = options.chatLog ?? document.getElementById("chat-log");
  elements.chatForm = options.chatForm ?? document.getElementById("chat-form");
  elements.chatInput = options.chatInput ?? document.getElementById("chat-input");
  elements.chatAttachmentButton =
    options.chatAttachmentButton ?? document.getElementById("chat-attachment-button");
  elements.chatFileInput = options.chatFileInput ?? document.getElementById("chat-file-input");
  elements.chatAttachments = options.chatAttachments ?? document.getElementById("chat-attachments");
  elements.chatStatus = options.chatStatus ?? document.getElementById("chat-status");

  state.chatEnabled =
    Boolean(elements.chatLog) && Boolean(elements.chatForm) && Boolean(elements.chatInput);
  if (!state.chatEnabled) {
    return {
      start: () => {},
      stop: () => {},
    };
  }

  state.sessionId = getSessionId(config.storageSessionKey, config.persistSession);
  renderEmpty(elements.chatLog);
  setStatus("Conectando...");

  elements.chatForm.addEventListener("submit", handleSubmit);

  if (elements.chatInput) {
    elements.chatInput.addEventListener("input", () => {
      if (normalizeText(elements.chatInput?.value || "")) {
        setStatus("Listo");
      }
    });
  }

  void registerVisit().finally(() => {
    void loadHistory().finally(() => {
      setStatus("Listo");
    });
  });

  return {
    start: () => {
      void loadHistory();
    },
    stop: () => {
      if (state.historyTimer) {
        window.clearInterval(state.historyTimer);
        state.historyTimer = null;
      }
    },
  };
}
