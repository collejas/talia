const defaultConfig = {
  apiBaseUrl: '/api/crm',
  endpointPath: '/web/visit',
  endpointUrl: null,
  storageSessionKey: 'talia-web-session',
  storageSessionMetaKey: 'talia-web-session-meta',
  linkedSessionStorageKey: 'talia-webchat-session',
  publicSiteId: null,
  browserGeoStorageKey: 'talia-browser-geo-v1',
  tenantAlias: null,
  sessionTtlMs: 12 * 60 * 60 * 1000,
};

let config = { ...defaultConfig };
let sessionId = null;
let lastTrackedHref = null;
let historyListenersBound = false;
let pendingNavigationTimer = null;
let browserGeoPromise = null;
const INITIALIZED_GLOBAL_KEY = '__TALIA_VISIT_TRACKING_INITIALIZED__';

const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TRACKED_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'twclid',
  'li_fat_id',
];

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

function readStorageJson(key) {
  const raw = readStorageValue(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function writeStorageJson(key, payload) {
  if (!key || !payload || typeof payload !== 'object') return;
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (_error) {}
}

function ensureSessionId() {
  if (sessionId) return sessionId;
  const now = Date.now();
  const ttl = Number(config.sessionTtlMs) || 0;
  const meta = readStorageJson(config.storageSessionMetaKey) || {};
  const linkedStored = readStorageValue(config.linkedSessionStorageKey);
  const ownedStored = readStorageValue(config.storageSessionKey);
  let candidate = linkedStored || ownedStored || null;
  let createdAt = typeof meta.created_at === 'number' ? meta.created_at : null;
  if (!createdAt && typeof meta.createdAt === 'number') {
    createdAt = meta.createdAt;
  }
  if (!candidate || meta.id !== candidate) {
    createdAt = now;
  }
  const expired = Boolean(ttl && createdAt && now - createdAt > ttl);
  if (!candidate || expired) {
    candidate = generateSessionId();
    createdAt = now;
  }
  sessionId = candidate;
  writeStorageValue(config.storageSessionKey, sessionId);
  writeStorageJson(config.storageSessionMetaKey, {
    id: sessionId,
    created_at: createdAt,
    linked_id: linkedStored || null,
  });
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

function hashString(value) {
  const text = String(value || '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function getQueryMap(locationUrl) {
  const query = {};
  TRACKED_QUERY_KEYS.forEach((key) => {
    const value = locationUrl.searchParams.get(key);
    if (typeof value === 'string' && value.trim()) {
      query[key] = value.trim();
    }
  });
  return query;
}

function collectClientContext() {
  const nav = window.navigator;
  const scr = window.screen;
  const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
  const userAgent = nav?.userAgent || '';
  const locationUrl = new URL(window.location.href);
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
  const viewport =
    typeof window !== 'undefined'
      ? {
          width: window.innerWidth,
          height: window.innerHeight,
        }
      : undefined;
  const query = getQueryMap(locationUrl);
  const fingerprintSeed = [
    userAgent,
    nav?.language || '',
    nav?.platform || '',
    timezone || '',
    String(screenInfo?.width || ''),
    String(screenInfo?.height || ''),
    String(screenInfo?.pixelRatio || ''),
  ].join('|');
  return {
    user_agent: userAgent,
    language: nav?.language,
    languages: Array.isArray(nav?.languages) ? nav.languages : undefined,
    platform: nav?.platform,
    cookie_enabled: nav?.cookieEnabled,
    do_not_track: nav?.doNotTrack,
    hardware_concurrency: nav?.hardwareConcurrency,
    device_memory: nav?.deviceMemory,
    timezone,
    screen: screenInfo,
    viewport,
    connection: connection
      ? {
          effective_type: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          save_data: connection.saveData,
        }
      : undefined,
    device_type: detectDeviceType(userAgent, screenInfo),
    location_href: window.location.href,
    location_pathname: locationUrl.pathname,
    location_search: locationUrl.search || undefined,
    location_hash: locationUrl.hash || undefined,
    document_title: document.title || undefined,
    visibility_state: document.visibilityState || undefined,
    history_length: typeof window.history?.length === 'number' ? window.history.length : undefined,
    referrer: document.referrer || undefined,
    query,
    visitor_fingerprint: `fp_${hashString(fingerprintSeed)}`,
  };
}

function buildPayload(reason, browserGeo = null) {
  const context = collectClientContext();
  const query = context.query || {};
  const utmSource = query.utm_source || null;
  const utmMedium = query.utm_medium || null;
  const utmCampaign = query.utm_campaign || null;
  const utmTerm = query.utm_term || null;
  const utmContent = query.utm_content || null;
  const clientPayload = { ...context };
  if (browserGeo && browserGeo.latitude && browserGeo.longitude) {
    clientPayload.geo = {
      latitude: browserGeo.latitude,
      longitude: browserGeo.longitude,
      accuracy_m: browserGeo.accuracy_m ?? undefined,
      captured_at: browserGeo.captured_at || undefined,
      permission_state: browserGeo.permission_state || undefined,
      source: 'browser_geolocation',
    };
  }

  const metadata = {
    client: clientPayload,
    reason,
    tenant_alias: config.tenantAlias || undefined,
    query_ids: {
      gclid: query.gclid || undefined,
      fbclid: query.fbclid || undefined,
      msclkid: query.msclkid || undefined,
      ttclid: query.ttclid || undefined,
      twclid: query.twclid || undefined,
      li_fat_id: query.li_fat_id || undefined,
    },
  };

  return {
    session_id: ensureSessionId(),
    public_site_id: config.publicSiteId || undefined,
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

async function sendVisit(reason, { force = false, browserGeo = null } = {}) {
  const currentHref = window.location.href;
  if (!force && lastTrackedHref === currentHref && reason !== 'page_load') {
    return;
  }

  const payload = buildPayload(reason, browserGeo);
  try {
    const endpoint = config.endpointUrl || `${config.apiBaseUrl}${config.endpointPath}`;
    const response = await fetch(endpoint, {
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

async function resolveBrowserGeo() {
  if (browserGeoPromise) return browserGeoPromise;
  browserGeoPromise = (async () => {
    const cached = readStorageJson(config.browserGeoStorageKey);
    if (cached && typeof cached.timestamp_ms === 'number') {
      if (Date.now() - cached.timestamp_ms <= GEO_CACHE_TTL_MS) {
        return cached;
      }
    }

    if (!navigator.geolocation) {
      return null;
    }

    let permissionState = 'unknown';
    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        permissionState = permission?.state || permissionState;
        if (permissionState === 'denied') {
          return null;
        }
      }
    } catch (_error) {}

    const position = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (value) => resolve(value),
        () => resolve(null),
        {
          enableHighAccuracy: false,
          timeout: 3500,
          maximumAge: 10 * 60 * 1000,
        },
      );
    });
    if (!position || !position.coords) {
      return null;
    }
    const geo = {
      latitude: Number(position.coords.latitude),
      longitude: Number(position.coords.longitude),
      accuracy_m: Number(position.coords.accuracy || 0) || undefined,
      permission_state: permissionState,
      captured_at: new Date().toISOString(),
      timestamp_ms: Date.now(),
    };
    writeStorageJson(config.browserGeoStorageKey, geo);
    return geo;
  })();
  return browserGeoPromise;
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
  const previousTenantAlias = config.tenantAlias;
  config = { ...config, ...options };
  ensureSessionId();
  const alreadyInitialized = typeof window !== 'undefined' && Boolean(window[INITIALIZED_GLOBAL_KEY]);
  if (alreadyInitialized) {
    if (config.tenantAlias && config.tenantAlias !== previousTenantAlias) {
      void sendVisit('tenant_config_update', { force: true });
    }
    return;
  }
  if (typeof window !== 'undefined') {
    window[INITIALIZED_GLOBAL_KEY] = true;
  }
  bindHistoryListeners();
  void sendVisit('page_load');
  void resolveBrowserGeo().then((geo) => {
    if (!geo) return;
    void sendVisit('geo_update', { force: true, browserGeo: geo });
  });
}
