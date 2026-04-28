document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');

  const setNavState = () => {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 12);
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

  const details = document.querySelectorAll('.faq details');
  details.forEach((detail) => {
    const summary = detail.querySelector('summary');
    if (summary) {
      summary.setAttribute('aria-expanded', detail.open ? 'true' : 'false');
    }

    detail.addEventListener('toggle', () => {
      if (summary) {
        summary.setAttribute('aria-expanded', detail.open ? 'true' : 'false');
      }
    });
  });

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
});
