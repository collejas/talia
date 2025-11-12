import { $, ensureSession, fetchJSONWithAuth, createSupabase } from './common.js';

function renderConversations(items) {
  const list = $('conv-list');
  if (!list) return;
  list.textContent = '';
  for (const it of items || []) {
    const li = document.createElement('li');
    li.className = 'conv-item';

    const button = document.createElement('button');
    button.className = 'conv-btn';
    button.dataset.id = it?.id == null ? '' : String(it.id);

    const title = document.createElement('div');
    title.className = 'conv-title';
    title.textContent = it.contacto_nombre || 'Contacto';
    button.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'conv-sub muted';
    const canal = typeof it.canal === 'string' ? it.canal : '';
    const estado = typeof it.estado === 'string' ? it.estado : '';
    const canalSlug = canal.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const estadoSlug = estado.toLowerCase().replace(/[^a-z0-9_-]/g, '');

    if (canalSlug) {
      const canalChip = document.createElement('span');
      canalChip.className = `chip canal-${canalSlug}`;
      canalChip.textContent = canal;
      sub.appendChild(canalChip);
    }
    if (estadoSlug) {
      const estadoChip = document.createElement('span');
      estadoChip.className = `chip state-${estadoSlug}`;
      estadoChip.textContent = estado;
      sub.appendChild(estadoChip);
    }
    const when = it.ultimo_mensaje_en ? new Date(it.ultimo_mensaje_en) : null;
    const whenText = when && !Number.isNaN(when.getTime()) ? when.toLocaleString() : '';
    if (whenText) {
      if (sub.childNodes.length) sub.appendChild(document.createTextNode(' '));
      sub.appendChild(document.createTextNode(whenText));
    }
    if (typeof it.no_leidos === 'number' && it.no_leidos > 0) {
      sub.appendChild(document.createTextNode(' '));
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.title = 'No leídos';
      badge.textContent = String(it.no_leidos);
      sub.appendChild(badge);
    }
    button.appendChild(sub);

    const previewWrap = document.createElement('div');
    previewWrap.className = 'muted';
    previewWrap.style.fontSize = '12px';
    previewWrap.style.marginTop = '4px';
    previewWrap.dataset.role = 'preview';
    const isOutgoing = it.preview_direccion === 'saliente';
    const rawAuthor =
      typeof it.preview_author === 'string' && it.preview_author.trim().length
        ? it.preview_author.trim()
        : '';
    const senderType =
      typeof it.preview_sender_type === 'string' && it.preview_sender_type.trim().length
        ? it.preview_sender_type.trim().toLowerCase()
        : '';
    let who = '';
  if (isOutgoing) {
    if (rawAuthor) {
      if (senderType === 'human' && rawAuthor.toLowerCase() === 'agent') {
        who = getCurrentAgentName();
      } else {
        who = rawAuthor;
      }
    } else if (senderType === 'human') {
      who = getCurrentAgentName();
    } else {
      who = 'Tal-IA';
    }
    } else if (it.preview_direccion) {
      who = rawAuthor || 'Usuario';
    }
    const preview = typeof it.preview === 'string' ? it.preview : '';
    const previewText = `${who ? `${who}: ` : ''}${preview}`;
    previewWrap.textContent = previewText;
    button.appendChild(previewWrap);

    li.appendChild(button);
    list.appendChild(li);
  }
}

function normaliseSenderType(it) {
  if (!it) return null;
  const raw =
    typeof it.sender_type === 'string'
      ? it.sender_type
      : typeof it === 'string'
        ? it
        : null;
  return raw ? raw.toLowerCase() : null;
}

function resolveSenderLabel(it) {
  if (it.direccion !== 'saliente') {
    return { label: 'Usuario', senderType: 'user' };
  }
  const normalised = normaliseSenderType(it);
  const meta = it.metadata || {};
  let extra = null;
  if (meta && typeof meta.extra === 'string') {
    try {
      extra = JSON.parse(meta.extra);
    } catch {
      extra = null;
    }
  } else if (meta && typeof meta.extra === 'object') {
    extra = meta.extra;
  }
  const agentName =
    typeof meta.agent_name === 'string' && meta.agent_name.trim()
      ? meta.agent_name.trim()
      : typeof meta.manual_author === 'string' && meta.manual_author.trim()
        ? meta.manual_author.trim()
        : extra && typeof extra.agent_name === 'string' && extra.agent_name.trim()
          ? extra.agent_name.trim()
          : extra && typeof extra.manual_author === 'string' && extra.manual_author.trim()
            ? extra.manual_author.trim()
            : getCurrentAgentName();
  const normalized = agentName.trim().toLowerCase();
  const displayName =
    normalized === 'agent' || normalized === 'agente' ? getCurrentAgentName() : agentName;
  if (normalised && normalised.startsWith('human')) {
    const label = `Humano: ${displayName}`;
    return { label, senderType: 'human_agent' };
  }
  return { label: 'Tal-IA', senderType: 'assistant' };
}

function appendMessage(it) {
  const list = $('msg-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = `msg-row ${it.direccion === 'saliente' ? 'out' : 'in'}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const senderInfo = resolveSenderLabel(it);
  const heading = document.createElement('strong');
  heading.textContent = senderInfo.label;
  bubble.appendChild(heading);

  const bodyEl = document.createElement('div');
  bodyEl.textContent = typeof it.texto === 'string' ? it.texto : '';
  bubble.appendChild(bodyEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'muted';
  metaEl.style.fontSize = '11px';
  metaEl.style.marginTop = '6px';
  const who = senderInfo.label;
  const when = it.creado_en ? new Date(it.creado_en) : null;
  const meta = `${who}${when && !Number.isNaN(when.getTime()) ? ' • ' + when.toLocaleString() : ''}`;
  metaEl.textContent = meta;
  bubble.appendChild(metaEl);

  row.appendChild(bubble);
  list.appendChild(row);
}

function renderMessages(items) {
  const list = $('msg-list');
  if (!list) return;
  list.textContent = '';
  for (const it of items || []) {
    appendMessage(it);
  }
  list.scrollTop = list.scrollHeight;
}

let _isLoadingList = false;
let _isLoadingMessages = false;
let _loadingMessagesFor = null;
let _listPollTimer = null;
let _messagePollTimer = null;

async function loadConversations() {
  if (_isLoadingList) return;
  _isLoadingList = true;
  const canalSel = document.getElementById('filter-canal');
  const estadoSel = document.getElementById('filter-estado');
  const canal = canalSel ? (canalSel.value || '') : '';
  const estado = estadoSel ? (estadoSel.value || '') : '';
  const qs = new URLSearchParams();
  qs.set('limit', '25');
  if (canal) qs.set('canal', canal);
  if (estado) qs.set('estado', estado);
  try {
    const r = await fetchJSONWithAuth(`/api/inbox?${qs.toString()}`);
    if (r.ok) {
      _lastList = r.json?.items || [];
      renderConversations(_lastList);
    }
  } finally {
    _isLoadingList = false;
  }
}

async function loadMessages(convId) {
  if (!convId) return;
  if (_isLoadingMessages && _loadingMessagesFor === convId) return;
  _isLoadingMessages = true;
  _loadingMessagesFor = convId;
  try {
    const r = await fetchJSONWithAuth(
      `/api/conversaciones/${encodeURIComponent(convId)}/mensajes?limit=50`
    );
    if (r.ok && String(_currentConv || '') === String(convId)) {
      renderMessages(r.json?.items || []);
    }
  } finally {
    _isLoadingMessages = false;
    if (_loadingMessagesFor === convId) _loadingMessagesFor = null;
  }
}

let _rtChannel = null;
let _currentConv = null;
let _rtInbox = null;
let _refreshTimer = null;
let _lastList = [];
const sendForm = document.getElementById('send-form');
const sendInput = document.getElementById('send-input');
const sendStatus = document.getElementById('send-status');
const sendButton = sendForm ? sendForm.querySelector('button[type="submit"]') : null;
const manualToggle = document.getElementById('manual-toggle');
const manualStatus = document.getElementById('manual-status');
let _session = null;
let _manualOverride = false;
let _currentAgentName = 'Agente';

function deriveAgentNameFromSession(user) {
  if (!user || typeof user !== 'object') {
    return 'Agente';
  }
  const meta = user.user_metadata || {};
  const primaryCandidates = [
    meta.full_name,
    meta.fullName,
    meta.nombre_completo,
    meta.nombreCompleto,
    meta.name,
    meta.display_name,
    meta.displayName,
    meta.preferred_name,
    meta.preferredName,
    meta.username,
    meta.user_name,
  ];
  for (const candidate of primaryCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length) {
      return candidate.trim();
    }
  }
  const first =
    (typeof meta.first_name === 'string' && meta.first_name.trim()) ||
    (typeof meta.firstName === 'string' && meta.firstName.trim()) ||
    (typeof meta.given_name === 'string' && meta.given_name.trim()) ||
    (typeof meta.givenName === 'string' && meta.givenName.trim()) ||
    (typeof meta.nombre === 'string' && meta.nombre.trim()) ||
    (typeof meta.nombres === 'string' && meta.nombres.trim()) ||
    '';
  const last =
    (typeof meta.last_name === 'string' && meta.last_name.trim()) ||
    (typeof meta.lastName === 'string' && meta.lastName.trim()) ||
    (typeof meta.family_name === 'string' && meta.family_name.trim()) ||
    (typeof meta.familyName === 'string' && meta.familyName.trim()) ||
    (typeof meta.apellido === 'string' && meta.apellido.trim()) ||
    (typeof meta.apellidos === 'string' && meta.apellidos.trim()) ||
    '';
  if (first && last) {
    return `${first} ${last}`.trim();
  }
  if (first) {
    return first;
  }
  if (last) {
    return last;
  }
  const secondaryCandidates = [
    meta.alias,
    meta.nick,
    meta.nick_name,
    meta.nickName,
  ];
  for (const candidate of secondaryCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length) {
      return candidate.trim();
    }
  }
  if (typeof user.email === 'string' && user.email.trim().length) {
    return user.email.trim();
  }
  if (typeof meta.email === 'string' && meta.email.trim().length) {
    return meta.email.trim();
  }
  if (typeof user.phone === 'string' && user.phone.trim().length) {
    return user.phone.trim();
  }
  return 'Agente';
}

function getCurrentAgentName() {
  if (_currentAgentName && _currentAgentName.trim().length && _currentAgentName.trim().toLowerCase() !== 'agente') {
    return _currentAgentName.trim();
  }
  const email = _session?.user?.email;
  if (typeof email === 'string' && email.trim().length) {
    return email.trim();
  }
  const metaEmail = _session?.user?.user_metadata?.email;
  if (typeof metaEmail === 'string' && metaEmail.trim().length) {
    return metaEmail.trim();
  }
  return 'Miembro del equipo';
}

async function refreshAgentName() {
  const initialName = deriveAgentNameFromSession(_session?.user);
  if (initialName && initialName !== 'Agente') {
    _currentAgentName = initialName;
  }
  const sb = createSupabase();
  const userId = _session?.user?.id;
  if (!sb || !userId) {
    return;
  }
  try {
    let builder = sb.from('usuarios').select('nombre_completo,correo').eq('id', userId).limit(1);
    let response;
    if (typeof builder.maybeSingle === 'function') {
      response = await builder.maybeSingle();
    } else if (typeof builder.single === 'function') {
      response = await builder.single();
    } else {
      response = await builder;
    }
    const { data, error } = response || {};
    if (!error && data) {
      if (typeof data.nombre_completo === 'string' && data.nombre_completo.trim().length) {
        _currentAgentName = data.nombre_completo.trim();
        return;
      }
      if (typeof data.correo === 'string' && data.correo.trim().length) {
        _currentAgentName = data.correo.trim();
      }
    }
  } catch (error) {
    console.warn('[panel] No se pudo refrescar el nombre del agente', error);
  }
}

function updateManualDisplay(state) {
  if (manualToggle) manualToggle.checked = Boolean(state);
  if (manualStatus) manualStatus.textContent = state ? 'Modo humano activo' : 'Modo automático';
}

function setManualToggleAvailability(enabled) {
  if (manualToggle) {
    manualToggle.disabled = !enabled;
    if (!enabled) {
      _manualOverride = false;
      updateManualDisplay(false);
    }
  }
  if (!enabled && manualStatus) {
    manualStatus.textContent = 'Modo automático';
  }
}

function setComposerEnabled(enabled) {
  if (sendInput) sendInput.disabled = !enabled;
  if (sendButton) sendButton.disabled = !enabled;
  if (!enabled && sendInput) {
    sendInput.value = '';
  }
  if (!enabled && sendStatus) sendStatus.textContent = '';
}

function scheduleRefreshList(delayMs = 600) {
  if (_refreshTimer) window.clearTimeout(_refreshTimer);
  _refreshTimer = window.setTimeout(() => { void loadConversations(); }, delayMs);
}

function ensurePolling() {
  if (!_listPollTimer) {
    _listPollTimer = window.setInterval(() => {
      if (document.hidden) return;
      void loadConversations();
    }, 12000);
  }
  if (!_messagePollTimer) {
    _messagePollTimer = window.setInterval(() => {
      if (document.hidden) return;
      if (_currentConv) {
        void loadMessages(_currentConv);
      }
    }, 7000);
  }
}

function updateBadge(convId, delta = 1) {
  try {
    const btn = document.querySelector(`button.conv-btn[data-id="${convId}"]`);
    if (!btn) return;
    const sub = btn.querySelector('.conv-sub');
    if (!sub) return;
    let badge = sub.querySelector('.badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge';
      badge.title = 'No leídos';
      sub.appendChild(document.createTextNode(' '));
      sub.appendChild(badge);
      badge.textContent = '0';
    }
    const cur = parseInt(badge.textContent || '0', 10) || 0;
    const next = Math.max(0, cur + delta);
    badge.textContent = String(next);
  } catch (_) { /* no-op */ }
}

function setupRealtime(convId) {
  const sb = createSupabase();
  if (!sb) return;
  if (_rtChannel) {
    sb.removeChannel(_rtChannel);
    _rtChannel = null;
  }
  _currentConv = convId;
  _rtChannel = sb
    .channel(`msgs:${convId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `conversacion_id=eq.${convId}` },
      (payload) => {
        const rec = payload.new || {};
        if (String(rec.conversacion_id) !== String(_currentConv)) return;
        const meta = rec.datos || {};
        appendMessage({
          direccion: rec.direccion,
          texto: rec.texto,
          creado_en: rec.creado_en,
          sender_type: meta?.sender_type,
          metadata: meta || null,
        });
        const list = $('msg-list');
        if (list) list.scrollTop = list.scrollHeight;
      }
    )
    .subscribe();
}

async function main() {
  _session = await ensureSession();
  _currentAgentName = deriveAgentNameFromSession(_session?.user);
  await refreshAgentName();
  setManualToggleAvailability(false);
  await loadConversations();
  ensurePolling();
  // Suscripción global para refrescar lista cuando lleguen mensajes nuevos
  const sb = createSupabase();
  if (sb) {
    if (_rtInbox) sb.removeChannel(_rtInbox);
    _rtInbox = sb
      .channel('inbox:list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (payload) => {
        const rec = payload?.new || {};
        const convId = rec.conversacion_id;
        const dir = rec.direccion;
        if (convId && String(convId) === String(_currentConv || '')) {
          void loadMessages(convId);
        }
        // Si llega un mensaje entrante a una conversación distinta a la activa, incrementa badge local
        if (convId && dir === 'entrante' && String(convId) !== String(_currentConv || '')) {
          updateBadge(convId, 1);
        }
        // Refresca la lista para mantener orden/preview consistentes
        scheduleRefreshList(800);
      })
      .subscribe();
  }
  const list = $('conv-list');
  if (list) {
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button.conv-btn');
      if (btn?.dataset?.id) {
        const id = btn.dataset.id;
        const item = (_lastList || []).find((x) => String(x.id) === String(id));
        if (item) {
          // Update details pane
          const wrap = document.getElementById('conv-details');
          const nameEl = document.getElementById('cd-name');
          const metaEl = document.getElementById('cd-meta');
          const estadoSel2 = document.getElementById('sel-estado');
          if (wrap && nameEl && metaEl && estadoSel2) {
            wrap.style.display = 'block';
            nameEl.textContent = item.contacto_nombre || 'Contacto';
            const phone = item.contacto_telefono || '';
            const email = item.contacto_correo || '';
            const canal = item.canal || '';
            metaEl.textContent = [canal, phone, email].filter(Boolean).join(' • ');
            estadoSel2.value = item.estado || 'abierta';
          }
          _manualOverride = Boolean(item.manual_override);
          updateManualDisplay(_manualOverride);
          setManualToggleAvailability(true);
        } else {
          setManualToggleAvailability(false);
        }
        void loadMessages(id);
        setupRealtime(id);
        setComposerEnabled(true);
        if (sendInput) sendInput.focus();
        // Marca como leída en servidor (resetea no_leidos)
        void fetchJSONWithAuth(`/api/conversaciones/${encodeURIComponent(id)}/marcar_leida`, { method: 'POST' }).then(() => {
          // refresca lista para actualizar badges
          void loadConversations();
        });
      }
    });
  }
  const canalSel = document.getElementById('filter-canal');
  const estadoSel = document.getElementById('filter-estado');
  const refreshBtn = document.getElementById('btn-refrescar');
  if (canalSel) canalSel.addEventListener('change', () => void loadConversations());
  if (estadoSel) estadoSel.addEventListener('change', () => void loadConversations());
  if (refreshBtn) refreshBtn.addEventListener('click', () => void loadConversations());
  // Detalles: acciones
  const cerrarBtn = document.getElementById('btn-cerrar');
  const estadoSel2 = document.getElementById('sel-estado');
  if (cerrarBtn) cerrarBtn.addEventListener('click', async () => {
    if (!_currentConv) return;
    const id = _currentConv;
    const res = await fetchJSONWithAuth(`/api/conversaciones/${encodeURIComponent(id)}/cerrar`, { method: 'POST' });
    if (res.ok) {
      // Refleja de inmediato en lista local según filtro activo
      const fEstado = (document.getElementById('filter-estado')?.value || '');
      const idx = (_lastList || []).findIndex((x) => String(x.id) === String(id));
      if (idx >= 0) {
        if (fEstado === '' /* abiertas/pendientes por defecto en backend */) {
          _lastList.splice(idx, 1);
        } else {
          _lastList[idx].estado = 'cerrada';
        }
        renderConversations(_lastList);
      }
      if (estadoSel2) estadoSel2.value = 'cerrada';
      // Refresco diferido para consistencia
      scheduleRefreshList(1000);
    }
  });
  if (estadoSel2) estadoSel2.addEventListener('change', async () => {
    if (!_currentConv) return;
    const estado = estadoSel2.value || 'abierta';
    const id = _currentConv;
    const res = await fetchJSONWithAuth(`/api/conversaciones/${encodeURIComponent(id)}/estado?new_estado=${encodeURIComponent(estado)}`, { method: 'POST' });
    if (res.ok) {
      const fEstado = (document.getElementById('filter-estado')?.value || '');
      const idx = (_lastList || []).findIndex((x) => String(x.id) === String(id));
      if (idx >= 0) {
        if (estado === 'cerrada' && fEstado === '') {
          _lastList.splice(idx, 1);
        } else {
          _lastList[idx].estado = estado;
        }
        renderConversations(_lastList);
      }
      scheduleRefreshList(1000);
    }
  });

  if (manualToggle) {
    manualToggle.addEventListener('change', async () => {
      if (!_currentConv) {
        manualToggle.checked = false;
        return;
      }
      const desired = manualToggle.checked;
      if (manualStatus) {
        manualStatus.textContent = desired
          ? 'Activando modo humano…'
          : 'Reanudando asistente…';
      }
      manualToggle.disabled = true;
      const url = `/api/conversaciones/${encodeURIComponent(_currentConv)}/manual`;
      try {
        const res = await fetchJSONWithAuth(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manual: desired }),
        });
        if (!res.ok) {
          if (manualStatus) manualStatus.textContent = 'No se pudo actualizar el modo.';
          manualToggle.checked = _manualOverride;
          return;
        }
        _manualOverride = desired;
        updateManualDisplay(_manualOverride);
        const idx = (_lastList || []).findIndex((x) => String(x.id) === String(_currentConv));
        if (idx >= 0) {
          _lastList[idx].manual_override = _manualOverride;
        }
        scheduleRefreshList(800);
      } catch (error) {
        console.error('[panel] Error actualizando modo manual:', error);
        if (manualStatus) manualStatus.textContent = 'Error de red al actualizar.';
        manualToggle.checked = _manualOverride;
      } finally {
        manualToggle.disabled = false;
      }
    });
  }

  if (sendForm) {
    setComposerEnabled(false);
    sendForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!sendInput || !sendInput.value.trim()) return;
      if (!_currentConv) return;
      const content = sendInput.value.trim();
      const url = `/api/conversaciones/${encodeURIComponent(_currentConv)}/mensajes`;
      const user = _session?.user || {};
      const agentName = getCurrentAgentName();
      const metadata = {
        agent_name: agentName,
        manual_author: agentName,
        sender_type: 'human',
        author_type: 'human',
        manual_mode: true,
        agent_email: user.email || null,
      };
      try {
        setComposerEnabled(false);
        if (sendStatus) sendStatus.textContent = 'Enviando…';
        const res = await fetchJSONWithAuth(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, metadata }),
        });
        if (!res.ok) {
          if (sendStatus) sendStatus.textContent = 'No se pudo enviar el mensaje.';
          sendInput.value = content;
        } else {
          if (sendStatus) sendStatus.textContent = 'Mensaje enviado';
          void loadMessages(_currentConv);
          scheduleRefreshList(500);
          if (_currentConv) {
            updateBadge(_currentConv, -999);
            const idx = (_lastList || []).findIndex(
              (x) => String(x.id) === String(_currentConv)
            );
            if (idx >= 0) {
              const nowIso = new Date().toISOString();
              const updated = {
                ..._lastList[idx],
                preview: content,
                preview_direccion: 'saliente',
                preview_author: agentName,
                preview_sender_type: 'human',
                ultimo_mensaje_en: nowIso,
                no_leidos: 0,
              };
              _lastList[idx] = updated;
              const btn = document.querySelector(
                `button.conv-btn[data-id="${_currentConv}"]`
              );
              if (btn) {
                const previewWrap = btn.querySelector('[data-role="preview"]');
                if (previewWrap) {
                  previewWrap.textContent = `${agentName}: ${content}`;
                }
              }
            }
          }
          window.setTimeout(() => {
            if (sendStatus) sendStatus.textContent = '';
          }, 2500);
        }
      } catch (error) {
        console.error('[panel] Error enviando mensaje:', error);
        if (sendStatus) sendStatus.textContent = 'Error de red';
        sendInput.value = content;
      } finally {
        setComposerEnabled(Boolean(_currentConv));
        if (sendInput) sendInput.focus();
      }
    });
  }
}

void main();
