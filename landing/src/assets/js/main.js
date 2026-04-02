import { initialiseTheme } from './modules/theme.js';
import { initialiseChat } from './modules/chat.js?v=20260313c';
import { initialiseMobileNav } from './modules/mobile-nav.js';
import { initialiseLayoutObservers } from './modules/layout.js';
import { initialiseVisitTracking } from './modules/visit-tracking.js?v=20260313c';

initialiseTheme();
initialiseMobileNav();
initialiseLayoutObservers();

void bootstrapChat();

const currentYearEl = document.getElementById('current-year');
if (currentYearEl) {
  currentYearEl.textContent = new Date().getFullYear();
}

async function bootstrapChat() {
  const options = {};
  try {
    const response = await fetch('/api/webchat/config', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (typeof data?.persist_session === 'boolean') {
        options.persistSession = data.persist_session;
      }
      if (typeof data?.tenant_alias === 'string' && data.tenant_alias.trim()) {
        options.tenantAlias = data.tenant_alias.trim();
      }
    }
  } catch (error) {
    console.warn('[main] No se pudo obtener configuración del webchat.', error);
  }
  if (options.tenantAlias) {
    try {
      localStorage.setItem('talia-tenant-alias', options.tenantAlias);
    } catch (_error) {}
  }
  initialiseChat(options);
  initialiseVisitTracking({
    tenantAlias: options.tenantAlias ?? null,
    linkedSessionStorageKey: options.storageSessionKey ?? 'talia-webchat-session',
  });
}
