// Tema compartido entre landing y panel.
const DEFAULT_THEMES = ['theme-aurora', 'theme-ice', 'theme-void'];
const DEFAULT_THEME_META = {
  'theme-aurora': { themeColor: '#060414' },
  'theme-ice': { themeColor: '#fdf4ff' },
  'theme-void': { themeColor: '#050505' },
};

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn('[theme] No se pudo leer localStorage', error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn('[theme] No se pudo guardar preferencia', error);
  }
}

export function createThemeManager({
  selectEl = null,
  bodyEl = typeof document !== 'undefined' ? document.body : null,
  metaEl =
    typeof document !== 'undefined'
      ? document.querySelector('meta[name="theme-color"]')
      : null,
  themes = DEFAULT_THEMES,
  themeMeta = DEFAULT_THEME_META,
  storageKey = 'talia-theme-preference',
  initialTheme = null,
} = {}) {
  if (!bodyEl) {
    throw new Error('[theme] No se encontró body para aplicar clases');
  }

  function normaliseTheme(theme) {
    return themes.includes(theme) ? theme : themes[0];
  }

  function inferThemeFromBody() {
    const current = (bodyEl.className || '')
      .split(/\s+/)
      .find((cls) => themes.includes(cls));
    return current || null;
  }

  function updateMeta(theme) {
    if (!metaEl) return;
    const cfg = themeMeta[theme];
    if (cfg?.themeColor) {
      metaEl.setAttribute('content', cfg.themeColor);
    }
  }

  let currentTheme =
    initialTheme ||
    safeStorageGet(storageKey) ||
    inferThemeFromBody() ||
    themes[0];
  currentTheme = normaliseTheme(currentTheme);

  function applyTheme(theme, { persist = true } = {}) {
    const next = normaliseTheme(theme);
    if (next === currentTheme) {
      return currentTheme;
    }
    bodyEl.classList.remove(...themes);
    bodyEl.classList.add(next);
    updateMeta(next);
    if (selectEl) {
      selectEl.value = next;
    }
    if (persist) {
      safeStorageSet(storageKey, next);
    }
    currentTheme = next;
    return currentTheme;
  }

  // Aplica tema inicial sin persistencia (para no duplicar guardado).
  bodyEl.classList.remove(...themes);
  bodyEl.classList.add(currentTheme);
  updateMeta(currentTheme);
  if (selectEl) {
    selectEl.value = currentTheme;
  }

  if (selectEl) {
    selectEl.addEventListener('change', (event) => {
      applyTheme(event.target.value);
    });
  }

  return {
    get theme() {
      return currentTheme;
    },
    setTheme: (theme) => applyTheme(theme),
    applyTheme,
    themes: [...themes],
  };
}

export const THEMES = DEFAULT_THEMES;
export const THEME_META = DEFAULT_THEME_META;
