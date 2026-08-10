import { initialiseVisitTracking } from './modules/visit-tracking.js';

async function resolveTenantAlias() {
  const query = new URLSearchParams(window.location.search);
  const queryAlias = query.get('ta') || query.get('tenant_alias');
  if (queryAlias && queryAlias.trim()) return queryAlias.trim();

  try {
    const response = await fetch('/api/webchat/config', { cache: 'no-store' });
    if (response.ok) {
      const payload = await response.json();
      if (typeof payload?.tenant_alias === 'string' && payload.tenant_alias.trim()) {
        return payload.tenant_alias.trim();
      }
    }
  } catch (error) {
    console.warn('[site-tracking] No se pudo obtener la configuración pública.', error);
  }

  return null;
}

void resolveTenantAlias().then((tenantAlias) => {
  initialiseVisitTracking({ tenantAlias });
});
