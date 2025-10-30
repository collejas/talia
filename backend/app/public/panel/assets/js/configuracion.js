import { $, ensureSession, fetchJSONWithAuth } from './common.js';

const state = {
  personal: [],
  roles: [],
  departamentos: [],
  puestos: [],
};

const openModals = new Set();

function initModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return null;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal(modal);
  });
  modal.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(modal));
  });
  return modal;
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.add('is-open');
  openModals.add(modal);
  document.body.classList.add('modal-open');
  const focusTarget =
    modal.querySelector('[data-initial-focus]') || modal.querySelector('input, select, button');
  if (focusTarget) {
    focusTarget.focus();
  }
}

function closeModal(modal) {
  if (!modal) return;
  if (!modal.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  openModals.delete(modal);
  modal.querySelectorAll('form').forEach((form) => {
    form.reset();
    Object.keys(form.dataset || {}).forEach((key) => {
      delete form.dataset[key];
    });
  });
  Object.keys(modal.dataset || {}).forEach((key) => {
    delete modal.dataset[key];
  });
  if (openModals.size === 0) {
    document.body.classList.remove('modal-open');
  }
}

const modals = {
  user: initModal('modal-user'),
  employee: initModal('modal-employee'),
};

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openModals.size > 0) {
    for (const modal of [...openModals]) {
      closeModal(modal);
    }
  }
});

function showTab(tab) {
  for (const el of document.querySelectorAll('[data-tab]')) {
    el.style.display = el.dataset.tab === tab ? 'block' : 'none';
  }
  for (const el of document.querySelectorAll('[data-tab-btn]')) {
    el.classList.toggle('is-active', el.dataset.tabBtn === tab);
  }
}

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

function requestDetail(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (payload.detail) return payload.detail;
  if (payload.message) return payload.message;
  if (payload.error) return payload.error;
  if (payload.hint) return payload.hint;
  return '';
}

async function requestJSON(path, options, fallback) {
  const response = await fetchJSONWithAuth(path, options);
  if (!response.ok) {
    const detail = requestDetail(response.json);
    throw new Error(detail ? `${fallback}: ${detail}` : fallback);
  }
  return response.json || {};
}

function sortBy(arr, key) {
  return [...arr].sort((a, b) => {
    const aVal = (a?.[key] ?? '').toString().toLowerCase();
    const bVal = (b?.[key] ?? '').toString().toLowerCase();
    return aVal.localeCompare(bVal, 'es');
  });
}

function populateSelectors() {
  const usuarioSelect = document.querySelector(
    '#form-crear-empleado select[name="usuario_id"]',
  );
  if (usuarioSelect) {
    const current = usuarioSelect.value;
    const disponibles = state.personal.filter((item) => !item.empleado_creado_en);
    const options = [
      '<option value="">Usuario…</option>',
      ...sortBy(disponibles, 'correo').map((item) => {
        const correo = escapeHtml(item.correo ?? '');
        const nombre = escapeHtml(item.nombre_completo ?? '');
        return `<option value="${escapeHtml(item.usuario_id)}">${correo}${
          nombre ? ` • ${nombre}` : ''
        }</option>`;
      }),
    ];
    usuarioSelect.innerHTML = options.join('');
    if (current && usuarioSelect.querySelector(`option[value="${escapeHtml(current)}"]`)) {
      usuarioSelect.value = current;
    }
  }

  const departamentoTargets = [
    {
      element: document.querySelector('#form-crear-empleado select[name="departamento_id"]'),
      placeholder: '<option value="">Departamento (opcional)</option>',
    },
    {
      element: document.querySelector('#form-crear-departamento select[name="departamento_padre_id"]'),
      placeholder: '<option value="">Sin departamento padre</option>',
    },
    {
      element: document.querySelector('#form-crear-puesto select[name="departamento_id"]'),
      placeholder: '<option value="">Departamento (opcional)</option>',
    },
    {
      element: document.querySelector('#modal-employee select[name="departamento_id"]'),
      placeholder: '<option value="">Sin departamento</option>',
    },
  ].filter((target) => target.element);

  for (const target of departamentoTargets) {
    const { element, placeholder } = target;
    const current = element.value;
    const items = sortBy(state.departamentos, 'nombre');
    const options = [
      placeholder,
      ...items.map(
        (item) =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nombre ?? '')}</option>`,
      ),
    ];
    element.innerHTML = options.join('');
    if (current && element.querySelector(`option[value="${escapeHtml(current)}"]`)) {
      element.value = current;
    }
  }

  const puestoTargets = [
    {
      element: document.querySelector('#form-crear-empleado select[name="puesto_id"]'),
      placeholder: '<option value="">Puesto (opcional)</option>',
    },
    {
      element: document.querySelector('#modal-employee select[name="puesto_id"]'),
      placeholder: '<option value="">Sin puesto</option>',
    },
  ].filter((target) => target.element);

  for (const target of puestoTargets) {
    const { element, placeholder } = target;
    const current = element.value;
    const items = sortBy(state.puestos, 'nombre');
    const options = [
      placeholder,
      ...items.map((item) => {
        const dept = state.departamentos.find((d) => d.id === item.departamento_id);
        const info = dept ? `${item.nombre} • ${dept.nombre}` : item.nombre;
        return `<option value="${escapeHtml(item.id)}">${escapeHtml(info ?? '')}</option>`;
      }),
    ];
    element.innerHTML = options.join('');
    if (current && element.querySelector(`option[value="${escapeHtml(current)}"]`)) {
      element.value = current;
    }
  }
}

function renderUsuarios() {
  const tbody = document.querySelector('#tabla-usuarios tbody');
  if (!tbody) return;
  const rows = sortBy(state.personal, 'correo').map((item) => {
    const roles =
      Array.isArray(item.roles) && item.roles.length
        ? item.roles
            .map((rol) => `<span class="chip">${escapeHtml(rol.codigo ?? rol.nombre ?? '')}</span>`)
            .join('')
        : '<span class="muted">Sin roles</span>';
    const acciones = `
      <div class="config-actions">
        <button type="button" class="btn btn-outline" data-action="user-edit" data-id="${escapeHtml(
          item.usuario_id,
        )}">Editar</button>
        <button type="button" class="btn btn-outline" data-action="user-roles" data-id="${escapeHtml(
          item.usuario_id,
        )}">Roles</button>
        <button type="button" class="btn btn-outline" data-action="user-delete" data-id="${escapeHtml(
          item.usuario_id,
        )}">Eliminar</button>
      </div>
    `;
    return `
      <tr>
        <td>${escapeHtml(item.correo ?? '—')}</td>
        <td>${escapeHtml(item.nombre_completo ?? '—')}</td>
        <td>${escapeHtml((item.estado ?? '—').toString())}</td>
        <td>${escapeHtml(item.telefono_e164 ?? '—')}</td>
        <td>${roles}</td>
        <td>${formatDate(item.ultimo_acceso_en)}</td>
        <td>${acciones}</td>
      </tr>
    `;
  });
  tbody.innerHTML = rows.join('') || '<tr><td colspan="7" class="muted">Sin usuarios registrados.</td></tr>';
}

function renderEmpleados() {
  const tbody = document.querySelector('#tabla-empleados tbody');
  if (!tbody) return;
  const empleados = state.personal.filter((item) => item.empleado_creado_en);
  const rows = sortBy(empleados, 'correo').map((item) => {
    const dept = state.departamentos.find((d) => d.id === item.departamento_id);
    const puesto = state.puestos.find((p) => p.id === item.puesto_id);
    const acciones = `
      <div class="config-actions">
        <button type="button" class="btn btn-outline" data-action="employee-edit" data-id="${escapeHtml(
          item.usuario_id,
        )}">Editar</button>
        <button type="button" class="btn btn-outline" data-action="employee-delete" data-id="${escapeHtml(
          item.usuario_id,
        )}">Eliminar</button>
      </div>
    `;
    const vendedorLabel = item.es_vendedor ? 'Sí' : 'No';
    const vendedorInfo = item.es_vendedor && item.ultimo_lead_asignado_en
      ? `${vendedorLabel}<br><span class="muted">Último lead: ${formatDate(item.ultimo_lead_asignado_en)}</span>`
      : vendedorLabel;
    return `
      <tr>
        <td>${escapeHtml(item.correo ?? '—')}</td>
        <td>${escapeHtml(dept?.nombre ?? 'Sin departamento')}</td>
        <td>${escapeHtml(puesto?.nombre ?? 'Sin puesto')}</td>
        <td>${vendedorInfo}</td>
        <td>${item.es_gestor ? 'Sí' : 'No'}</td>
        <td>${formatDate(item.empleado_creado_en)}</td>
        <td>${acciones}</td>
      </tr>
    `;
  });
  tbody.innerHTML =
    rows.join('') || '<tr><td colspan="7" class="muted">Aún no hay empleados registrados.</td></tr>';
}

function renderDepartamentos() {
  const tbody = document.querySelector('#tabla-departamentos tbody');
  if (!tbody) return;
  const rows = sortBy(state.departamentos, 'nombre').map((item) => {
    const padre = state.departamentos.find((d) => d.id === item.departamento_padre_id);
    const acciones = `
      <div class="config-actions">
        <button type="button" class="btn btn-outline" data-action="departamento-edit" data-id="${escapeHtml(
          item.id,
        )}">Editar</button>
        <button type="button" class="btn btn-outline" data-action="departamento-delete" data-id="${escapeHtml(
          item.id,
        )}">Eliminar</button>
      </div>
    `;
    return `
      <tr>
        <td>${escapeHtml(item.nombre ?? '—')}</td>
        <td>${escapeHtml(padre?.nombre ?? '—')}</td>
        <td>${formatDate(item.creado_en)}</td>
        <td>${acciones}</td>
      </tr>
    `;
  });
  tbody.innerHTML =
    rows.join('') ||
    '<tr><td colspan="4" class="muted">Sin departamentos. Crea el primero para comenzar.</td></tr>';
}

function renderPuestos() {
  const tbody = document.querySelector('#tabla-puestos tbody');
  if (!tbody) return;
  const rows = sortBy(state.puestos, 'nombre').map((item) => {
    const dept = state.departamentos.find((d) => d.id === item.departamento_id);
    const acciones = `
      <div class="config-actions">
        <button type="button" class="btn btn-outline" data-action="puesto-edit" data-id="${escapeHtml(
          item.id,
        )}">Editar</button>
        <button type="button" class="btn btn-outline" data-action="puesto-delete" data-id="${escapeHtml(
          item.id,
        )}">Eliminar</button>
      </div>
    `;
    return `
      <tr>
        <td>${escapeHtml(item.nombre ?? '—')}</td>
        <td>${escapeHtml(dept?.nombre ?? '—')}</td>
        <td>${escapeHtml(item.descripcion ?? '—')}</td>
        <td>${formatDate(item.creado_en)}</td>
        <td>${acciones}</td>
      </tr>
    `;
  });
  tbody.innerHTML =
    rows.join('') ||
    '<tr><td colspan="5" class="muted">Crea puestos para asociarlos a los empleados.</td></tr>';
}

function renderRoles() {
  const tbody = document.querySelector('#tabla-roles tbody');
  if (!tbody) return;
  const rows = sortBy(state.roles, 'codigo').map((item) => {
    const acciones = `
      <div class="config-actions">
        <button type="button" class="btn btn-outline" data-action="rol-edit" data-id="${escapeHtml(
          item.id,
        )}">Editar</button>
        <button type="button" class="btn btn-outline" data-action="rol-delete" data-id="${escapeHtml(
          item.id,
        )}">Eliminar</button>
      </div>
    `;
    return `
      <tr>
        <td>${escapeHtml(item.codigo ?? '—')}</td>
        <td>${escapeHtml(item.nombre ?? '—')}</td>
        <td>${escapeHtml(item.descripcion ?? '—')}</td>
        <td>${formatDate(item.creado_en)}</td>
        <td>${acciones}</td>
      </tr>
    `;
  });
  tbody.innerHTML =
    rows.join('') || '<tr><td colspan="5" class="muted">Sin roles personalizados registrados.</td></tr>';
}

async function loadRRHH() {
  try {
    const data = await requestJSON('/api/config/personal', {}, 'No se pudo cargar la configuración');
    state.personal = Array.isArray(data.personal) ? data.personal : [];
    state.roles = Array.isArray(data.roles) ? data.roles : [];
    state.departamentos = Array.isArray(data.departamentos) ? data.departamentos : [];
    state.puestos = Array.isArray(data.puestos) ? data.puestos : [];
    renderUsuarios();
    renderEmpleados();
    renderDepartamentos();
    renderPuestos();
    renderRoles();
    populateSelectors();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function loadAgentes() {
  const target = $('agentes-json');
  if (!target) return;
  const response = await fetchJSONWithAuth('/api/config/agentes');
  target.textContent = JSON.stringify(response.json || {}, null, 2);
}

async function loadCanales() {
  const target = $('canales-json');
  if (!target) return;
  const response = await fetchJSONWithAuth('/api/config/canales');
  target.textContent = JSON.stringify(response.json || {}, null, 2);
}

function optionsList(items, labelFn) {
  if (!items.length) return 'Sin opciones registradas.';
  return items.map(labelFn).join('\n');
}

function handleUserEdit(usuarioId) {
  const usuario = state.personal.find((item) => item.usuario_id === usuarioId);
  if (!usuario) {
    alert('No se encontró el usuario seleccionado.');
    return;
  }
  const modal = modals.user;
  const form = document.getElementById('form-editar-usuario');
  if (!modal || !form) return;
  modal.dataset.userId = usuarioId;
  form.dataset.userId = usuarioId;
  const subtitle = document.getElementById('modal-user-subtitle');
  if (subtitle) {
    const correo = usuario.correo || 'Sin correo';
    subtitle.textContent = `${correo} • ID: ${usuario.usuario_id}`;
  }
  const correoInput = document.getElementById('modal-usuario-correo');
  const nombreInput = document.getElementById('modal-usuario-nombre');
  const telefonoInput = document.getElementById('modal-usuario-telefono');
  const estadoSelect = document.getElementById('modal-usuario-estado');
  if (correoInput) correoInput.value = usuario.correo || '';
  if (nombreInput) nombreInput.value = usuario.nombre_completo || '';
  if (telefonoInput) telefonoInput.value = usuario.telefono_e164 || '';
  if (estadoSelect) estadoSelect.value = usuario.estado || 'activo';
  openModal(modal);
}

async function handleUserDelete(usuarioId) {
  const usuario = state.personal.find((item) => item.usuario_id === usuarioId);
  const correo = usuario?.correo || usuarioId;
  if (!confirm(`¿Eliminar el usuario ${correo}? Esta acción elimina sus roles y empleado asociado.`)) {
    return;
  }
  if (modals.user?.classList.contains('is-open') && modals.user.dataset.userId === usuarioId) {
    closeModal(modals.user);
  }
  if (modals.employee?.classList.contains('is-open') && modals.employee.dataset.usuarioId === usuarioId) {
    closeModal(modals.employee);
  }
  await requestJSON(
    `/api/config/usuarios/${usuarioId}`,
    { method: 'DELETE' },
    'No se pudo eliminar el usuario',
  );
  await loadRRHH();
}

async function handleUserRoles(usuarioId) {
  const usuario = state.personal.find((item) => item.usuario_id === usuarioId);
  if (!usuario) return;
  const actuales = Array.isArray(usuario.roles)
    ? usuario.roles.map((rol) => rol.codigo || rol.nombre || '').filter(Boolean)
    : [];
  const disponibles = optionsList(
    sortBy(state.roles, 'codigo'),
    (rol) => `${rol.codigo} • ${rol.nombre ?? ''}`.trim(),
  );
  const entrada = prompt(
    `Ingresa los códigos de rol separados por coma.\nDisponibles:\n${disponibles}`,
    actuales.join(','),
  );
  if (entrada === null) return;
  const seleccion = entrada
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const ids = [];
  for (const codigo of seleccion) {
    const rol = state.roles.find((item) => (item.codigo || '').toLowerCase() === codigo);
    if (rol) {
      ids.push(rol.id);
    } else {
      alert(`Rol desconocido: ${codigo}`);
      return;
    }
  }
  await requestJSON(
    `/api/config/usuarios/${usuarioId}/roles`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: ids }),
    },
    'No se pudieron actualizar los roles',
  );
  await loadRRHH();
}

function handleEmployeeEdit(usuarioId) {
  const empleado = state.personal.find((item) => item.usuario_id === usuarioId);
  if (!empleado) {
    alert('No se encontró el empleado seleccionado.');
    return;
  }
  const modal = modals.employee;
  const form = document.getElementById('form-editar-empleado');
  if (!modal || !form) return;
  modal.dataset.usuarioId = usuarioId;
  form.dataset.usuarioId = usuarioId;
  const subtitle = document.getElementById('modal-employee-subtitle');
  if (subtitle) {
    const correo = empleado.correo || 'Sin correo';
    subtitle.textContent = `${correo} • ID: ${empleado.usuario_id}`;
  }
  const meta = document.getElementById('modal-employee-meta');
  if (meta) {
    if (empleado.es_vendedor) {
      meta.textContent = `Último lead asignado: ${formatDate(empleado.ultimo_lead_asignado_en)}`;
    } else {
      meta.textContent = 'Este empleado no participa en la asignación de leads.';
    }
  }
  const deptSelect = document.getElementById('modal-empleado-departamento');
  if (deptSelect) {
    if (!deptSelect.options.length) populateSelectors();
    deptSelect.value = empleado.departamento_id || '';
  }
  const puestoSelect = document.getElementById('modal-empleado-puesto');
  if (puestoSelect) {
    if (!puestoSelect.options.length) populateSelectors();
    puestoSelect.value = empleado.puesto_id || '';
  }
  const gestorCheckbox = form.querySelector('input[name="es_gestor"]');
  if (gestorCheckbox) gestorCheckbox.checked = Boolean(empleado.es_gestor);
  const vendedorCheckbox = form.querySelector('input[name="es_vendedor"]');
  if (vendedorCheckbox) vendedorCheckbox.checked = Boolean(empleado.es_vendedor);
  openModal(modal);
}

async function handleEmployeeDelete(usuarioId) {
  const empleado = state.personal.find((item) => item.usuario_id === usuarioId);
  const correo = empleado?.correo || usuarioId;
  if (!confirm(`¿Eliminar la ficha de empleado de ${correo}?`)) return;
  if (modals.employee?.classList.contains('is-open') && modals.employee.dataset.usuarioId === usuarioId) {
    closeModal(modals.employee);
  }
  await requestJSON(
    `/api/config/empleados/${usuarioId}`,
    { method: 'DELETE' },
    'No se pudo eliminar el empleado',
  );
  await loadRRHH();
}

async function handleDepartamentoEdit(id) {
  const dept = state.departamentos.find((item) => item.id === id);
  if (!dept) return;
  const nombre = prompt('Nombre del departamento:', dept.nombre || '');
  if (nombre === null) return;
  const padreLista = optionsList(
    sortBy(state.departamentos, 'nombre').filter((item) => item.id !== id),
    (item) => `${item.id} • ${item.nombre}`,
  );
  const padreEntrada = prompt(
    `Departamento padre (ID, vacío para ninguno):\n${padreLista}`,
    dept.departamento_padre_id || '',
  );
  if (padreEntrada === null) return;
  const padreId = padreEntrada.trim() || null;
  if (padreId === id) {
    alert('Un departamento no puede ser su propio padre.');
    return;
  }
  const payload = {
    nombre: nombre.trim() || undefined,
    departamento_padre_id: padreId,
  };
  await requestJSON(
    `/api/config/departamentos/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'No se pudo actualizar el departamento',
  );
  await loadRRHH();
}

async function handleDepartamentoDelete(id) {
  const dept = state.departamentos.find((item) => item.id === id);
  if (!dept) return;
  if (!confirm(`¿Eliminar el departamento ${dept.nombre}?`)) return;
  await requestJSON(
    `/api/config/departamentos/${id}`,
    { method: 'DELETE' },
    'No se pudo eliminar el departamento',
  );
  await loadRRHH();
}

async function handlePuestoEdit(id) {
  const puesto = state.puestos.find((item) => item.id === id);
  if (!puesto) return;
  const nombre = prompt('Nombre del puesto:', puesto.nombre || '');
  if (nombre === null) return;
  const descripcion = prompt('Descripción (opcional):', puesto.descripcion || '');
  if (descripcion === null) return;
  const deptLista = optionsList(
    sortBy(state.departamentos, 'nombre'),
    (item) => `${item.id} • ${item.nombre}`,
  );
  const deptEntrada = prompt(
    `Departamento (ID, vacío para ninguno):\n${deptLista}`,
    puesto.departamento_id || '',
  );
  if (deptEntrada === null) return;
  const payload = {
    nombre: nombre.trim() || undefined,
    descripcion: descripcion.trim() || null,
    departamento_id: deptEntrada.trim() || null,
  };
  await requestJSON(
    `/api/config/puestos/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'No se pudo actualizar el puesto',
  );
  await loadRRHH();
}

async function handlePuestoDelete(id) {
  const puesto = state.puestos.find((item) => item.id === id);
  if (!puesto) return;
  if (!confirm(`¿Eliminar el puesto ${puesto.nombre}?`)) return;
  await requestJSON(
    `/api/config/puestos/${id}`,
    { method: 'DELETE' },
    'No se pudo eliminar el puesto',
  );
  await loadRRHH();
}

async function handleRolEdit(id) {
  const rol = state.roles.find((item) => item.id === id);
  if (!rol) return;
  const nombre = prompt('Nombre del rol:', rol.nombre || '');
  if (nombre === null) return;
  const descripcion = prompt('Descripción (opcional):', rol.descripcion || '');
  if (descripcion === null) return;
  const payload = {
    nombre: nombre.trim() || undefined,
    descripcion: descripcion.trim() || null,
  };
  await requestJSON(
    `/api/config/roles/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'No se pudo actualizar el rol',
  );
  await loadRRHH();
}

async function handleRolDelete(id) {
  const rol = state.roles.find((item) => item.id === id);
  if (!rol) return;
  if (!confirm(`¿Eliminar el rol ${rol.codigo}?`)) return;
  await requestJSON(
    `/api/config/roles/${id}`,
    { method: 'DELETE' },
    'No se pudo eliminar el rol',
  );
  await loadRRHH();
}

function setupFormHandlers() {
  const formUsuario = document.getElementById('form-crear-usuario');
  if (formUsuario) {
    formUsuario.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(formUsuario);
      const payload = {
        id: (data.get('id') || '').toString().trim(),
        correo: (data.get('correo') || '').toString().trim(),
        nombre_completo: (data.get('nombre_completo') || '').toString().trim() || undefined,
        telefono_e164: (data.get('telefono_e164') || '').toString().trim() || undefined,
        estado: (data.get('estado') || 'activo').toString(),
      };
      if (!payload.id || !payload.correo) {
        alert('El UUID y el correo son obligatorios.');
        return;
      }
      try {
        await requestJSON(
          '/api/config/usuarios',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          'No se pudo crear el usuario',
        );
        formUsuario.reset();
        const estadoSelect = formUsuario.querySelector('select[name="estado"]');
        if (estadoSelect) estadoSelect.value = 'activo';
        await loadRRHH();
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    });
  }

  const formEmpleado = document.getElementById('form-crear-empleado');
  if (formEmpleado) {
    formEmpleado.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(formEmpleado);
      const usuarioId = (data.get('usuario_id') || '').toString().trim();
      if (!usuarioId) {
        alert('Selecciona un usuario.');
        return;
      }
      const payload = {
        usuario_id: usuarioId,
        departamento_id: (data.get('departamento_id') || '').toString().trim() || null,
        puesto_id: (data.get('puesto_id') || '').toString().trim() || null,
        es_gestor: data.get('es_gestor') === 'on',
        es_vendedor: data.get('es_vendedor') === 'on',
      };
      try {
        await requestJSON(
          '/api/config/empleados',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          'No se pudo crear el empleado',
        );
        formEmpleado.reset();
        await loadRRHH();
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    });
  }

  const formEditarUsuario = document.getElementById('form-editar-usuario');
  if (formEditarUsuario) {
    formEditarUsuario.addEventListener('submit', async (event) => {
      event.preventDefault();
      const userId = formEditarUsuario.dataset.userId;
      if (!userId) {
        alert('No se pudo identificar el usuario a actualizar.');
        return;
      }
      const data = new FormData(formEditarUsuario);
      const correo = (data.get('correo') || '').toString().trim();
      if (!correo) {
        alert('El correo es obligatorio.');
        return;
      }
      const nombre = (data.get('nombre_completo') || '').toString().trim();
      const telefono = (data.get('telefono_e164') || '').toString().trim();
      const estado = (data.get('estado') || 'activo').toString();
      if (estado !== 'activo' && estado !== 'inactivo') {
        alert('Selecciona un estado válido.');
        return;
      }
      const payload = {
        correo,
        nombre_completo: nombre || null,
        telefono_e164: telefono || null,
        estado,
      };
      try {
        await requestJSON(
          `/api/config/usuarios/${userId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          'No se pudo actualizar el usuario',
        );
        closeModal(modals.user);
        await loadRRHH();
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    });
  }

  const formEditarEmpleado = document.getElementById('form-editar-empleado');
  if (formEditarEmpleado) {
    formEditarEmpleado.addEventListener('submit', async (event) => {
      event.preventDefault();
      const usuarioId = formEditarEmpleado.dataset.usuarioId;
      if (!usuarioId) {
        alert('No se pudo identificar el empleado a actualizar.');
        return;
      }
      const data = new FormData(formEditarEmpleado);
      const departamentoId = (data.get('departamento_id') || '').toString().trim();
      const puestoId = (data.get('puesto_id') || '').toString().trim();
      const payload = {
        departamento_id: departamentoId || null,
        puesto_id: puestoId || null,
        es_gestor: data.get('es_gestor') === 'on',
        es_vendedor: data.get('es_vendedor') === 'on',
      };
      try {
        await requestJSON(
          `/api/config/empleados/${usuarioId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          'No se pudo actualizar el empleado',
        );
        closeModal(modals.employee);
        await loadRRHH();
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    });
  }

  const formDepartamento = document.getElementById('form-crear-departamento');
  if (formDepartamento) {
    formDepartamento.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(formDepartamento);
      const nombre = (data.get('nombre') || '').toString().trim();
      if (!nombre) {
        alert('El nombre del departamento es obligatorio.');
        return;
      }
      const payload = {
        nombre,
        departamento_padre_id: (data.get('departamento_padre_id') || '').toString().trim() || null,
      };
      try {
        await requestJSON(
          '/api/config/departamentos',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          'No se pudo crear el departamento',
        );
        formDepartamento.reset();
        await loadRRHH();
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    });
  }

  const formPuesto = document.getElementById('form-crear-puesto');
  if (formPuesto) {
    formPuesto.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(formPuesto);
      const nombre = (data.get('nombre') || '').toString().trim();
      if (!nombre) {
        alert('El nombre del puesto es obligatorio.');
        return;
      }
      const payload = {
        nombre,
        descripcion: (data.get('descripcion') || '').toString().trim() || null,
        departamento_id: (data.get('departamento_id') || '').toString().trim() || null,
      };
      try {
        await requestJSON(
          '/api/config/puestos',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          'No se pudo crear el puesto',
        );
        formPuesto.reset();
        await loadRRHH();
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    });
  }

  const formRol = document.getElementById('form-crear-rol');
  if (formRol) {
    formRol.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(formRol);
      const codigo = (data.get('codigo') || '').toString().trim();
      const nombre = (data.get('nombre') || '').toString().trim();
      if (!codigo || !nombre) {
        alert('El código y el nombre del rol son obligatorios.');
        return;
      }
      const payload = {
        codigo,
        nombre,
        descripcion: (data.get('descripcion') || '').toString().trim() || null,
      };
      try {
        await requestJSON(
          '/api/config/roles',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          'No se pudo crear el rol',
        );
        formRol.reset();
        await loadRRHH();
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    });
  }
}

function setupClickHandlers() {
  document.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-tab-btn]');
    if (tab) {
      event.preventDefault();
      showTab(tab.dataset.tabBtn);
      return;
    }

    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    event.preventDefault();
    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;
    try {
      switch (action) {
        case 'user-edit':
          await handleUserEdit(id);
          break;
        case 'user-delete':
          await handleUserDelete(id);
          break;
        case 'user-roles':
          await handleUserRoles(id);
          break;
        case 'employee-edit':
          await handleEmployeeEdit(id);
          break;
        case 'employee-delete':
          await handleEmployeeDelete(id);
          break;
        case 'departamento-edit':
          await handleDepartamentoEdit(id);
          break;
        case 'departamento-delete':
          await handleDepartamentoDelete(id);
          break;
        case 'puesto-edit':
          await handlePuestoEdit(id);
          break;
        case 'puesto-delete':
          await handlePuestoDelete(id);
          break;
        case 'rol-edit':
          await handleRolEdit(id);
          break;
        case 'rol-delete':
          await handleRolDelete(id);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  });
}

async function main() {
  await ensureSession();
  setupFormHandlers();
  setupClickHandlers();
  showTab('personal');
  await loadRRHH();
  await Promise.allSettled([loadAgentes(), loadCanales()]);
}

void main();
