import { $, ensureSession, fetchJSONWithAuth } from './common.js';

function showTab(tab) {
  for (const el of document.querySelectorAll('[data-tab]')) {
    el.style.display = el.dataset.tab === tab ? 'block' : 'none';
  }
  for (const el of document.querySelectorAll('[data-tab-btn]')) {
    el.classList.toggle('is-active', el.dataset.tabBtn === tab);
  }
}

async function loadRoles() {
  const r = await fetchJSONWithAuth('/api/auth/permisos');
  const el = $('roles-json');
  if (el) el.textContent = JSON.stringify(r.json || {}, null, 2);
}

async function loadAgentes() {
  const r = await fetchJSONWithAuth('/api/config/agentes');
  const el = $('agentes-json');
  if (el) el.textContent = JSON.stringify(r.json || {}, null, 2);
}

async function loadCanales() {
  const r = await fetchJSONWithAuth('/api/config/canales');
  const el = $('canales-json');
  if (el) el.textContent = JSON.stringify(r.json || {}, null, 2);
}

async function main() {
  await ensureSession();
  showTab('agentes');
  await Promise.all([loadRoles(), loadAgentes(), loadCanales()]);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab-btn]');
    if (btn) showTab(btn.dataset.tabBtn);
  });
}

void main();

