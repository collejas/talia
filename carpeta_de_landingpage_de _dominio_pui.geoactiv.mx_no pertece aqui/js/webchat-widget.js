const DEFAULT_GREETING =
  "Hola. Soy el asistente de seguimiento y webchat. Escribe tu consulta y te ayudamos a continuar.";

const STORAGE_KEY = "talia-webchat-session-id";

function getSessionId() {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const next = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function scrollToBottom(getScrollContainer) {
  const container = typeof getScrollContainer === "function" ? getScrollContainer() : null;
  const target = container?.querySelector?.(".talia-webchat-log");
  if (!target) return;
  target.scrollTop = target.scrollHeight;
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
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

  if (Array.isArray(payload.messages) && payload.messages.length) {
    const last = payload.messages[payload.messages.length - 1];
    if (typeof last === "string" && last.trim()) return last.trim();
    if (last && typeof last === "object") {
      const nested = normalizeText(last.content || last.text || last.message);
      if (nested) return nested;
    }
  }

  return "";
}

function setStatus(chatStatus, text) {
  if (chatStatus) chatStatus.textContent = text;
}

function renderEmpty(chatLog) {
  if (!chatLog) return;
  chatLog.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "talia-webchat-empty";
  empty.textContent = DEFAULT_GREETING;
  chatLog.appendChild(empty);
}

function appendMessage(chatLog, role, text, extraClass = "") {
  if (!chatLog) return null;
  const bubble = document.createElement("div");
  bubble.className = [
    "talia-webchat-message",
    `talia-webchat-message--${role}`,
    extraClass,
  ]
    .filter(Boolean)
    .join(" ");
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  return bubble;
}

function renderAttachmentList(chatAttachments, fileEntry, onRemove) {
  if (!chatAttachments) return;
  chatAttachments.replaceChildren();

  if (!fileEntry) return;

  const pill = document.createElement("div");
  pill.className = "composer-attachment";

  const name = document.createElement("span");
  name.textContent = fileEntry.file.name;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Quitar";
  remove.addEventListener("click", onRemove);

  pill.appendChild(name);
  pill.appendChild(remove);
  chatAttachments.appendChild(pill);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = pickReply(payload) || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return payload;
}

async function postMultipart(url, formData) {
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = pickReply(payload) || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return payload;
}

export async function initialiseChat(options = {}) {
  const {
    tenantAlias,
    apiBaseUrl,
    chatLog,
    chatForm,
    chatInput,
    chatAttachmentButton,
    chatFileInput,
    chatAttachments,
    chatStatus,
    getScrollContainer,
  } = options;

  if (!chatLog || !chatForm || !chatInput || !apiBaseUrl || !tenantAlias) {
    return;
  }

  const sessionId = getSessionId();
  let pendingFile = null;
  let sending = false;

  const visitUrl = `${apiBaseUrl.replace(/\/$/, "")}/visit`;
  const messagesUrl = `${apiBaseUrl.replace(/\/$/, "")}/messages`;

  renderEmpty(chatLog);
  setStatus(chatStatus, "Listo");

  const addSystemMessage = (text) => appendMessage(chatLog, "system", text);
  const clearPendingFile = () => {
    pendingFile = null;
    if (chatFileInput) chatFileInput.value = "";
    renderAttachmentList(chatAttachments, null, () => {});
  };

  const refreshAttachmentList = () => {
    renderAttachmentList(chatAttachments, pendingFile, () => {
      clearPendingFile();
    });
  };

  addSystemMessage(`Sesión activa: ${sessionId}`);
  scrollToBottom(getScrollContainer);

  try {
    await postJson(visitUrl, {
      session_id: sessionId,
      tenant_alias: tenantAlias,
    });
  } catch (error) {
    setStatus(chatStatus, "Sincronización local");
    addSystemMessage(`No se pudo registrar la visita: ${error.message}`);
  }

  chatAttachmentButton?.addEventListener("click", () => {
    chatFileInput?.click();
  });

  chatFileInput?.addEventListener("change", () => {
    const file = chatFileInput.files && chatFileInput.files[0];
    pendingFile = file ? { file } : null;
    refreshAttachmentList();
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;

    const message = normalizeText(chatInput.value);
    if (!message && !pendingFile) return;

    sending = true;
    setStatus(chatStatus, "Enviando...");

    appendMessage(chatLog, "user", message || "Archivo adjunto");
    const pendingBubble = appendMessage(chatLog, "assistant", "Escribiendo...", "talia-webchat-message--pending");

    chatInput.value = "";
    chatInput.focus();

    try {
      let payload;

      if (pendingFile?.file) {
        const formData = new FormData();
        formData.append("session_id", sessionId);
        formData.append("tenant_alias", tenantAlias);
        formData.append("message", message);
        formData.append("file", pendingFile.file);
        payload = await postMultipart(messagesUrl, formData);
      } else {
        payload = await postJson(messagesUrl, {
          session_id: sessionId,
          tenant_alias: tenantAlias,
          message,
        });
      }

      const reply = pickReply(payload) || "Mensaje recibido. En breve te daremos seguimiento.";
      if (pendingBubble) {
        pendingBubble.classList.remove("talia-webchat-message--pending");
        pendingBubble.textContent = reply;
      } else {
        appendMessage(chatLog, "assistant", reply);
      }

      if (payload && typeof payload === "object") {
        const tracking = normalizeText(payload.tracking_id || payload.ticket_id || payload.reference);
        if (tracking) {
          addSystemMessage(`Referencia: ${tracking}`);
        }
      }

      clearPendingFile();
      setStatus(chatStatus, "En línea");
    } catch (error) {
      if (pendingBubble) {
        pendingBubble.classList.remove("talia-webchat-message--pending");
        pendingBubble.textContent =
          "No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.";
      } else {
        appendMessage(chatLog, "assistant", "No se pudo enviar el mensaje.");
      }
      addSystemMessage(error.message);
      setStatus(chatStatus, "Error de envío");
    } finally {
      sending = false;
      scrollToBottom(getScrollContainer);
    }
  });

  return {
    sessionId,
    resetAttachment: clearPendingFile,
  };
}
