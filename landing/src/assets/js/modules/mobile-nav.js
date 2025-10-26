const originalPositions = new Map();

const defaultNavConfig = {
  mobileBreakpoint: '(max-width: 960px)',
  ctaSelector: '.site-header .cta',
  themeSwitcherSelector: '.theme-switcher',
};

let navConfig = { ...defaultNavConfig };
let menuToggle = null;
let mobileMenu = null;
let mobileMenuList = null;
let themeSelect = null;
let mediaQuery = null;

const toggleClickHandler = () => {
  if (!mobileMenu) return;
  if (mobileMenu.hidden) openMobileMenu();
  else closeMobileMenu();
};

const mobileClickHandler = (event) => {
  if (!mobileMenu || mobileMenu.hidden) return;
  const actionable = event.target.closest('a, .cta');
  if (actionable) {
    closeMobileMenu();
  }
};

const mobileSubmitHandler = () => {
  if (mobileMenu && !mobileMenu.hidden) closeMobileMenu();
};

const themeChangeHandler = () => {
  if (mobileMenu && !mobileMenu.hidden) closeMobileMenu();
};

export function initialiseMobileNav(options = {}) {
  if (typeof document === 'undefined') {
    return () => {};
  }

  navConfig = { ...defaultNavConfig, ...options };

  menuToggle = options.menuToggle ?? document.getElementById('menu-toggle');
  mobileMenu = options.mobileMenu ?? document.getElementById('mobile-menu');
  mobileMenuList =
    options.mobileMenuList ??
    (mobileMenu ? mobileMenu.querySelector('.mobile-menu-list') : null);
  themeSelect = options.themeSelect ?? document.getElementById('theme-select');

  if (!mobileMenuList) {
    return () => {};
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    mediaQuery = window.matchMedia(navConfig.mobileBreakpoint);
    handleViewportChange(mediaQuery);
    mediaQuery.addEventListener('change', handleViewportChange);
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', toggleClickHandler);
  }

  if (mobileMenu) {
    mobileMenu.addEventListener('click', mobileClickHandler);
    mobileMenu.addEventListener('submit', mobileSubmitHandler);
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', themeChangeHandler);
  }

  return teardownMobileNav;
}

function rememberPosition(node) {
  if (!node || originalPositions.has(node)) return;
  originalPositions.set(node, { parent: node.parentNode, next: node.nextSibling });
}

function restorePosition(node) {
  const pos = originalPositions.get(node);
  if (!pos?.parent) return;
  pos.parent.insertBefore(node, pos.next);
}

function openMobileMenu() {
  if (!mobileMenu) return;
  const header = document.querySelector('.site-header');
  const rect = header ? header.getBoundingClientRect() : { bottom: 0 };
  const top = rect.bottom + window.scrollY + 8;
  mobileMenu.style.top = `${top}px`;
  mobileMenu.hidden = false;
  menuToggle?.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', escHandler);
  document.addEventListener('click', outsideClickHandler, { capture: true });
}

function closeMobileMenu() {
  if (!mobileMenu) return;
  mobileMenu.hidden = true;
  menuToggle?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', escHandler);
  document.removeEventListener('click', outsideClickHandler, { capture: true });
}

function escHandler(event) {
  if (event.key === 'Escape') closeMobileMenu();
}

function outsideClickHandler(event) {
  if (!mobileMenu) return;
  const panel = mobileMenu.querySelector('.mobile-menu-panel');
  if (!panel) return;
  const clickOnToggle =
    menuToggle && (event.target === menuToggle || menuToggle.contains(event.target));
  if (panel.contains(event.target) || clickOnToggle) return;
  closeMobileMenu();
}

function setupMobileMenu() {
  if (!mobileMenuList) return;

  const cta = document.querySelector(navConfig.ctaSelector);
  const themeSwitcher = document.querySelector(navConfig.themeSwitcherSelector);

  rememberPosition(cta);
  rememberPosition(themeSwitcher);

  let liCta = mobileMenuList.querySelector('[data-menu-item="cta"]');
  let liTheme = mobileMenuList.querySelector('[data-menu-item="theme"]');

  if (!liTheme) {
    liTheme = document.createElement('li');
    liTheme.setAttribute('data-menu-item', 'theme');
    liTheme.role = 'none';
  }
  if (!liCta) {
    liCta = document.createElement('li');
    liCta.setAttribute('data-menu-item', 'cta');
    liCta.role = 'none';
  }

  if (themeSwitcher && themeSwitcher.parentElement !== liTheme) {
    liTheme.innerHTML = '';
    liTheme.appendChild(themeSwitcher);
  }

  const isMobile = mediaQuery?.matches ?? false;

  if (isMobile) {
    if (cta && cta.parentElement !== liCta) {
      liCta.innerHTML = '';
      liCta.appendChild(cta);
    }
    if (liCta.parentElement !== mobileMenuList) {
      mobileMenuList.insertBefore(liCta, mobileMenuList.firstChild);
    }
  } else {
    if (cta && cta.parentElement === liCta) {
      restorePosition(cta);
      liCta.innerHTML = '';
    }
    if (liCta.parentElement === mobileMenuList && !liCta.firstChild) {
      mobileMenuList.removeChild(liCta);
    }
  }

  if (liTheme.parentElement !== mobileMenuList) {
    mobileMenuList.appendChild(liTheme);
  } else if (liCta.parentElement === mobileMenuList && mobileMenuList.firstChild !== liCta) {
    mobileMenuList.insertBefore(liCta, liTheme);
  }
}

function teardownMobileNav() {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', handleViewportChange);
    mediaQuery = null;
  }

  if (menuToggle) {
    menuToggle.removeEventListener('click', toggleClickHandler);
  }

  if (mobileMenu) {
    mobileMenu.removeEventListener('click', mobileClickHandler);
    mobileMenu.removeEventListener('submit', mobileSubmitHandler);
  }

  if (themeSelect) {
    themeSelect.removeEventListener('change', themeChangeHandler);
  }

  closeMobileMenu();

  const cta =
    document.querySelector('.mobile-menu .cta') || document.querySelector(navConfig.ctaSelector);
  if (cta) restorePosition(cta);
}

function handleViewportChange(event) {
  setupMobileMenu();
  const matches = typeof event.matches === 'boolean' ? event.matches : mediaQuery?.matches;
  if (!matches) closeMobileMenu();
}
