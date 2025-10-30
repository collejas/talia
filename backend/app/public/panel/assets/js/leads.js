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
    company: contactoRaw.company_name ?? null,
    notas: contactoRaw.notes ?? null,
    necesidad: contactoRaw.necesidad ?? contactoRaw.necesidad_proposito ?? null,
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

  return {
    id: row.id,
    canal: row.canal || '',
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
    lead_score: row.lead_score ?? null,
    probabilidad: row.probabilidad ?? row.probabilidad_override ?? null,
    siguiente_accion: row.siguiente_accion ?? null,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
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

function displayTags(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  const tags = metadata.tags;
  if (!Array.isArray(tags) || !tags.length) return '';
  return `<div class="lead-tags">${tags
    .slice(0, 4)
    .map((tag) => `<span class="lead-tag">${escapeHtml(String(tag))}</span>`)
    .join('')}</div>`;
}

function renderTable() {
  if (!elements.tableBody) return;
  if (!leadsState.items.length) {
    elements.tableBody.innerHTML = '<tr><td colspan="7" class="muted">No se encontraron leads.</td></tr>';
    return;
  }
  const rows = leadsState.items.map((item) => {
    const contacto = item.contacto || {};
    const etapaNombre = item.etapa?.nombre || 'Sin etapa';
    const vendedorNombre = item.asignado?.nombre || item.asignado?.correo || 'Sin asignar';
    const canalLabel = item.canal ? item.canal.charAt(0).toUpperCase() + item.canal.slice(1) : '—';
    const tagsHtml = displayTags(item.metadata);
    return `
      <tr>
        <td>
          <strong>${escapeHtml(contacto.nombre || 'Sin nombre')}</strong><br />
          <small class="muted">${escapeHtml(etapaNombre)}</small>
        </td>
        <td>
          ${escapeHtml(contacto.correo || '—')}<br />
          <small class="muted">${escapeHtml(contacto.telefono || '—')}</small>
        </td>
        <td>${escapeHtml(canalLabel)}</td>
        <td>${escapeHtml(etapaNombre)}</td>
        <td>${escapeHtml(vendedorNombre)}</td>
        <td>${escapeHtml(formatScore(item.lead_score))}</td>
        <td>${escapeHtml(formatDate(item.creado_en))}${tagsHtml}</td>
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
    const nota = contacto.notas ? `<p class="lead-notes"><strong>Notas:</strong> ${escapeHtml(contacto.notas)}</p>` : '';
    const necesidad = contacto.necesidad ? `<p class="lead-notes"><strong>Necesidad:</strong> ${escapeHtml(contacto.necesidad)}</p>` : '';
    const tagsHtml = displayTags(item.metadata);
    const metadataText = item.metadata ? `<pre style="margin:12px 0 0;white-space:pre-wrap;font-size:12px;background:var(--surface-alt);padding:12px;border-radius:12px;">${escapeHtml(JSON.stringify(item.metadata, null, 2))}</pre>` : '';
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
            <div><dt>Canal</dt><dd>${escapeHtml(item.canal || '—')}</dd></div>
            <div><dt>Vendedor</dt><dd>${escapeHtml(vendedorNombre)}</dd></div>
            <div><dt>Score</dt><dd>${escapeHtml(formatScore(item.lead_score))}</dd></div>
            <div><dt>Creado</dt><dd>${escapeHtml(formatDate(item.creado_en))}</dd></div>
            <div><dt>Actualizado</dt><dd>${escapeHtml(formatDate(item.actualizado_en))}</dd></div>
            <div><dt>Siguiente acción</dt><dd>${escapeHtml(item.siguiente_accion || '—')}</dd></div>
          </div>
          ${tagsHtml}
          ${nota}
          ${necesidad}
          ${metadataText}
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
}

export async function setupLeads() {
  resetLookups();
  initEvents();
  await fetchLeads({ reset: true });
}
