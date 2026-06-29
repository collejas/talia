const whatsappPhone = '5214443354450';

const pageCtas = {
  '/': {
    label: 'Hablar por WhatsApp',
    message: 'Hola, quiero hablar por WhatsApp sobre Tal-IA',
  },
  '/que-es-talia': {
    label: 'Hablar por WhatsApp',
    message: 'Hola, quiero conocer TalIA y ver una demo.',
  },
  '/crm-con-ia-para-whatsapp': {
    label: 'Ver por WhatsApp',
    message: 'Hola, quiero ver el CRM con IA para WhatsApp de TalIA.',
  },
  '/asistente-ia-empresas': {
    label: 'Pedir demo',
    message: 'Hola, quiero ver el asistente IA para empresas de TalIA.',
  },
  '/ia-de-whatsapp': {
    label: 'Ver en WhatsApp',
    message: 'Hola, quiero ver la IA de WhatsApp de TalIA.',
  },
  '/ia-para-ventas': {
    label: 'Quiero verlo',
    message: 'Hola, quiero ver la IA para ventas de TalIA.',
  },
  '/automatizacion-de-ventas': {
    label: 'Solicitar demo',
    message: 'Hola, quiero ver la automatización de ventas de TalIA.',
  },
  '/seguimiento-ventas': {
    label: 'Ver seguimiento',
    message: 'Hola, quiero ver el seguimiento de ventas de TalIA.',
  },
  '/agenda-y-cotizaciones': {
    label: 'Ver agenda',
    message: 'Hola, quiero ver agenda y cotizaciones de TalIA.',
  },
  '/prospeccion-comercial': {
    label: 'Quiero prospectar',
    message: 'Hola, quiero ver la prospección comercial de TalIA.',
  },
  '/buscar-contactos': {
    label: 'Buscar contactos',
    message: 'Hola, quiero buscar contactos para ventas con TalIA.',
  },
  '/prospectos-google-denue': {
    label: 'Ver prospectos',
    message: 'Hola, quiero ver prospectos en Google y DENUE con TalIA.',
  },
  '/campanas-marketing': {
    label: 'Ver campañas',
    message: 'Hola, quiero ver campañas y marketing con TalIA.',
  },
  '/precios': {
    label: 'Ver por WhatsApp',
    message: 'Hola, quiero hablar por WhatsApp sobre los precios de Tal-IA',
  },
  '/industrias': {
    label: 'Ver industria',
    message: 'Hola, quiero ver las industrias de TalIA.',
  },
  '/industrias/inmobiliarias': {
    label: 'Ver inmobiliaria',
    message: 'Hola, quiero ver la IA para inmobiliarias de TalIA.',
  },
  '/industrias/servicios': {
    label: 'Ver servicios',
    message: 'Hola, quiero ver IA para servicios con TalIA.',
  },
  '/industrias/negocios-locales': {
    label: 'Ver local',
    message: 'Hola, quiero ver IA para negocios locales con TalIA.',
  },
  '/industrias/ventas-b2b': {
    label: 'Ver B2B',
    message: 'Hola, quiero ver IA para ventas B2B con TalIA.',
  },
  '/industrias/turismo': {
    label: 'Ver turismo',
    message: 'Hola, quiero ver IA para turismo con TalIA.',
  },
  '/demo.html': {
    label: 'Agendar demo',
    message: 'Hola, quiero agendar mi demo de Tal-IA por WhatsApp',
  },
  '/caracteristicas': {
    label: 'Ver por WhatsApp',
    message: 'Hola, quiero ver las características de Tal-IA y entender cómo funciona',
  },
};

function getPathKey() {
  if (typeof window === 'undefined') return '/';
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return pathname;
}

function getCtaConfig() {
  const path = getPathKey();
  return pageCtas[path] || {
    label: 'Hablar por WhatsApp',
    message: 'Hola, quiero hablar por WhatsApp sobre Tal-IA',
  };
}

function buildHref(message) {
  return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
}

function ensureStyles() {
  if (document.getElementById('talia-whatsapp-float-styles')) return;
  const style = document.createElement('style');
  style.id = 'talia-whatsapp-float-styles';
  style.textContent = `
    .talia-whatsapp-float {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 999;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      max-width: min(320px, calc(100vw - 36px));
      padding: 12px 16px;
      border-radius: 999px;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color: #fff;
      text-decoration: none;
      box-shadow: 0 18px 40px rgba(22, 163, 74, 0.32);
      font-weight: 850;
      font-size: 13px;
      line-height: 1;
    }
    .talia-whatsapp-float:hover {
      transform: translateY(-1px);
      box-shadow: 0 22px 46px rgba(22, 163, 74, 0.38);
    }
    .talia-whatsapp-float__icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
    }
    .talia-whatsapp-float__label {
      display: inline-block;
      white-space: nowrap;
    }
    @media (max-width: 640px) {
      .talia-whatsapp-float {
        right: 12px;
        bottom: 12px;
        padding: 11px 13px;
        font-size: 12px;
      }
      .talia-whatsapp-float__label {
        max-width: 170px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  `;
  document.head.appendChild(style);
}

function mountFloat() {
  if (document.getElementById('talia-whatsapp-float')) return;
  const { label, message } = getCtaConfig();
  const link = document.createElement('a');
  link.id = 'talia-whatsapp-float';
  link.className = 'talia-whatsapp-float';
  link.href = buildHref(message);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = label;
  link.setAttribute('aria-label', label);
  link.setAttribute('data-cta-id', 'CTA_FLOAT_WHATSAPP');
  link.innerHTML = `
    <svg class="talia-whatsapp-float__icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.52 3.48A11.7 11.7 0 0 0 12.02 0C5.43 0 .07 5.36.07 11.95c0 2.1.55 4.16 1.59 5.98L0 24l6.24-1.63a11.9 11.9 0 0 0 5.78 1.48h.01c6.59 0 11.95-5.36 11.95-11.95 0-3.19-1.24-6.2-3.46-8.42Zm-8.5 18.37h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.71.97.99-3.62-.23-.37a9.93 9.93 0 0 1-1.52-5.27c0-5.48 4.46-9.94 9.95-9.94 2.65 0 5.13 1.03 7 2.9a9.87 9.87 0 0 1 2.91 7.04c0 5.48-4.46 9.88-9.98 9.88Zm5.79-7.46c-.32-.16-1.9-.94-2.2-1.05-.3-.11-.52-.16-.74.16-.22.32-.85 1.05-1.04 1.27-.19.22-.38.25-.7.08-.32-.16-1.36-.5-2.6-1.6-.96-.86-1.61-1.92-1.8-2.24-.19-.32-.02-.49.14-.65.15-.15.32-.38.48-.56.16-.19.22-.32.33-.54.11-.22.05-.41-.03-.57-.08-.16-.74-1.77-1.02-2.42-.27-.65-.55-.56-.75-.57l-.64-.01c-.22 0-.57.08-.87.41-.3.32-1.15 1.12-1.15 2.73 0 1.61 1.17 3.17 1.33 3.39.16.22 2.3 3.5 5.57 4.91.78.34 1.39.54 1.87.69.79.25 1.5.21 2.07.13.63-.09 1.9-.77 2.17-1.52.27-.75.27-1.39.19-1.52-.08-.13-.3-.21-.62-.38Z"/>
    </svg>
    <span class="talia-whatsapp-float__label">${label}</span>
  `;
  document.body.appendChild(link);

  link.addEventListener('click', () => {
    try {
      const payload = {
        cta_id: 'CTA_FLOAT_WHATSAPP',
        label,
        location_href: window.location.href,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent || null,
      };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon?.('/api/crm/web/cta-click', blob);
    } catch (_error) {}
  });
}

function bootstrap() {
  if (typeof document === 'undefined') return;
  ensureStyles();
  mountFloat();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
