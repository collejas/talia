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
    setupThemeButtons({
      selectEl,
      bodyEl,
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

  const buttonControls = setupThemeButtons({
    selectEl,
    bodyEl,
    attachSelectListener: false,
    themes,
  });

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
    buttonControls?.update(selected);
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
  } else {
    const detected = detectActiveTheme(bodyEl, themes);
    if (detected) {
      buttonControls?.update(detected);
    }
  }
}

function setupThemeButtons({
  selectEl,
  bodyEl = document.body,
  themes = DEFAULT_THEMES,
  attachSelectListener = true,
} = {}) {
  const buttonEls = Array.from(
    document.querySelectorAll('[data-theme-controls] [data-theme]')
  ).filter((btn) => btn instanceof HTMLButtonElement);

  if (!buttonEls.length) {
    return null;
  }

  const updatePressed = (theme) => {
    buttonEls.forEach((button) => {
      const isActive = button.dataset.theme === theme;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const handleSelectChange = () => {
    if (!selectEl) return;
    updatePressed(selectEl.value);
  };

  const getThemeFromButton = (btn) => {
    const theme = btn?.dataset?.theme;
    return themes.includes(theme) ? theme : null;
  };

  buttonEls.forEach((button) => {
    button.addEventListener('click', () => {
      const theme = getThemeFromButton(button);
      if (!theme) return;
      if (selectEl) {
        if (selectEl.value !== theme) {
          selectEl.value = theme;
          const changeEvent = new Event('change', { bubbles: true });
          selectEl.dispatchEvent(changeEvent);
        } else if (!attachSelectListener) {
          updatePressed(theme);
        }
      } else if (bodyEl) {
        bodyEl.classList.remove(...themes);
        bodyEl.classList.add(theme);
        updatePressed(theme);
      }
    });
  });

  if (selectEl && attachSelectListener) {
    selectEl.addEventListener('change', handleSelectChange);
  }

  const initialTheme =
    detectActiveTheme(bodyEl, themes) || (selectEl ? selectEl.value : null) || getThemeFromButton(buttonEls[0]);
  if (initialTheme) {
    updatePressed(initialTheme);
  }

  if (bodyEl && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      const active = detectActiveTheme(bodyEl, themes);
      if (active) {
        updatePressed(active);
      }
    });
    observer.observe(bodyEl, { attributes: true, attributeFilter: ['class'] });
  }

  return {
    buttons: buttonEls,
    update: updatePressed,
  };
}

function detectActiveTheme(bodyEl = document.body, themes = DEFAULT_THEMES) {
  if (!bodyEl) return null;
  return (bodyEl.className || '').split(' ').find((cls) => themes.includes(cls)) || null;
}
