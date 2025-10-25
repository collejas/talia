import { createThemeManager } from './theme.js';

const NAV_LINKS = [
  { id: 'dashboard', href: '/panel/panel.html', label: 'Dashboard' },
  { id: 'inbox', href: '/panel/inbox.html', label: 'Inbox' },
  { id: 'config', href: '/panel/configuracion.html', label: 'Configuración' },
];

const THEME_OPTIONS = [
  { value: 'theme-aurora', label: 'Aurora violeta' },
  { value: 'theme-ice', label: 'Espectro vibrante' },
  { value: 'theme-void', label: 'Nocturno' },
];

function renderHeader() {
  if (typeof document === 'undefined' || !document.body) return null;
  let header = document.querySelector('header.nav[data-panel-header="true"]');
  if (header) return header;

  const navLinks = NAV_LINKS.map(
    (link) =>
      `<a class="btn btn-outline" data-nav="${link.id}" href="${link.href}">${link.label}</a>`
  ).join('');

  const themeOptions = THEME_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join('');

  header = document.createElement('header');
  header.className = 'nav';
  header.setAttribute('data-panel-header', 'true');
  header.innerHTML = `
    <div class="container nav-inner">
      <a class="brand" href="/panel/panel.html">
        <span class="logo">AI</span>
        <span class="brand-text">TalIA Panel</span>
      </a>
      <nav class="menu">
        ${navLinks}
        <div class="theme-switcher">
          <select id="panel-theme-select" class="btn btn-outline" aria-label="Cambiar tema visual">
            ${themeOptions}
          </select>
        </div>
        <span class="muted" id="user-email"></span>
      </nav>
    </div>
  `;

  document.body.insertBefore(header, document.body.firstChild);
  return header;
}

renderHeader();
const _themeSelect =
  typeof document !== 'undefined' ? document.getElementById('panel-theme-select') : null;
const _themeMeta =
  typeof document !== 'undefined' ? document.querySelector('meta[name="theme-color"]') : null;

if (_themeSelect) {
  try {
    createThemeManager({
      selectEl: _themeSelect,
      bodyEl: document.body,
      metaEl: _themeMeta,
      storageKey: 'talia-panel-theme-preference',
    });
  } catch (error) {
    console.warn('[panel] No se pudo inicializar el gestor de temas.', error);
  }
}

// Utilidades mínimas comunes para el panel

export function $(id) {
  return document.getElementById(id);
}

export async function fetchJSON(url, options) {
  const opts = { ...(options || {}) };
  const baseHeaders = { 'cache-control': 'no-cache' };
  const extraHeaders = (options && options.headers) || {};
  opts.headers = { ...baseHeaders, ...extraHeaders };
  const r = await fetch(url, opts);
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json };
}

let _sb = null;
export function createSupabase() {
  if (_sb) return _sb;
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return _sb;
}

export async function getSession() {
  const sb = createSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

export async function fetchJSONWithAuth(url, options) {
  const session = await getSession();
  const token = session?.access_token || null;
  if (!token) return { ok: false, status: 401, json: { error: 'auth_required' } };
  const headers = { ...(options?.headers || {}), Authorization: `Bearer ${token}` };
  return fetchJSON(url, { ...(options || {}), headers });
}

export async function ensureSession({ redirectTo = '/panel/auth/login.html', emailElId = 'user-email' } = {}) {
  const session = await getSession();
  if (!session) { window.location.href = redirectTo; return null; }
  const el = $(emailElId); if (el) el.textContent = session.user?.email || 'usuario';
  return session;
}

export function setActiveNav(section) {
  const links = document.querySelectorAll('[data-nav]');
  links.forEach((link) => {
    const isTarget = link.dataset.nav === section;
    link.classList.toggle('is-active', Boolean(section) && isTarget);
  });
}
