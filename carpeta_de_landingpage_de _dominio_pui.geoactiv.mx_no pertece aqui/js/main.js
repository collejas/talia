document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const nav = document.querySelector('[data-mobile-nav]');
  const setNavState = () => {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 24);
  };

  setNavState();
  window.addEventListener('scroll', setNavState, { passive: true });

  const navToggle = nav?.querySelector('.nav-toggle');
  const navPanel = nav?.querySelector('.nav-panel');
  const navLinks = nav?.querySelectorAll('.nav-panel a');

  const setMenuState = (isOpen) => {
    if (!nav || !navToggle || !navPanel) return;
    nav.classList.toggle('menu-open', isOpen);
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    navToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
  };

  if (navToggle && navPanel) {
    setMenuState(false);

    navToggle.addEventListener('click', () => {
      setMenuState(!nav.classList.contains('menu-open'));
    });

    navLinks?.forEach((link) => {
      link.addEventListener('click', () => setMenuState(false));
    });

    document.addEventListener('click', (event) => {
      if (!nav.classList.contains('menu-open')) return;
      if (nav.contains(event.target)) return;
      setMenuState(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) setMenuState(false);
    });
  }

  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add('visible');
      });
    }, { threshold: 0.12 });

    revealEls.forEach((el) => io.observe(el));
  }

  const buttons = document.querySelectorAll('.sector-btn');
  const result = document.getElementById('sectorResult');

  const renderSectorResult = (btn) => {
    if (!result || !btn) return;

    const sector = btn.dataset.sector || btn.textContent.trim();
    const obligacion = btn.dataset.obligacion || 'evaluar';

    const isYes = obligacion === 'si';
    const isEvaluate = obligacion === 'evaluar';

    const pill = isYes
      ? { cls: 'sector-pill-yes', text: '🔴 Sí, tu institución está obligada' }
      : isEvaluate
        ? { cls: 'sector-pill-maybe', text: '🟡 Requiere evaluación' }
        : { cls: 'sector-pill-no', text: '🟢 No parece obligado' };

    const bodyText = isYes
      ? ' está expresamente incluido en el artículo 12 Bis de la Ley General en Materia de Desaparición Forzada. Debes interconectarte a la Plataforma Única de Identidad.'
      : isEvaluate
        ? 'Si tu operación administra datos de personas o realiza validación de identidad, conviene revisar si aplicas como sujeto obligado y qué flujos te corresponden.'
        : 'Este sector no suele aparecer como sujeto obligado, pero si administras datos de personas, vale la pena confirmar el alcance.';

    const showFine = isYes || isEvaluate;

    result.replaceChildren();

    const head = document.createElement('div');
    head.className = 'sector-result-head';

    const pillEl = document.createElement('span');
    pillEl.className = `sector-pill ${pill.cls}`;
    pillEl.textContent = pill.text;

    const title = document.createElement('strong');
    title.className = 'sector-result-title';
    title.textContent = sector;

    head.appendChild(pillEl);
    head.appendChild(title);

    const text = document.createElement('p');
    text.className = 'sector-result-text';

    if (isYes) {
      text.append('El sector ');
      const strong = document.createElement('strong');
      strong.textContent = sector;
      text.appendChild(strong);
      text.append(bodyText);
    } else if (isEvaluate) {
      text.append('Si tu operación ');
      const strong = document.createElement('strong');
      strong.textContent = 'administra datos de personas';
      text.appendChild(strong);
      text.append(' o realiza validación de identidad, conviene revisar si aplicas como sujeto obligado y qué flujos te corresponden.');
    } else {
      text.textContent = bodyText;
    }

    result.appendChild(head);
    result.appendChild(text);

    if (showFine) {
      const warning = document.createElement('div');
      warning.className = 'sector-result-warning';

      const strong = document.createElement('strong');
      strong.textContent = '⚠️ Multa por incumplimiento (Art. 43 Bis):';

      warning.appendChild(strong);
      warning.append(' De $1,173,100 a $2,346,200 MXN por infracción.');

      result.appendChild(warning);
    }
  };

  if (buttons.length) {
    renderSectorResult(document.querySelector('.sector-btn.active') || buttons[0]);
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderSectorResult(btn);
    });
  });

  setupVisitTracking();
});

const WEBCHAT_TENANT_ALIAS = 'pui';
const VISIT_SESSION_KEY = 'talia-web-session';
const VISIT_SESSION_META_KEY = 'talia-web-session-meta';
const WEBCHAT_LINKED_SESSION_KEY = 'talia-webchat-session';
const BROWSER_GEO_KEY = 'talia-browser-geo-v1';
const CRM_API_BASE = 'https://talia.mx/api/crm';
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

let sessionId = null;
let visitTrackingBound = false;
let pendingNavigationTimer = null;
let browserGeoPromise = null;
let lastTrackedHref = null;

function setupVisitTracking() {
  ensureSessionId();
  bindHistoryListeners();
  void sendVisit('page_load');
  void resolveBrowserGeo().then((geo) => {
    if (!geo) return;
    void sendVisit('geo_update', { force: true, browserGeo: geo });
  });
}

function readStoredValue(key) {
  try {
    const value = localStorage.getItem(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  } catch (_error) {}
  return null;
}

function writeStoredValue(key, value) {
  if (!key || !value) return;
  try {
    localStorage.setItem(key, value);
  } catch (_error) {}
}

function readStoredJson(key) {
  const raw = readStoredValue(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function writeStoredJson(key, payload) {
  if (!key || !payload || typeof payload !== 'object') return;
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (_error) {}
}

function generateSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSessionId() {
  if (sessionId) return sessionId;
  const now = Date.now();
  const ttl = 12 * 60 * 60 * 1000;
  const meta = readStoredJson(VISIT_SESSION_META_KEY) || {};
  const linkedStored = readStoredValue(WEBCHAT_LINKED_SESSION_KEY);
  const ownedStored = readStoredValue(VISIT_SESSION_KEY);
  let candidate = linkedStored || ownedStored || null;
  let createdAt = typeof meta.created_at === 'number' ? meta.created_at : null;
  if (!candidate || meta.id !== candidate) {
    createdAt = now;
  }
  const expired = Boolean(ttl && createdAt && now - createdAt > ttl);
  if (!candidate || expired) {
    candidate = generateSessionId();
    createdAt = now;
  }
  sessionId = candidate;
  writeStoredValue(VISIT_SESSION_KEY, sessionId);
  writeStoredJson(VISIT_SESSION_META_KEY, {
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

function buildVisitPayload(reason, browserGeo = null) {
  const context = collectClientContext();
  const query = context.query || {};
  const metadata = {
    client: { ...context },
    reason,
    tenant_alias: WEBCHAT_TENANT_ALIAS,
    query_ids: {
      gclid: query.gclid || undefined,
      fbclid: query.fbclid || undefined,
      msclkid: query.msclkid || undefined,
      ttclid: query.ttclid || undefined,
      twclid: query.twclid || undefined,
      li_fat_id: query.li_fat_id || undefined,
    },
  };

  if (browserGeo && browserGeo.latitude && browserGeo.longitude) {
    metadata.client.geo = {
      latitude: browserGeo.latitude,
      longitude: browserGeo.longitude,
      accuracy_m: browserGeo.accuracy_m ?? undefined,
      captured_at: browserGeo.captured_at || undefined,
      permission_state: browserGeo.permission_state || undefined,
      source: 'browser_geolocation',
    };
  }

  return {
    session_id: ensureSessionId(),
    tenant_alias: WEBCHAT_TENANT_ALIAS,
    location_href: context.location_href,
    landing_url: context.location_href,
    referrer: context.referrer,
    user_agent: context.user_agent,
    device_type: context.device_type,
    utm_source: query.utm_source || undefined,
    utm_medium: query.utm_medium || undefined,
    utm_campaign: query.utm_campaign || undefined,
    utm_term: query.utm_term || undefined,
    utm_content: query.utm_content || undefined,
    metadata,
  };
}

async function sendVisit(reason, { force = false, browserGeo = null } = {}) {
  const currentHref = window.location.href;
  if (!force && lastTrackedHref === currentHref && reason !== 'page_load') {
    return;
  }

  try {
    const response = await fetch(`${CRM_API_BASE}/web/visit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Alias': WEBCHAT_TENANT_ALIAS,
      },
      body: JSON.stringify(buildVisitPayload(reason, browserGeo)),
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
    const cached = readStoredJson(BROWSER_GEO_KEY);
    if (cached && typeof cached.timestamp_ms === 'number') {
      if (Date.now() - cached.timestamp_ms <= 24 * 60 * 60 * 1000) {
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
    writeStoredJson(BROWSER_GEO_KEY, geo);
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
  if (visitTrackingBound) return;
  visitTrackingBound = true;

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
