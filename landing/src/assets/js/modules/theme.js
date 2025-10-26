const DEFAULT_THEMES = ['theme-aurora', 'theme-ice', 'theme-void'];

const DEFAULT_THEME_META = {
  'theme-aurora': { themeColor: '#060414' },
  'theme-ice': { themeColor: '#fdf4ff' },
  'theme-void': { themeColor: '#050505' },
};

let themeManager = null;

/**
 * Inicializa el selector de temas compartido entre vistas. Intenta cargar el gestor
 * remoto utilizado por el panel y, si falla, recurre a un degradado local.
 */
export async function initialiseTheme({
  selectEl = document.getElementById('theme-select'),
  bodyEl = document.body,
  metaEl = document.querySelector('meta[name="theme-color"]'),
  storageKey = 'talia-theme-preference-v2',
  remoteModuleUrl = '/api/panel/assets/js/theme.js',
} = {}) {
  if (!bodyEl) return null;

  try {
    const module = await import(remoteModuleUrl);
    themeManager = module.createThemeManager({
      selectEl,
      bodyEl,
      metaEl,
      storageKey,
    });
    return themeManager;
  } catch (error) {
    console.warn(
      '[theme] No se pudo cargar el gestor de temas compartido, usando fallback.',
      error
    );
    fallbackInitialiseTheme({ selectEl, bodyEl, metaEl, storageKey });
    return null;
  }
}

export function getThemeManager() {
  return themeManager;
}

function fallbackInitialiseTheme({
  selectEl,
  bodyEl,
  metaEl,
  storageKey,
  themes = DEFAULT_THEMES,
  themeMeta = DEFAULT_THEME_META,
}) {
  const defaultTheme =
    (bodyEl.className || '')
      .split(' ')
      .find((cls) => themes.includes(cls)) || themes[0];

  let storedTheme = null;
  try {
    storedTheme = window.localStorage.getItem(storageKey);
  } catch (error) {
    console.warn('[theme] No se pudo leer preferencia de tema.', error);
  }

  const applyTheme = (theme, { persist = true } = {}) => {
    const selected = themes.includes(theme) ? theme : themes[0];
    bodyEl.classList.remove(...themes);
    bodyEl.classList.add(selected);
    if (selectEl) {
      selectEl.value = selected;
    }
    const metaCfg = themeMeta[selected];
    if (metaEl && metaCfg?.themeColor) {
      metaEl.setAttribute('content', metaCfg.themeColor);
    }
    if (persist) {
      try {
        window.localStorage.setItem(storageKey, selected);
      } catch (error) {
        console.warn('[theme] No se pudo guardar la preferencia de tema.', error);
      }
    }
  };

  applyTheme(storedTheme || defaultTheme, { persist: false });

  if (selectEl) {
    selectEl.addEventListener('change', (event) => {
      applyTheme(event.target.value);
    });
  }
}
