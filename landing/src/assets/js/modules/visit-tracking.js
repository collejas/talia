const defaultConfig = {
  apiBaseUrl: '/api/crm',
  endpointPath: '/web/visit',
  storageSessionKey: 'talia-web-session',
  linkedSessionStorageKey: 'talia-webchat-session',
  tenantAlias: null,
};

let config = { ...defaultConfig };
let sessionId = null;
let lastTrackedHref = null;
let historyListenersBound = false;
let pendingNavigationTimer = null;

function generateSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  const random = Math.random().toString(16).slice(2);
  return `sess-${Date.now()}-${random}`;
}

function readStorageValue(key) {
  if (!key) return null;
  try {
    const value = localStorage.getItem(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  } catch (error) {
    console.warn('[visit-tracking] No se pudo leer localStorage.', error);
  }
  return null;
}

function writeStorageValue(key, value) {
  if (!key || !value) return;
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn('[visit-tracking] No se pudo persistir session_id.', error);
  }
}

function ensureSessionId() {
  if (sessionId) return sessionId;
  const linkedStored = readStorageValue(config.linkedSessionStorageKey);
  const ownedStored = readStorageValue(config.storageSessionKey);
  sessionId = linkedStored || ownedStored || generateSessionId();
  writeStorageValue(config.storageSessionKey, sessionId);
  return sessionId;
}

function detectDeviceType(userAgent, screenInfo) {
  const ua = (userAgent || '').toLowerCase();
  const maxDim = Math.max(Number(screenInfo?.width) || 0, Number(screenInfo?.height) || 0);
  if (/mobile|iphone|ipod|android.*mobile|windows phone/.test(ua)) return 'mobile';
  if (/ipad|tablet|android/.test(ua) && !/mobile/.test(ua)) return 'tablet';
  if (maxDim && maxDim < 760 && /android/.test(ua)) return 'mobile';
  return 'desktop';
}

function collectClientContext() {
  const nav = window.navigator;
  const scr = window.screen;
  const userAgent = nav?.userAgent || '';
  const screenInfo = scr
    ? {
        width: scr.width,
        height: scr.height,
        availWidth: scr.availWidth,
        availHeight: scr.availHeight,
        colorDepth: scr.colorDepth,
        pixelRatio: window.devicePixelRatio,
      }
    : undefined;
  const timezone =
    typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined;
  return {
    user_agent: userAgent,
    language: nav?.language,
    languages: Array.isArray(nav?.languages) ? nav.languages : undefined,
    platform: nav?.platform,
    timezone,
    screen: screenInfo,
    device_type: detectDeviceType(userAgent, screenInfo),
    location_href: window.location.href,
    referrer: document.referrer || undefined,
  };
}

function buildPayload(reason) {
  const context = collectClientContext();
  const locationUrl = new URL(window.location.href);
  const utmSource = locationUrl.searchParams.get('utm_source');
  const utmMedium = locationUrl.searchParams.get('utm_medium');
  const utmCampaign = locationUrl.searchParams.get('utm_campaign');
  const utmTerm = locationUrl.searchParams.get('utm_term');
  const utmContent = locationUrl.searchParams.get('utm_content');

  const metadata = {
    client: context,
    reason,
    tenant_alias: config.tenantAlias || undefined,
  };

  return {
    session_id: ensureSessionId(),
    tenant_alias: config.tenantAlias || undefined,
    location_href: context.location_href,
    landing_url: context.location_href,
    referrer: context.referrer,
    user_agent: context.user_agent,
    device_type: context.device_type,
    utm_source: utmSource || undefined,
    utm_medium: utmMedium || undefined,
    utm_campaign: utmCampaign || undefined,
    utm_term: utmTerm || undefined,
    utm_content: utmContent || undefined,
    metadata,
  };
}

async function sendVisit(reason) {
  const currentHref = window.location.href;
  if (lastTrackedHref === currentHref && reason !== 'page_load') {
    return;
  }

  const payload = buildPayload(reason);
  try {
    const response = await fetch(`${config.apiBaseUrl}${config.endpointPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      keepalive: true,
    });
    if (response.ok) {
      lastTrackedHref = currentHref;
    }
  } catch (error) {
    console.warn('[visit-tracking] No se pudo registrar visita web.', error);
  }
}

function queueNavigationVisit(reason) {
  if (pendingNavigationTimer) {
    window.clearTimeout(pendingNavigationTimer);
  }
  pendingNavigationTimer = window.setTimeout(() => {
    pendingNavigationTimer = null;
    void sendVisit(reason);
  }, 60);
}

function bindHistoryListeners() {
  if (historyListenersBound) return;
  historyListenersBound = true;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function patchedPushState(...args) {
    originalPushState(...args);
    queueNavigationVisit('history_push');
  };

  window.history.replaceState = function patchedReplaceState(...args) {
    originalReplaceState(...args);
    queueNavigationVisit('history_replace');
  };

  window.addEventListener('popstate', () => queueNavigationVisit('history_pop'));
  window.addEventListener('hashchange', () => queueNavigationVisit('hash_change'));
}

export function initialiseVisitTracking(options = {}) {
  config = { ...defaultConfig, ...options };
  ensureSessionId();
  bindHistoryListeners();
  void sendVisit('page_load');
}

