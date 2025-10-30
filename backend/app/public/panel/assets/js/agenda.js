import { $, ensureSession, fetchJSONWithAuth, setActiveNav } from './common.js';

const ESTADOS = ['pendiente', 'confirmada', 'reprogramada', 'cancelada', 'realizada'];
const PROVIDERS = ['hosting', 'google'];
const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 14 }, (_, idx) => idx + 7); // 07:00 - 20:00

let agendaItems = [];
let selectedId = null;
let currentDate = startOfDay(new Date());
let currentView = 'month'; // month | bimestre | week | day
let modalMode = 'create';

function setStatus(id, message, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? '#ff6b6b' : 'var(--muted)';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date, opts) {
  return date.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', ...opts });
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function clone(date) {
  return new Date(date.getTime());
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 domingo
  const offset = day === 0 ? 6 : day - 1; // lunes inicio
  d.setDate(d.getDate() - offset);
  return d;
}

function addDays(date, amount) {
  const d = clone(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function addMonths(date, amount) {
  const d = clone(date);
  d.setMonth(d.getMonth() + amount);
  return d;
}

function getMonthMatrix(centerDate) {
  const firstOfMonth = new Date(centerDate.getFullYear(), centerDate.getMonth(), 1);
  const start = startOfWeek(firstOfMonth);
  const matrix = [];
  let cursor = start;
  for (let i = 0; i < 6; i += 1) {
    const week = [];
    for (let j = 0; j < 7; j += 1) {
      week.push(clone(cursor));
      cursor = addDays(cursor, 1);
    }
    matrix.push(week);
  }
  return matrix;
}

function toISO(localValue) {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function serializeDateToLocal(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function parseJSONField(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed);
  if (parsed && typeof parsed === 'object') return parsed;
  throw new Error('JSON inválido');
}

function normalizeFilters() {
  const rango = $('filtro-rango')?.value || '7d';
  const desde = $('filtro-desde');
  const hasta = $('filtro-hasta');
  const isCustom = rango === 'fechas';
  if (desde) desde.disabled = !isCustom;
  if (hasta) hasta.disabled = !isCustom;
  if (!isCustom) {
    if (desde) desde.value = '';
    if (hasta) hasta.value = '';
  }
}

function filtersToQuery() {
  const rango = $('filtro-rango')?.value || '7d';
  const estado = $('filtro-estado')?.value || '';
  const provider = $('filtro-provider')?.value || '';
  const desde = $('filtro-desde')?.value || '';
  const hasta = $('filtro-hasta')?.value || '';
  const qs = new URLSearchParams({ limit: '200', rango });
  if (rango === 'fechas') {
    if (desde) qs.set('desde', desde);
    if (hasta) qs.set('hasta', hasta);
  }
  if (estado) qs.set('estado', estado);
  if (provider) qs.set('provider', provider);
  return qs;
}

function eventsForDay(targetDate) {
  return agendaItems.filter((item) => {
    const date = new Date(item.start_at);
    return isSameDay(date, targetDate);
  });
}

function eventsForHour(targetDate, hour) {
  return agendaItems.filter((item) => {
    const start = new Date(item.start_at);
    return (
      isSameDay(start, targetDate) &&
      start.getHours() === hour
    );
  });
}

function renderMonthView(container, baseDate) {
  container.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'calendar-header';
  WEEKDAY_SHORT.forEach((name) => {
    const cell = document.createElement('div');
    cell.textContent = name;
    header.appendChild(cell);
  });
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'calendar-grid month';
  const today = startOfDay(new Date());
  const matrix = getMonthMatrix(baseDate);
  matrix.forEach((week) => {
    week.forEach((dayDate) => {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      const cellHeader = document.createElement('div');
      cellHeader.className = 'cell-header';
      const label = document.createElement('span');
      label.textContent = dayDate.getDate();
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'add-btn';
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => openModal('create', { start: toISOWithDefault(dayDate) }));
      cellHeader.appendChild(label);
      cellHeader.appendChild(addBtn);
      cell.appendChild(cellHeader);
      if (!isSameMonth(dayDate, baseDate)) cell.style.opacity = '0.5';
      if (isSameDay(dayDate, today)) cell.classList.add('today');

      eventsForDay(dayDate).forEach((event) => {
        const pill = buildEventPill(event);
        cell.appendChild(pill);
      });
      grid.appendChild(cell);
    });
  });
  container.appendChild(grid);
}

function renderBimestreView(container, baseDate) {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'bimestre-wrapper';
  const monthA = clone(baseDate);
  const monthB = addMonths(baseDate, 1);
  [monthA, monthB].forEach((monthDate) => {
    const section = document.createElement('div');
    section.className = 'month-section';
    const title = document.createElement('h3');
    title.textContent = monthDate.toLocaleDateString('es-MX', {
      month: 'long',
      year: 'numeric',
    });
    title.style.margin = '0 0 8px';
    title.style.textTransform = 'capitalize';
    section.appendChild(title);

    const header = document.createElement('div');
    header.className = 'calendar-header';
    WEEKDAY_SHORT.forEach((name) => {
      const cell = document.createElement('div');
      cell.textContent = name;
      header.appendChild(cell);
    });
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'calendar-grid month';
    const matrix = getMonthMatrix(monthDate);
    const today = startOfDay(new Date());
    matrix.forEach((week) => {
      week.forEach((dayDate) => {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        if (!isSameMonth(dayDate, monthDate)) cell.style.opacity = '0.5';
        if (isSameDay(dayDate, today)) cell.classList.add('today');
        const headerCell = document.createElement('div');
        headerCell.className = 'cell-header';
        const label = document.createElement('span');
        label.textContent = dayDate.getDate();
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'add-btn';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', () => openModal('create', { start: toISOWithDefault(dayDate) }));
        headerCell.appendChild(label);
        headerCell.appendChild(addBtn);
        cell.appendChild(headerCell);
        eventsForDay(dayDate).forEach((event) => {
          const pill = buildEventPill(event);
          cell.appendChild(pill);
        });
        grid.appendChild(cell);
      });
    });
    section.appendChild(grid);
    wrapper.appendChild(section);
  });
  container.appendChild(wrapper);
}

function renderWeekView(container, baseDate) {
  container.innerHTML = '';
  const startWeek = startOfWeek(baseDate);
  const days = Array.from({ length: 7 }, (_, idx) => addDays(startWeek, idx));

  const header = document.createElement('div');
  header.className = 'calendar-header';
  header.style.gridTemplateColumns = '120px repeat(7,1fr)';
  const spacer = document.createElement('div');
  spacer.textContent = '';
  header.appendChild(spacer);
  days.forEach((day) => {
    const cell = document.createElement('div');
    cell.textContent = `${WEEKDAY_SHORT[(day.getDay() + 6) % 7]} ${day.getDate()}`;
    header.appendChild(cell);
  });
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'time-grid';
  HOURS.forEach((hour) => {
    const row = document.createElement('div');
    row.className = 'time-row';
    const label = document.createElement('div');
    label.className = 'time-label';
    label.textContent = `${pad(hour)}:00`;
    row.appendChild(label);

    days.forEach((day) => {
      const slot = document.createElement('div');
      slot.className = 'time-slot';
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'add-btn';
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () =>
        openModal('create', { start: toISOWithHour(day, hour) }),
      );
      slot.appendChild(addBtn);
      eventsForHour(day, hour).forEach((event) => {
        const pill = buildEventPill(event);
        slot.appendChild(pill);
      });
      row.appendChild(slot);
    });
    grid.appendChild(row);
  });

  container.appendChild(grid);
}

function renderDayView(container, baseDate) {
  container.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'calendar-header';
  header.style.gridTemplateColumns = '120px 1fr';
  const spacer = document.createElement('div');
  spacer.textContent = '';
  header.appendChild(spacer);
  const label = document.createElement('div');
  label.textContent = formatDate(baseDate, { weekday: 'long', day: 'numeric', month: 'short' });
  header.appendChild(label);
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'time-grid';
  HOURS.forEach((hour) => {
    const row = document.createElement('div');
    row.className = 'time-row';
    const timeLabel = document.createElement('div');
    timeLabel.className = 'time-label';
    timeLabel.textContent = `${pad(hour)}:00`;
    row.appendChild(timeLabel);
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-btn';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => openModal('create', { start: toISOWithHour(baseDate, hour) }));
    slot.appendChild(addBtn);
    eventsForHour(baseDate, hour).forEach((event) => {
      const pill = buildEventPill(event);
      slot.appendChild(pill);
    });
    row.appendChild(slot);
    grid.appendChild(row);
  });
  container.appendChild(grid);
}

function toISOWithDefault(dayDate) {
  const local = startOfDay(dayDate);
  local.setHours(12, 0, 0, 0);
  return local.toISOString();
}

function toISOWithHour(dayDate, hour) {
  const local = startOfDay(dayDate);
  local.setHours(hour, 0, 0, 0);
  return local.toISOString();
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function buildEventPill(event) {
  const pill = document.createElement('div');
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : null;
  pill.className = `event-pill ${event.estado || ''}`;
  if (selectedId && String(event.id) === String(selectedId)) {
    pill.classList.add('selected');
  }
  pill.textContent = `${formatDate(start, { hour: '2-digit', minute: '2-digit' })} • ${
    event.contacto_nombre || 'Demo'
  }`;
  pill.addEventListener('click', () => {
    selectedId = event.id;
    renderCalendar();
    openModal('edit', event);
  });
  return pill;
}

function renderCalendar() {
  const canvas = $('agenda-canvas');
  if (!canvas) return;
  const title = $('calendar-title');
  if (title) {
    const label = formatDate(currentDate, { month: 'long', year: 'numeric' });
    if (currentView === 'week') {
      const startWeek = startOfWeek(currentDate);
      const endWeek = addDays(startWeek, 6);
      title.textContent = `${formatDate(startWeek, {
        day: 'numeric',
        month: 'short',
      })} – ${formatDate(endWeek, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else if (currentView === 'day') {
      title.textContent = formatDate(currentDate, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } else if (currentView === 'bimestre') {
      const monthB = addMonths(currentDate, 1);
      title.textContent = `${formatDate(currentDate, {
        month: 'long',
        year: 'numeric',
      })} / ${formatDate(monthB, { month: 'long', year: 'numeric' })}`;
    } else {
      title.textContent = label;
    }
  }

  canvas.innerHTML = '';
  if (currentView === 'month') {
    renderMonthView(canvas, currentDate);
  } else if (currentView === 'bimestre') {
    renderBimestreView(canvas, currentDate);
  } else if (currentView === 'week') {
    renderWeekView(canvas, currentDate);
  } else if (currentView === 'day') {
    renderDayView(canvas, currentDate);
  }
}

async function loadAgenda(showLoading = true) {
  if (showLoading) setStatus('agenda-status', 'Actualizando…');
  try {
    const qs = filtersToQuery();
    const { ok, json, status } = await fetchJSONWithAuth(`/api/agenda/demos?${qs.toString()}`);
    if (!ok) throw new Error(json?.detail || `Error (${status})`);
    agendaItems = Array.isArray(json?.items) ? json.items : [];
    if (selectedId && !agendaItems.some((item) => String(item.id) === String(selectedId))) {
      selectedId = null;
    }
    renderCalendar();
    if (showLoading) {
      setStatus('agenda-status', `Última actualización: ${new Date().toLocaleTimeString()}`);
    }
  } catch (error) {
    agendaItems = [];
    renderCalendar();
    setStatus(
      'agenda-status',
      error instanceof Error ? error.message : 'No fue posible cargar la agenda',
      true,
    );
  }
}

function openModal(mode, defaults = {}) {
  modalMode = mode;
  const modal = $('agenda-modal');
  if (!modal) return;
  modal.dataset.open = 'true';
  modal.setAttribute('aria-hidden', 'false');
  modal.style.display = 'flex';
  setStatus('modal-status', '');

  const title = $('#modal-title');
  if (title) title.textContent = mode === 'edit' ? 'Editar cita' : 'Nueva cita';
  const deleteBtn = $('#modal-delete');
  if (deleteBtn) deleteBtn.style.display = mode === 'edit' ? 'inline-flex' : 'none';

  const idInput = $('#modal-id');
  if (idInput) idInput.value = defaults.id || '';
  const tarjetaInput = $('#modal-tarjeta');
  if (tarjetaInput) tarjetaInput.value = defaults.tarjeta_id || '';
  const contactoInput = $('#modal-contacto');
  if (contactoInput) contactoInput.value = defaults.contacto_id || '';
  const conversacionInput = $('#modal-conversacion');
  if (conversacionInput) conversacionInput.value = defaults.conversacion_id || '';
  const inicioInput = $('#modal-inicio');
  if (inicioInput) inicioInput.value = serializeDateToLocal(defaults.start_at || defaults.start);
  const finInput = $('#modal-fin');
  if (finInput) finInput.value = serializeDateToLocal(defaults.end_at || defaults.end);
  const timezoneInput = $('#modal-timezone');
  if (timezoneInput) timezoneInput.value = defaults.timezone || 'America/Mexico_City';
  const estadoSelect = $('#modal-estado');
  if (estadoSelect) estadoSelect.value = ESTADOS.includes(defaults.estado) ? defaults.estado : 'pendiente';
  const providerSelect = $('#modal-provider');
  if (providerSelect) providerSelect.value = PROVIDERS.includes(defaults.provider) ? defaults.provider : 'hosting';
  const meetingInput = $('#modal-meeting');
  if (meetingInput) meetingInput.value = defaults.meeting_url || '';
  const locationInput = $('#modal-location');
  if (locationInput) locationInput.value = defaults.location || '';
  const notesInput = $('#modal-notes');
  if (notesInput) notesInput.value = defaults.notes || '';
  const metadataInput = $('#modal-metadata');
  if (metadataInput) {
    if (defaults.metadata && typeof defaults.metadata === 'object') {
      try {
        metadataInput.value = JSON.stringify(defaults.metadata, null, 2);
      } catch (error) {
        console.warn('[agenda] No se pudo serializar metadata del evento.', error);
        metadataInput.value = '';
      }
    } else {
      metadataInput.value = '';
    }
  }
  const motivoInput = $('#modal-motivo');
  if (motivoInput) motivoInput.value = defaults.cancel_reason || '';
  const cancelLabel = $('#modal-cancel-reason');
  if (cancelLabel) cancelLabel.style.display = defaults.estado === 'cancelada' ? 'flex' : 'none';

  const closeBtn = $('#modal-close');
  if (closeBtn) closeBtn.onclick = () => closeModal();

  if (tarjetaInput) tarjetaInput.focus();
}

function closeModal() {
  const modal = $('agenda-modal');
  if (!modal) return;
  modal.dataset.open = 'false';
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';
  setStatus('modal-status', '');
}

function extractPayload() {
  const tarjeta = $('#modal-tarjeta')?.value?.trim();
  if (!tarjeta) throw new Error('La tarjeta es obligatoria');
  const inicio = $('#modal-inicio')?.value || '';
  const startISO = toISO(inicio);
  if (!startISO) throw new Error('La fecha de inicio es inválida');

  const metadataRaw = $('#modal-metadata')?.value || '';
  let metadata = null;
  if (metadataRaw.trim()) metadata = parseJSONField(metadataRaw);

  const payload = {
    tarjeta_id: tarjeta,
    contacto_id: $('#modal-contacto')?.value?.trim() || undefined,
    conversacion_id: $('#modal-conversacion')?.value?.trim() || undefined,
    start_at: startISO,
    end_at: toISO($('#modal-fin')?.value || ''),
    timezone: $('#modal-timezone')?.value?.trim() || undefined,
    estado: $('#modal-estado')?.value || undefined,
    provider: $('#modal-provider')?.value || undefined,
    meeting_url: $('#modal-meeting')?.value?.trim() || undefined,
    location: $('#modal-location')?.value?.trim() || undefined,
    notes: $('#modal-notes')?.value?.trim() || undefined,
    cancel_reason: $('#modal-motivo')?.value?.trim() || undefined,
    metadata,
  };
  if (!payload.estado) delete payload.estado;
  if (!payload.provider) delete payload.provider;
  return payload;
}

async function submitModal(event) {
  event.preventDefault();
  try {
    const payload = extractPayload();
    const id = $('#modal-id')?.value || '';
    setStatus('modal-status', modalMode === 'edit' ? 'Actualizando…' : 'Creando…');
    let response;
    if (modalMode === 'edit' && id) {
      response = await fetchJSONWithAuth(`/api/agenda/demos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      response = await fetchJSONWithAuth('/api/agenda/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (!response.ok) throw new Error(response.json?.detail || `Error (${response.status})`);
    setStatus('modal-status', 'Guardado correctamente.');
    await loadAgenda(false);
    if (response.json?.item?.id) selectedId = response.json.item.id;
    closeModal();
    renderCalendar();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible guardar la cita';
    setStatus('modal-status', message, true);
  }
}

async function deleteAppointment() {
  const id = $('#modal-id')?.value || '';
  if (!id) {
    setStatus('modal-status', 'No hay cita seleccionada.', true);
    return;
  }
  if (!window.confirm('¿Eliminar la cita seleccionada? Esta acción no se puede deshacer.')) return;
  setStatus('modal-status', 'Eliminando…');
  const { ok, json, status } = await fetchJSONWithAuth(`/api/agenda/demos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!ok) {
    setStatus('modal-status', json?.detail || `Error (${status}) eliminando la cita`, true);
    return;
  }
  selectedId = null;
  await loadAgenda(false);
  closeModal();
  renderCalendar();
}

function changeView(view) {
  currentView = view;
  if (view === 'month' || view === 'bimestre') {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  } else if (view === 'week') {
    currentDate = startOfWeek(currentDate);
  } else if (view === 'day') {
    currentDate = startOfDay(currentDate);
  }
  const select = $('calendar-view');
  if (select) select.value = view;
  renderCalendar();
}

function gotoToday() {
  currentDate = startOfDay(new Date());
  renderCalendar();
}

function goNext() {
  if (currentView === 'month') currentDate = addMonths(currentDate, 1);
  else if (currentView === 'bimestre') currentDate = addMonths(currentDate, 2);
  else if (currentView === 'week') currentDate = addDays(currentDate, 7);
  else currentDate = addDays(currentDate, 1);
  renderCalendar();
}

function goPrev() {
  if (currentView === 'month') currentDate = addMonths(currentDate, -1);
  else if (currentView === 'bimestre') currentDate = addMonths(currentDate, -2);
  else if (currentView === 'week') currentDate = addDays(currentDate, -7);
  else currentDate = addDays(currentDate, -1);
  renderCalendar();
}

function attachEvents() {
  $('agenda-refresh')?.addEventListener('click', () => loadAgenda());
  $('filtro-rango')?.addEventListener('change', () => {
    normalizeFilters();
    loadAgenda();
  });
  $('filtro-desde')?.addEventListener('change', () => loadAgenda());
  $('filtro-hasta')?.addEventListener('change', () => loadAgenda());
  $('filtro-estado')?.addEventListener('change', () => loadAgenda());
  $('filtro-provider')?.addEventListener('change', () => loadAgenda());
  $('calendar-view')?.addEventListener('change', (event) => {
    changeView(event.target?.value || 'month');
  });
  $('#modal-form')?.addEventListener('submit', submitModal);
  $('#modal-delete')?.addEventListener('click', deleteAppointment);
  const closeBtn = $('#modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeModal();
    });
  }
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest('#modal-close')) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (target.closest('#cal-prev')) {
      event.preventDefault();
      goPrev();
      return;
    }
    if (target.closest('#cal-next')) {
      event.preventDefault();
      goNext();
      return;
    }
    if (target.closest('#cal-today')) {
      event.preventDefault();
      gotoToday();
      return;
    }
  });
  $('#agenda-modal')?.addEventListener('click', (event) => {
    if (event.target === $('agenda-modal')) closeModal();
  });
  $('#modal-estado')?.addEventListener('change', (event) => {
    $('#modal-cancel-reason').style.display = event.target?.value === 'cancelada' ? 'flex' : 'none';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('agenda-modal')?.dataset.open === 'true') closeModal();
  });
}

async function init() {
  setActiveNav('agenda');
  const session = await ensureSession();
  if (!session) return;
  normalizeFilters();
  const viewSelect = $('calendar-view');
  if (viewSelect) currentView = viewSelect.value || 'month';
  attachEvents();
  await loadAgenda();
  renderCalendar();
}

init();
