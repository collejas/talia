/**
 * Calcula y actualiza variables CSS con la altura real del header, el footer y el compositor.
 * Devuelve una función para desuscribir los listeners cuando ya no se necesiten.
 */
export function initialiseLayoutObservers({
  headerSelector = '.site-header',
  composerSelector = '.composer',
  footerSelector = '.site-footer',
  root = document.documentElement,
} = {}) {
  if (typeof window === 'undefined' || !root) {
    return () => {};
  }

  const updateLayoutInsets = () => {
    try {
      const header = document.querySelector(headerSelector);
      const composer = document.querySelector(composerSelector);
      const footer = document.querySelector(footerSelector);

      if (header) {
        const h = Math.round(header.getBoundingClientRect().height);
        if (h > 0) root.style.setProperty('--header-h', `${h}px`);
      }

      if (footer) {
        const footerStyles = getComputedStyle(footer);
        if (footerStyles.display !== 'none') {
          const f = Math.round(footer.getBoundingClientRect().height);
          root.style.setProperty('--footer-h', `${f}px`);
        } else {
          root.style.setProperty('--footer-h', '0px');
        }
      }

      if (composer) {
        const rect = composer.getBoundingClientRect();
        const h = Math.max(0, Math.round(rect.height));
        root.style.setProperty('--composer-h', `${h}px`);
        const b = Math.max(0, Math.round(window.innerHeight - rect.bottom));
        root.style.setProperty('--composer-b', `${b}px`);
      }
    } catch (error) {
      console.warn('[layout] No se pudo calcular insets del layout', error);
    }
  };

  window.addEventListener('load', updateLayoutInsets, { passive: true });
  window.addEventListener('resize', updateLayoutInsets, { passive: true });

  updateLayoutInsets();

  return () => {
    window.removeEventListener('load', updateLayoutInsets);
    window.removeEventListener('resize', updateLayoutInsets);
  };
}
