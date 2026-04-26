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
});
