import {
  $,
  ensureSession,
  fetchJSONWithAuth,
  setActiveNav,
} from './common.js';

const estadoLabels = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  reprogramada: 'Reprogramada',
  cancelada: 'Cancelada',
  realizada: 'Realizada',
};

const providerLabels = {
  hosting: 'Hosting',
  google: 'Google',
};

let agendaItems = [];
let selectedId = null;

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (v) => String(v).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeLocalValue(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function parseMetadata(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (error) {
    throw new Error('JSON inválido');
  }
  throw new Error('JSON inválido');
}

function renderAgenda(items) {
  const tbody = $('agenda-table-body');
  if (!tbody) return;
  tbody.textContent = '';
  if (!items || !items.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 5;
    emptyCell.className = 'agenda-empty';
    emptyCell.textContent = 'Sin registros en el rango seleccionado.';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }

  for (const item of items) {
    const tr = document.createElement('tr');
    tr.dataset.id = item.id ?? '';
    if (String(item.id) === String(selectedId || '')) {
      tr.classList.add('is-selected');
    }

    const startCell = document.createElement('td');
    startCell.textContent = formatDateTime(item.start_at);
    tr.appendChild(startCell);

    const contactCell = document.createElement('td');
    contactCell.textContent = item.contacto_nombre || 'Sin contacto';
    tr.appendChild(contactCell);

    const estadoCell = document.createElement('td');
    const estado = typeof item.estado === 'string' ? item.estado.toLowerCase() : '';
    const estadoLabel = estadoLabels[estado] || (estado ? estado : '—');
    const estadoChip = document.createElement('span');
    estadoChip.className = 'chip';
    estadoChip.textContent = estadoLabel;
    estadoCell.appendChild(estadoChip);
    tr.appendChild(estadoCell);

    const providerCell = document.createElement('td');
    const provider = typeof item.provider === 'string' ? item.provider.toLowerCase() : '';
    providerCell.textContent = providerLabels[provider] || (provider ? provider : '—');
    tr.appendChild(providerCell);

    const actionsCell = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline';
    btn.textContent = 'Ver';
    btn.addEventListener('click', () => selectAppointment(item.id));
    actionsCell.appendChild(btn);
    tr.appendChild(actionsCell);

    tbody.appendChild(tr);
  }
}

function setStatus(id, message, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? '#ff6b6b' : 'var(--muted)';
}

function resetEditForm() {
  const fields = [
    'editar-id',
    'editar-inicio',
    'editar-fin',
    'editar-timezone',
    'editar-estado',
    'editar-motivo',
    'editar-provider',
    'editar-meeting',
    'editar-location',
    'editar-notes',
    'editar-metadata',
  ];
  fields.forEach((id) => {
    const el = $(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = '';
    } else {
      el.value = '';
    }
  });
  selectedId = null;
  renderAgenda(agendaItems);
}

function selectAppointment(id) {
  if (!id) return;
  const match = agendaItems.find((item) => String(item.id) === String(id));
  if (!match) return;
  selectedId = match.id;

  $('editar-id').value = match.id || '';
  $('editar-inicio').value = toDateTimeLocalValue(match.start_at);
  $('editar-fin').value = toDateTimeLocalValue(match.end_at);
  $('editar-timezone').value = match.timezone || '';
  $('editar-estado').value = match.estado || '';
  $('editar-provider').value = match.provider || '';
  $('editar-meeting').value = match.meeting_url || '';
  $('editar-location').value = match.location || '';
  $('editar-notes').value = match.notes || '';
  $('editar-metadata').value =
    match.metadata && typeof match.metadata === 'object'
      ? JSON.stringify(match.metadata, null, 2)
      : '';
  $('editar-motivo').value = match.cancel_reason || '';

  setStatus('editar-status', 'Listo para editar.');
  renderAgenda(agendaItems);
}

function toggleDateInputs() {
  const rango = $('filtro-rango');
  const desde = $('filtro-desde');
  const hasta = $('filtro-hasta');
  if (!rango || !desde || !hasta) return;
  const useCustom = rango.value === 'fechas';
  desde.disabled = !useCustom;
  hasta.disabled = !useCustom;
  if (!useCustom) {
    desde.value = '';
    hasta.value = '';
  }
}

async function loadAgenda() {
  const rango = $('filtro-rango')?.value || '7d';
  const estado = $('filtro-estado')?.value || '';
  const provider = $('filtro-provider')?.value || '';
  const desde = $('filtro-desde')?.value || '';
  const hasta = $('filtro-hasta')?.value || '';
  const qs = new URLSearchParams();
  qs.set('limit', '200');
  if (rango) qs.set('rango', rango);
  if (rango === 'fechas') {
    if (desde) qs.set('desde', desde);
    if (hasta) qs.set('hasta', hasta);
  }
  if (estado) qs.set('estado', estado);
  if (provider) qs.set('provider', provider);

  setStatus('agenda-status', 'Actualizando…');
  try {
    const { ok, json, status } = await fetchJSONWithAuth(`/api/agenda/demos?${qs.toString()}`);
    if (!ok) {
      throw new Error(json?.detail || `Error (${status})`);
    }
    agendaItems = Array.isArray(json?.items) ? json.items : [];
    renderAgenda(agendaItems);
    setStatus('agenda-status', `Última actualización: ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    agendaItems = [];
    renderAgenda([]);
    setStatus('agenda-status', error.message || 'No fue posible cargar la agenda', true);
  }
}

async function createAppointment(event) {
  event.preventDefault();
  const tarjeta = $('crear-tarjeta')?.value?.trim();
  if (!tarjeta) {
    setStatus('crear-status', 'La tarjeta es obligatoria.', true);
    return;
  }
  let metadata = null;
  try {
    metadata = parseMetadata($('crear-metadata')?.value || '');
  } catch (error) {
    setStatus('crear-status', error.message, true);
    return;
  }
  const payload = {};
  payload.tarjeta_id = tarjeta;
  const contacto = $('crear-contacto')?.value?.trim();
  if (contacto) payload.contacto_id = contacto;
  const conversacion = $('crear-conversacion')?.value?.trim();
  if (conversacion) payload.conversacion_id = conversacion;

  const inicio = fromDateTimeLocalValue($('crear-inicio')?.value || '');
  if (!inicio) {
    setStatus('crear-status', 'El inicio es obligatorio.', true);
    return;
  }
  payload.start_at = inicio;
  const fin = fromDateTimeLocalValue($('crear-fin')?.value || '');
  if (fin) payload.end_at = fin;

  const timezone = $('crear-timezone')?.value?.trim();
  if (timezone) payload.timezone = timezone;

  const estado = $('crear-estado')?.value || '';
  if (estado) payload.estado = estado;

  const provider = $('crear-provider')?.value || '';
  if (provider) payload.provider = provider;

  const meeting = $('crear-meeting')?.value?.trim();
  if (meeting) payload.meeting_url = meeting;

  const location = $('crear-location')?.value?.trim();
  if (location) payload.location = location;

  const notes = $('crear-notes')?.value?.trim();
  if (notes) payload.notes = notes;

  if (metadata) payload.metadata = metadata;

  setStatus('crear-status', 'Creando cita…');
  try {
    const { ok, json, status } = await fetchJSONWithAuth('/api/agenda/demos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!ok) {
      throw new Error(json?.detail || `Error (${status}) creando la cita`);
    }
    setStatus('crear-status', 'Cita creada correctamente.');
    (event.target.reset?.bind(event.target) || (() => {}))();
    $('crear-timezone').value = 'America/Mexico_City';
    await loadAgenda();
    if (json?.item?.id) selectAppointment(json.item.id);
  } catch (error) {
    setStatus('crear-status', error.message || 'No se pudo crear la cita', true);
  }
}

async function updateAppointment(event) {
  event.preventDefault();
  if (!selectedId) {
    setStatus('editar-status', 'Selecciona una cita primero.', true);
    return;
  }
  let metadata = null;
  const metadataRaw = $('editar-metadata')?.value || '';
  if (metadataRaw.trim()) {
    try {
      metadata = parseMetadata(metadataRaw);
    } catch (error) {
      setStatus('editar-status', error.message, true);
      return;
    }
  }

  const payload = {};
  const inicio = fromDateTimeLocalValue($('editar-inicio')?.value || '');
  if (inicio) payload.start_at = inicio;

  const fin = fromDateTimeLocalValue($('editar-fin')?.value || '');
  if (fin) payload.end_at = fin;

  const timezone = $('editar-timezone')?.value?.trim();
  if (timezone) payload.timezone = timezone;

  const estado = $('editar-estado')?.value || '';
  if (estado) payload.estado = estado;

  const provider = $('editar-provider')?.value || '';
  if (provider) payload.provider = provider;

  const meeting = $('editar-meeting')?.value?.trim();
  if (meeting) payload.meeting_url = meeting;

  const location = $('editar-location')?.value?.trim();
  if (location) payload.location = location;

  const notes = $('editar-notes')?.value?.trim();
  if (notes) payload.notes = notes;

  const motivo = $('editar-motivo')?.value?.trim();
  if (motivo) payload.cancel_reason = motivo;

  if (metadata) payload.metadata = metadata;

  if (!Object.keys(payload).length) {
    setStatus('editar-status', 'No hay cambios por guardar.', true);
    return;
  }

  setStatus('editar-status', 'Guardando cambios…');
  try {
    const { ok, json, status } = await fetchJSONWithAuth(
      `/api/agenda/demos/${encodeURIComponent(selectedId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!ok) {
      throw new Error(json?.detail || `Error (${status}) actualizando la cita`);
    }
    setStatus('editar-status', 'Cambios guardados.');
    await loadAgenda();
    if (json?.item?.id) selectAppointment(json.item.id);
  } catch (error) {
    setStatus('editar-status', error.message || 'No se pudo actualizar la cita', true);
  }
}

async function deleteAppointment() {
  if (!selectedId) {
    setStatus('editar-status', 'Selecciona una cita para eliminar.', true);
    return;
  }
  const confirmed = window.confirm('¿Eliminar la cita seleccionada? Esta acción no se puede deshacer.');
  if (!confirmed) return;
  setStatus('editar-status', 'Eliminando cita…');
  try {
    const { ok, json, status } = await fetchJSONWithAuth(
      `/api/agenda/demos/${encodeURIComponent(selectedId)}`,
      { method: 'DELETE' }
    );
    if (!ok) {
      throw new Error(json?.detail || `Error (${status}) eliminando la cita`);
    }
    setStatus('editar-status', 'Cita eliminada.');
    resetEditForm();
    await loadAgenda();
  } catch (error) {
    setStatus('editar-status', error.message || 'No se pudo eliminar la cita', true);
  }
}

function attachEvents() {
  $('agenda-refresh')?.addEventListener('click', loadAgenda);
  $('filtro-rango')?.addEventListener('change', () => {
    toggleDateInputs();
    loadAgenda();
  });
  $('crear-cita-form')?.addEventListener('submit', createAppointment);
  $('editar-cita-form')?.addEventListener('submit', updateAppointment);
  $('btn-eliminar')?.addEventListener('click', deleteAppointment);
}

async function init() {
  setActiveNav('agenda');
  const session = await ensureSession();
  if (!session) return;
  const tzInput = $('crear-timezone');
  if (tzInput && !tzInput.value) {
    tzInput.value = 'America/Mexico_City';
  }
  toggleDateInputs();
  attachEvents();
  loadAgenda();
}

init();
