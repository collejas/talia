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
  // Sirve el gestor de temas desde los assets estáticos para evitar CORS/MIME issues
  remoteModuleUrl = '/assets/js/theme.js',
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
  const switcherEl = document.querySelector('[data-theme-controls]');
  const groupEl = switcherEl ? switcherEl.querySelector('.theme-button-group') : null;
  const buttonEls = Array.from(
    document.querySelectorAll('[data-theme-controls] [data-theme]')
  ).filter((btn) => btn instanceof HTMLButtonElement);

  if (!buttonEls.length) {
    return null;
  }

  if (groupEl && !groupEl.id) {
    groupEl.id = 'theme-options';
  }

  const controlsId = groupEl?.id;

  buttonEls.forEach((button) => {
    if (controlsId) {
      button.setAttribute('aria-controls', controlsId);
    }
  });

  let expanded = false;
  let userInitiated = false;

  function updateAriaExpanded() {
    buttonEls.forEach((button) => {
      const isActive = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-expanded', isActive && expanded ? 'true' : 'false');
      button.setAttribute('aria-haspopup', isActive ? 'menu' : 'false');
    });
  }

  function handleOutsideClick(event) {
    if (!switcherEl || !expanded) return;
    if (switcherEl.contains(event.target)) return;
    collapse();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      collapse();
    }
  }

  function setExpanded(value) {
    const next = Boolean(value);
    if (switcherEl) {
      switcherEl.classList.toggle('is-expanded', next);
      switcherEl.setAttribute('data-expanded', next ? 'true' : 'false');
    }
    if (expanded !== next) {
      expanded = next;
      if (expanded) {
        document.addEventListener('click', handleOutsideClick, { capture: true });
        document.addEventListener('keydown', handleKeydown);
      } else {
        document.removeEventListener('click', handleOutsideClick, { capture: true });
        document.removeEventListener('keydown', handleKeydown);
      }
    }
    updateAriaExpanded();
  }

  function expand() {
    setExpanded(true);
  }

  function collapse() {
    setExpanded(false);
  }

  function toggleExpanded() {
    setExpanded(!expanded);
  }

  const updatePressed = (theme) => {
    buttonEls.forEach((button) => {
      const isActive = button.dataset.theme === theme;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    collapse();
    if (userInitiated && switcherEl && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const activeButton = switcherEl.querySelector('[data-theme][aria-pressed="true"]');
        activeButton?.focus({ preventScroll: true });
      });
    }
    userInitiated = false;
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
      const current =
        detectActiveTheme(bodyEl, themes) || (selectEl ? selectEl.value : null);
      if (!theme) return;
      if (theme === current) {
        toggleExpanded();
        button.focus({ preventScroll: true });
        return;
      }

      userInitiated = true;

      if (selectEl) {
        if (selectEl.value !== theme) {
          selectEl.value = theme;
          const changeEvent = new Event('change', { bubbles: true });
          selectEl.dispatchEvent(changeEvent);
        } else if (!attachSelectListener) {
          updatePressed(theme);
        } else {
          userInitiated = false;
        }
      } else if (bodyEl) {
        bodyEl.classList.remove(...themes);
        bodyEl.classList.add(theme);
        updatePressed(theme);
      }
      collapse();
    });
  });

  if (selectEl && attachSelectListener) {
    selectEl.addEventListener('change', handleSelectChange);
  }

  buttonEls.forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });

  updateAriaExpanded();

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
    expand,
    collapse,
    update: updatePressed,
  };
}

function detectActiveTheme(bodyEl = document.body, themes = DEFAULT_THEMES) {
  if (!bodyEl) return null;
  return (bodyEl.className || '').split(' ').find((cls) => themes.includes(cls)) || null;
}
