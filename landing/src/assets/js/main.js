import { initialiseTheme } from './modules/theme.js';
import { initialiseChat } from './modules/chat.js';
import { initialiseMobileNav } from './modules/mobile-nav.js';
import { initialiseLayoutObservers } from './modules/layout.js';

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
    }
  } catch (error) {
    console.warn('[main] No se pudo obtener configuración del webchat.', error);
  }
  initialiseChat(options);
}
