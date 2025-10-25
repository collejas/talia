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
    const who = it.preview_direccion === 'saliente' ? 'Agente' : (it.preview_direccion ? 'Usuario' : '');
    const preview = typeof it.preview === 'string' ? it.preview : '';
    const previewText = `${who ? `${who}: ` : ''}${preview}`;
    previewWrap.textContent = previewText;
    button.appendChild(previewWrap);

    li.appendChild(button);
    list.appendChild(li);
  }
}

function appendMessage(it) {
  const list = $('msg-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = `msg-row ${it.direccion === 'saliente' ? 'out' : 'in'}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.appendChild(document.createTextNode(typeof it.texto === 'string' ? it.texto : ''));

  const metaEl = document.createElement('div');
  metaEl.className = 'muted';
  metaEl.style.fontSize = '11px';
  metaEl.style.marginTop = '6px';
  const who = it.direccion === 'saliente' ? 'Agente' : 'Usuario';
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

async function loadConversations() {
  const canalSel = document.getElementById('filter-canal');
  const estadoSel = document.getElementById('filter-estado');
  const canal = canalSel ? (canalSel.value || '') : '';
  const estado = estadoSel ? (estadoSel.value || '') : '';
  const qs = new URLSearchParams();
  qs.set('limit', '25');
  if (canal) qs.set('canal', canal);
  if (estado) qs.set('estado', estado);
  const r = await fetchJSONWithAuth(`/api/inbox?${qs.toString()}`);
  if (r.ok) {
    _lastList = r.json?.items || [];
    renderConversations(_lastList);
  }
}

async function loadMessages(convId) {
  const r = await fetchJSONWithAuth(`/api/conversaciones/${encodeURIComponent(convId)}/mensajes?limit=50`);
  if (r.ok) renderMessages(r.json?.items || []);
}

let _rtChannel = null;
let _currentConv = null;
let _rtInbox = null;
let _refreshTimer = null;
let _lastList = [];

function scheduleRefreshList(delayMs = 600) {
  if (_refreshTimer) window.clearTimeout(_refreshTimer);
  _refreshTimer = window.setTimeout(() => { void loadConversations(); }, delayMs);
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
        appendMessage({ direccion: rec.direccion, texto: rec.texto });
        const list = $('msg-list');
        if (list) list.scrollTop = list.scrollHeight;
      }
    )
    .subscribe();
}

async function main() {
  await ensureSession();
  await loadConversations();
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
        }
        void loadMessages(id);
        setupRealtime(id);
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
}

void main();
