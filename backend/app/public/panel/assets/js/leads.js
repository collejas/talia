import { $, fetchJSONWithAuth } from './common.js';

const leadsState = {
  items: [],
  total: 0,
  limit: 50,
  hasMore: false,
  loading: false,
  view: 'table',
  filters: {
    search: '',
    canal: '',
    etapa: '',
    vendedor: '',
  },
  lookups: {
    canales: new Map(),
    etapas: new Map(),
    vendedores: new Map(),
  },
};

const elements = {
  summary: $('lead-summary'),
  loading: $('lead-loading'),
  error: $('lead-error'),
  tableBody: $('lead-table-body'),
  tableContainer: $('lead-table-container'),
  accordionContainer: $('lead-accordion-container'),
  accordionList: $('lead-accordion'),
  loadMore: $('lead-load-more'),
  search: $('lead-search'),
  canal: $('lead-filter-canal'),
  etapa: $('lead-filter-etapa'),
  vendedor: $('lead-filter-vendedor'),
  clearFilters: $('lead-clear-filters'),
  viewTable: $('lead-view-table'),
  viewAccordion: $('lead-view-accordion'),
};

const leadModal = $('modal-lead');
const leadForm = $('form-editar-lead');
const leadModalInfo = $('modal-lead-info');
const leadModalSubtitle = $('modal-lead-subtitle');
const leadModalNombre = $('lead-modal-nombre');
const leadModalCorreo = $('lead-modal-correo');
const leadModalTelefono = $('lead-modal-telefono');
const leadModalEtapa = $('lead-modal-etapa');
const leadModalAsignado = $('lead-modal-asignado');
const leadModalScore = $('lead-modal-score');
const leadModalProb = $('lead-modal-probabilidad');
const leadModalNext = $('lead-modal-siguiente');
const leadModalTags = $('lead-modal-tags');

let activeLeadId = null;
let actionsInitialized = false;

let searchTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatScore(score) {
  if (score === null || score === undefined) return '—';
  const n = Number(score);
  if (Number.isNaN(n)) return '—';
  return `${n}%`;
}

function closeLeadModal() {
  if (!leadModal) return;
  leadModal.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  activeLeadId = null;
  if (leadForm) {
    leadForm.reset();
    delete leadForm.dataset.leadId;
  }
  if (leadModalInfo) leadModalInfo.textContent = '';
  if (leadModalSubtitle) leadModalSubtitle.textContent = '';
}

function openLeadModal() {
  if (!leadModal) return;
  leadModal.classList.add('is-open');
  document.body.classList.add('modal-open');
  const focusTarget =
    (leadModal && leadModal.querySelector('[data-initial-focus]')) ||
    leadModalEtapa ||
    leadModal.querySelector('input, select, textarea, button');
  if (focusTarget) focusTarget.focus();
}

if (leadModal) {
  leadModal.addEventListener('click', (event) => {
    if (event.target === leadModal) {
      closeLeadModal();
    }
  });
  leadModal.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', closeLeadModal);
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && leadModal?.classList.contains('is-open')) {
    closeLeadModal();
  }
});

function setLoading(isLoading) {
  if (elements.loading) {
    elements.loading.classList.toggle('is-visible', Boolean(isLoading));
  }
  if (elements.loadMore) {
    elements.loadMore.disabled = Boolean(isLoading);
  }
}

function showError(message) {
  if (!elements.error) return;
  elements.error.textContent = message;
  elements.error.classList.add('is-visible');
}

function hideError() {
  if (!elements.error) return;
  elements.error.classList.remove('is-visible');
}

function normalizeLead(row) {
  const contactoRaw = row.contacto || {};
  const contacto = {
    id: contactoRaw.id ?? row.contacto_id ?? null,
    nombre: contactoRaw.nombre ?? contactoRaw.nombre_completo ?? row.contacto_nombre ?? 'Sin nombre',
    correo: contactoRaw.correo ?? contactoRaw.email ?? row.contacto_correo ?? null,
    telefono: contactoRaw.telefono ?? contactoRaw.telefono_e164 ?? row.contacto_telefono ?? null,
    estado: contactoRaw.estado ?? null,
    empresa: contactoRaw.company_name ?? null,
    notasIA: contactoRaw.notes ?? null,
    resumenIA: contactoRaw.necesidad ?? contactoRaw.necesidad_proposito ?? null,
    creado_en: contactoRaw.creado_en ?? null,
  };

  const etapaRaw = row.etapa || {};
  const etapa = etapaRaw && typeof etapaRaw === 'object' ? {
    id: etapaRaw.id ?? null,
    nombre: etapaRaw.nombre ?? 'Sin etapa',
    categoria: etapaRaw.categoria ?? null,
    orden: etapaRaw.orden ?? null,
  } : null;

  const tableroRaw = row.tablero || {};
  const tablero = tableroRaw && typeof tableroRaw === 'object' ? {
    id: tableroRaw.id ?? null,
    nombre: tableroRaw.nombre ?? null,
    slug: tableroRaw.slug ?? null,
  } : null;

  const asignadoRaw = row.asignado || null;
  const asignado = asignadoRaw && typeof asignadoRaw === 'object' ? {
    id: asignadoRaw.id ?? null,
    nombre: asignadoRaw.nombre_completo ?? asignadoRaw.nombre ?? null,
    correo: asignadoRaw.correo ?? null,
  } : null;

  const propietarioRaw = row.propietario || null;
  const propietario = propietarioRaw && typeof propietarioRaw === 'object' ? {
    id: propietarioRaw.id ?? null,
    nombre: propietarioRaw.nombre_completo ?? propietarioRaw.nombre ?? null,
    correo: propietarioRaw.correo ?? null,
  } : null;

  let metadata = row.metadata;
  if (metadata && typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }

  const tags = Array.isArray(row.tags) ? row.tags : [];
  let siguienteAccion = null;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const rawNext = metadata.siguiente_accion;
    if (typeof rawNext === 'string' && rawNext.trim()) {
      siguienteAccion = rawNext.trim();
    }
  }

  return {
    id: row.id,
    canal: row.canal || '',
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
    lead_score: row.lead_score ?? null,
    probabilidad: row.probabilidad ?? row.probabilidad_override ?? null,
    siguiente_accion: siguienteAccion,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    tags,
    contacto,
    etapa,
    tablero,
    asignado,
    propietario,
  };
}

function resetLookups() {
  leadsState.lookups = {
    canales: new Map(),
    etapas: new Map(),
    vendedores: new Map(),
  };
}

function updateLookups(items, reset = false) {
  if (reset) resetLookups();
  for (const item of items) {
    if (item.canal) {
      const key = item.canal.toLowerCase();
      if (!leadsState.lookups.canales.has(key)) {
        leadsState.lookups.canales.set(key, {
          value: item.canal,
          label: item.canal.charAt(0).toUpperCase() + item.canal.slice(1),
        });
      }
    }
    if (item.etapa && item.etapa.id && !leadsState.lookups.etapas.has(item.etapa.id)) {
      leadsState.lookups.etapas.set(item.etapa.id, {
        id: item.etapa.id,
        nombre: item.etapa.nombre || 'Sin etapa',
        categoria: item.etapa.categoria || null,
      });
    }
    if (item.asignado && item.asignado.id && !leadsState.lookups.vendedores.has(item.asignado.id)) {
      leadsState.lookups.vendedores.set(item.asignado.id, {
        id: item.asignado.id,
        nombre: item.asignado.nombre || item.asignado.correo || 'Sin asignar',
        correo: item.asignado.correo || null,
      });
    }
  }
  updateFilterOptions();
}

function setSelectOptions(select, placeholder, entries, currentValue) {
  if (!select) return;
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`];
  for (const entry of entries) {
    let value; let label;
    if (typeof entry === 'string') {
      value = entry;
      label = entry;
    } else if (entry && typeof entry === 'object') {
      value = entry.id ?? entry.value;
      label = entry.nombre ?? entry.label ?? entry.value ?? value;
    }
    if (!value) continue;
    options.push(`<option value="${escapeHtml(String(value))}">${escapeHtml(String(label ?? value))}</option>`);
  }
  const previous = select.value;
  select.innerHTML = options.join('');
  const desired = currentValue || previous;
  const escaped =
    desired && typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(String(desired))
      : String(desired || '').replace(/"/g, '\\"');
  if (desired && select.querySelector(`option[value="${escaped}"]`)) {
    select.value = desired;
  } else {
    select.value = '';
  }
}

function ensureOption(select, value, label) {
  if (!select || !value) return;
  const exists = Array.from(select.options).some((opt) => opt.value === value);
  if (!exists) {
    select.insertAdjacentHTML(
      'beforeend',
      `<option value="${escapeHtml(value)}">${escapeHtml(label || value)}</option>`
    );
  }
}

function updateFilterOptions() {
  const canales = Array.from(leadsState.lookups.canales.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'es')
  );
  setSelectOptions(elements.canal, 'Todos los canales', canales, leadsState.filters.canal);

  const etapas = Array.from(leadsState.lookups.etapas.values()).sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '', 'es')
  );
  setSelectOptions(elements.etapa, 'Todas las etapas', etapas, leadsState.filters.etapa);

  const vendedores = Array.from(leadsState.lookups.vendedores.values()).sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '', 'es')
  );
  setSelectOptions(elements.vendedor, 'Todos los vendedores', vendedores, leadsState.filters.vendedor);

  updateEditSelects();
}

function updateEditSelects() {
  if (leadModalEtapa) {
    const etapas = Array.from(leadsState.lookups.etapas.values()).sort((a, b) =>
      (a.nombre || '').localeCompare(b.nombre || '', 'es')
    );
    setSelectOptions(leadModalEtapa, 'Selecciona etapa…', etapas, leadModalEtapa.value);
  }
  if (leadModalAsignado) {
    const vendedores = Array.from(leadsState.lookups.vendedores.values()).sort((a, b) =>
      (a.nombre || '').localeCompare(b.nombre || '', 'es')
    );
    setSelectOptions(leadModalAsignado, 'Sin asignar', vendedores, leadModalAsignado.value);
  }
}

function renderSummary() {
  if (!elements.summary) return;
  if (!leadsState.items.length) {
    elements.summary.textContent = 'Sin leads por mostrar.';
    return;
  }
  const total = leadsState.total || leadsState.items.length;
  elements.summary.textContent = `Mostrando ${leadsState.items.length} de ${total} leads`;
}

function displayTags(lead) {
  const tagsSource = Array.isArray(lead?.tags) && lead.tags.length
    ? lead.tags
    : Array.isArray(lead?.metadata?.tags)
      ? lead.metadata.tags
      : [];
  if (!tagsSource.length) return '';
  return `<div class="lead-tags">${tagsSource
    .slice(0, 4)
    .map((tag) => `<span class="lead-tag">${escapeHtml(String(tag))}</span>`)
    .join('')}</div>`;
}

function renderTable() {
  if (!elements.tableBody) return;
  if (!leadsState.items.length) {
    elements.tableBody.innerHTML = '<tr><td colspan="8" class="muted">No se encontraron leads.</td></tr>';
    return;
  }
  const rows = leadsState.items.map((item) => {
  const contacto = item.contacto || {};
  const etapaNombre = item.etapa?.nombre || 'Sin etapa';
  const vendedorNombre = item.asignado?.nombre || item.asignado?.correo || 'Sin asignar';
  const canalLabel = item.canal ? item.canal.charAt(0).toUpperCase() + item.canal.slice(1) : '—';
  const tagsHtml = displayTags(item);
  const empresa = contacto.empresa
    ? `<div><small class="muted">Empresa: ${escapeHtml(contacto.empresa)}</small></div>`
    : '';
  const notas = contacto.notasIA
    ? `<div><small class="muted">Notas IA: ${escapeHtml(contacto.notasIA)}</small></div>`
    : '';
  const resumen = contacto.resumenIA
    ? `<div><small class="muted">Resumen IA: ${escapeHtml(contacto.resumenIA)}</small></div>`
    : '';
  const acciones = `
      <div class="lead-actions">
        <button type="button" class="btn btn-outline" data-action="lead-edit" data-id="${escapeHtml(item.id)}">Editar</button>
        <button type="button" class="btn btn-outline" data-action="lead-delete" data-id="${escapeHtml(item.id)}">Eliminar</button>
      </div>
    `;
  return `
      <tr>
        <td>
          <strong>${escapeHtml(contacto.nombre || 'Sin nombre')}</strong><br />
          <small class="muted">${escapeHtml(etapaNombre)}</small>
        </td>
        <td>
          ${escapeHtml(contacto.correo || '—')}<br />
          <small class="muted">${escapeHtml(contacto.telefono || '—')}</small>
          ${empresa}
          ${notas}
          ${resumen}
        </td>
        <td>${escapeHtml(canalLabel)}</td>
        <td>${escapeHtml(etapaNombre)}</td>
        <td>${escapeHtml(vendedorNombre)}</td>
        <td>${escapeHtml(formatScore(item.lead_score))}</td>
        <td>
          ${escapeHtml(formatDate(item.creado_en))}<br />
          <small class="muted">${escapeHtml(item.siguiente_accion || '')}</small>
          ${tagsHtml}
        </td>
        <td>${acciones}</td>
      </tr>
    `;
  });
  elements.tableBody.innerHTML = rows.join('');
}

function renderAccordion() {
  if (!elements.accordionList) return;
  if (!leadsState.items.length) {
    elements.accordionList.innerHTML = '<p class="muted">No se encontraron leads.</p>';
    return;
  }
  const cards = leadsState.items.map((item) => {
    const contacto = item.contacto || {};
    const etapaNombre = item.etapa?.nombre || 'Sin etapa';
    const vendedorNombre = item.asignado?.nombre || item.asignado?.correo || 'Sin asignar';
    const nota = contacto.notasIA ? `<p class="lead-notes"><strong>Notas IA:</strong> ${escapeHtml(contacto.notasIA)}</p>` : '';
    const necesidad = contacto.resumenIA ? `<p class="lead-notes"><strong>Resumen IA:</strong> ${escapeHtml(contacto.resumenIA)}</p>` : '';
    const tagsHtml = displayTags(item);
    const metadataText =
      item.metadata && typeof item.metadata === 'object'
        ? `<pre style="margin:12px 0 0;white-space:pre-wrap;font-size:12px;background:var(--surface-alt);padding:12px;border-radius:12px;">${escapeHtml(JSON.stringify(item.metadata, null, 2))}</pre>`
        : '';
    const acciones = `
      <div class="lead-actions" style="margin-top:14px;">
        <button type="button" class="btn btn-outline" data-action="lead-edit" data-id="${escapeHtml(item.id)}">Editar</button>
        <button type="button" class="btn btn-outline" data-action="lead-delete" data-id="${escapeHtml(item.id)}">Eliminar</button>
      </div>
    `;
    return `
      <details class="lead-accordion-item">
        <summary>
          <span>${escapeHtml(contacto.nombre || 'Sin nombre')}</span>
          <span class="lead-accordion-meta">${escapeHtml(etapaNombre)} • ${escapeHtml(vendedorNombre)}</span>
        </summary>
        <div class="lead-accordion-body">
          <div class="lead-detail-grid">
            <div><dt>Correo</dt><dd>${escapeHtml(contacto.correo || '—')}</dd></div>
            <div><dt>Teléfono</dt><dd>${escapeHtml(contacto.telefono || '—')}</dd></div>
            <div><dt>Empresa</dt><dd>${escapeHtml(contacto.empresa || '—')}</dd></div>
            <div><dt>Canal</dt><dd>${escapeHtml(item.canal || '—')}</dd></div>
            <div><dt>Vendedor</dt><dd>${escapeHtml(vendedorNombre)}</dd></div>
            <div><dt>Score</dt><dd>${escapeHtml(formatScore(item.lead_score))}</dd></div>
            <div><dt>Creado</dt><dd>${escapeHtml(formatDate(item.creado_en))}</dd></div>
            <div><dt>Actualizado</dt><dd>${escapeHtml(formatDate(item.actualizado_en))}</dd></div>
            <div><dt>Siguiente acción</dt><dd>${escapeHtml(item.siguiente_accion || '—')}</dd></div>
            <div><dt>Notas IA</dt><dd>${escapeHtml(contacto.notasIA || '—')}</dd></div>
            <div><dt>Resumen IA</dt><dd>${escapeHtml(contacto.resumenIA || '—')}</dd></div>
          </div>
          ${tagsHtml}
          ${metadataText}
          ${acciones}
        </div>
      </details>
    `;
  });
  elements.accordionList.innerHTML = cards.join('');
}

function setView(view) {
  leadsState.view = view;
  if (elements.tableContainer) {
    elements.tableContainer.hidden = view !== 'table';
  }
  if (elements.accordionContainer) {
    elements.accordionContainer.hidden = view !== 'accordion';
  }
  if (elements.viewTable) {
    elements.viewTable.classList.toggle('is-active', view === 'table');
  }
  if (elements.viewAccordion) {
    elements.viewAccordion.classList.toggle('is-active', view === 'accordion');
  }
}

function updateLoadMore() {
  if (!elements.loadMore) return;
  if (!leadsState.hasMore) {
    elements.loadMore.disabled = true;
    elements.loadMore.textContent = leadsState.items.length ? 'No hay más resultados' : 'Sin resultados';
  } else {
    elements.loadMore.disabled = leadsState.loading;
    elements.loadMore.textContent = 'Cargar más';
  }
}

function renderAll() {
  renderSummary();
  renderTable();
  renderAccordion();
  setView(leadsState.view);
  updateLoadMore();
}

async function fetchLeads({ reset = false } = {}) {
  if (leadsState.loading) return;
  leadsState.loading = true;
  hideError();
  setLoading(true);

  const params = new URLSearchParams();
  params.set('limit', String(leadsState.limit));
  const offset = reset ? 0 : leadsState.items.length;
  params.set('offset', String(offset));

  const { search, canal, etapa, vendedor } = leadsState.filters;
  if (search) params.set('q', search);
  if (canal) params.set('canal', canal);
  if (etapa) params.set('etapa', etapa);
  if (vendedor) params.set('asignado', vendedor);

  try {
    const response = await fetchJSONWithAuth(`/api/leads?${params.toString()}`);
    if (!response.ok) {
      throw new Error(response.json?.detail || 'No se pudo obtener la lista de leads');
    }
    const data = response.json || {};
    const rows = Array.isArray(data.items) ? data.items : [];
    const normalized = rows.map(normalizeLead);
    if (reset) {
      leadsState.items = normalized;
      updateLookups(normalized, true);
    } else {
      leadsState.items = leadsState.items.concat(normalized);
      updateLookups(normalized, false);
    }
    leadsState.total = typeof data.total === 'number' ? data.total : leadsState.items.length;
    leadsState.hasMore = Boolean(data.has_more) || leadsState.items.length < leadsState.total;
    renderAll();
  } catch (error) {
    console.error(error);
    showError(error.message || 'No se pudo obtener la lista de leads');
  } finally {
    leadsState.loading = false;
    setLoading(false);
  }
}

function openLeadEditor(leadId) {
  const lead = leadsState.items.find((item) => item.id === leadId);
  if (!lead) {
    alert('No se encontró la información del lead.');
    return;
  }
  activeLeadId = leadId;
  if (leadForm) {
    leadForm.dataset.leadId = leadId;
  }
  if (leadModalSubtitle) {
    leadModalSubtitle.textContent = `ID: ${lead.id}`;
  }
  const contacto = lead.contacto || {};
  if (leadModalInfo) {
    const vendedor = lead.asignado?.nombre || lead.asignado?.correo || 'Sin asignar';
    leadModalInfo.innerHTML = `
      <strong>${escapeHtml(contacto.nombre || 'Sin nombre')}</strong><br />
      <span class="muted">${escapeHtml(contacto.correo || 'Sin correo')} • ${escapeHtml(contacto.telefono || 'Sin teléfono')}</span><br />
      <span class="muted">Vendedor actual: ${escapeHtml(vendedor)}</span>
    `;
  }
  if (leadModalNombre) leadModalNombre.value = contacto.nombre || '';
  if (leadModalCorreo) leadModalCorreo.value = contacto.correo || '';
  if (leadModalTelefono) leadModalTelefono.value = contacto.telefono || '';
  updateEditSelects();
  if (leadModalEtapa && lead.etapa?.id) {
    ensureOption(leadModalEtapa, lead.etapa.id, lead.etapa.nombre || lead.etapa.id);
    leadModalEtapa.value = lead.etapa.id;
  } else if (leadModalEtapa) {
    leadModalEtapa.value = '';
  }
  if (leadModalAsignado) {
    if (lead.asignado?.id) {
      ensureOption(
        leadModalAsignado,
        lead.asignado.id,
        lead.asignado.nombre || lead.asignado.correo || lead.asignado.id,
      );
      leadModalAsignado.value = lead.asignado.id;
    } else {
      leadModalAsignado.value = '';
    }
  }
  if (leadModalScore) {
    leadModalScore.value = lead.lead_score ?? '';
  }
  if (leadModalProb) {
    leadModalProb.value = lead.probabilidad ?? '';
  }
  if (leadModalNext) {
    leadModalNext.value = lead.siguiente_accion ?? '';
  }
  if (leadModalTags) {
    const tags = Array.isArray(lead.tags) && lead.tags.length
      ? lead.tags
      : Array.isArray(lead.metadata?.tags)
        ? lead.metadata.tags
        : [];
    leadModalTags.value = tags.join(', ');
  }
  openLeadModal();
}

async function submitLeadForm(event) {
  event.preventDefault();
  if (!activeLeadId) {
    alert('No se pudo identificar el lead a actualizar.');
    return;
  }

  const etapaId = leadModalEtapa?.value || '';
  if (!etapaId) {
    alert('Selecciona una etapa válida.');
    return;
  }

  const asignadoId = leadModalAsignado?.value || '';
  const leadScoreValue = leadModalScore?.value || '';
  const probValue = leadModalProb?.value || '';
  const siguienteAccion = leadModalNext?.value?.trim() || '';
  const tagsValue = leadModalTags?.value || '';
  const currentLead = leadsState.items.find((item) => item.id === activeLeadId) || null;
  const metadata = currentLead && currentLead.metadata && typeof currentLead.metadata === 'object' && !Array.isArray(currentLead.metadata)
    ? { ...currentLead.metadata }
    : {};

  if (siguienteAccion) {
    metadata.siguiente_accion = siguienteAccion;
  } else {
    delete metadata.siguiente_accion;
  }

  const tags = tagsValue
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const payload = {
    etapa_id: etapaId,
    asignado_a_usuario_id: asignadoId || null,
    metadata,
    tags,
  };

  const contactoPayload = {};
  if (leadModalNombre) {
    const value = leadModalNombre.value.trim();
    contactoPayload.nombre = value || null;
  }
  if (leadModalCorreo) {
    const value = leadModalCorreo.value.trim().toLowerCase();
    contactoPayload.correo = value || null;
  }
  if (leadModalTelefono) {
    const value = leadModalTelefono.value.trim();
    contactoPayload.telefono = value || null;
  }
  if (Object.keys(contactoPayload).length > 0) {
    payload.contacto = contactoPayload;
  }

  if (leadScoreValue) {
    const parsedScore = Number.parseInt(leadScoreValue, 10);
    if (!Number.isNaN(parsedScore)) {
      payload.lead_score = parsedScore;
    }
  } else {
    payload.lead_score = null;
  }

  if (probValue) {
    const parsedProb = Number.parseFloat(probValue);
    if (!Number.isNaN(parsedProb)) {
      payload.probabilidad_override = parsedProb;
    }
  } else {
    payload.probabilidad_override = null;
  }

  try {
    const response = await fetchJSONWithAuth(`/api/leads/${activeLeadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(response.json?.detail || 'No se pudo actualizar el lead');
    }
    closeLeadModal();
    await fetchLeads({ reset: true });
  } catch (error) {
    console.error(error);
    alert(error.message || 'No se pudo actualizar el lead');
  }
}

async function handleLeadDelete(leadId) {
  const lead = leadsState.items.find((item) => item.id === leadId);
  const nombre = lead?.contacto?.nombre || leadId;
  if (!confirm(`¿Eliminar el lead ${nombre}?`)) return;
  try {
    const response = await fetchJSONWithAuth(`/api/leads/${leadId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(response.json?.detail || 'No se pudo eliminar el lead');
    }
    if (activeLeadId === leadId) {
      closeLeadModal();
    }
    await fetchLeads({ reset: true });
  } catch (error) {
    console.error(error);
    alert(error.message || 'No se pudo eliminar el lead');
  }
}

function handleSearchInput(event) {
  const value = event.target.value || '';
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    leadsState.filters.search = value.trim();
    fetchLeads({ reset: true });
  }, 350);
}

function handleSelectChange(event) {
  const { id, value } = event.target;
  if (id === 'lead-filter-canal') {
    leadsState.filters.canal = value;
  } else if (id === 'lead-filter-etapa') {
    leadsState.filters.etapa = value;
  } else if (id === 'lead-filter-vendedor') {
    leadsState.filters.vendedor = value;
  }
  fetchLeads({ reset: true });
}

function clearFilters() {
  leadsState.filters = {
    search: '',
    canal: '',
    etapa: '',
    vendedor: '',
  };
  if (elements.search) elements.search.value = '';
  if (elements.canal) elements.canal.value = '';
  if (elements.etapa) elements.etapa.value = '';
  if (elements.vendedor) elements.vendedor.value = '';
  fetchLeads({ reset: true });
}

function initEvents() {
  if (elements.search) {
    elements.search.addEventListener('input', handleSearchInput);
  }
  if (elements.canal) {
    elements.canal.addEventListener('change', handleSelectChange);
  }
  if (elements.etapa) {
    elements.etapa.addEventListener('change', handleSelectChange);
  }
  if (elements.vendedor) {
    elements.vendedor.addEventListener('change', handleSelectChange);
  }
  if (elements.clearFilters) {
    elements.clearFilters.addEventListener('click', clearFilters);
  }
  if (elements.loadMore) {
    elements.loadMore.addEventListener('click', () => fetchLeads({ reset: false }));
  }
  if (elements.viewTable) {
    elements.viewTable.addEventListener('click', () => {
      setView('table');
    });
  }
  if (elements.viewAccordion) {
    elements.viewAccordion.addEventListener('click', () => {
      setView('accordion');
    });
  }
  if (leadForm) {
    leadForm.addEventListener('submit', submitLeadForm);
  }
}

function initActions() {
  if (actionsInitialized) return;
  actionsInitialized = true;
  document.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;
    if (!id) return;
    if (action === 'lead-edit') {
      event.preventDefault();
      openLeadEditor(id);
    } else if (action === 'lead-delete') {
      event.preventDefault();
      handleLeadDelete(id);
    }
  });
}

export async function setupLeads() {
  resetLookups();
  initEvents();
  initActions();
  await fetchLeads({ reset: true });
}
