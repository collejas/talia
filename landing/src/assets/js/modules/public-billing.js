const API_BASE = '/public/billing';

const state = {
  selectedPlanId: '',
  selectedPlanName: '',
  selectedPriceId: '',
  selectedPriceLabel: '',
  loading: true,
  submitting: false,
};

const currencyFormatters = new Map();

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-commercial-checkout]');
  if (!root) {
    return;
  }

  const planList = root.querySelector('[data-plan-list]');
  const planCount = root.querySelector('[data-plan-count]');
  const statusEl = root.querySelector('[data-checkout-status]');
  const selectedPlanEl = root.querySelector('[data-selected-plan]');
  const selectedPriceEl = root.querySelector('[data-selected-price]');
  const form = root.querySelector('[data-commercial-checkout-form]');
  const formMessage = root.querySelector('[data-form-message]');
  const banner = root.querySelector('[data-checkout-banner]');
  const submitButton = form?.querySelector('button[type="submit"]');

  if (!planList || !planCount || !statusEl || !selectedPlanEl || !selectedPriceEl || !form || !formMessage || !banner || !submitButton) {
    return;
  }

  const url = new URL(window.location.href);
  const checkoutState = url.searchParams.get('checkout');
  if (checkoutState === 'success') {
    banner.classList.remove('hidden');
    banner.className = 'billing-banner billing-banner--success';
    banner.textContent = 'El pago fue confirmado. Si el webhook ya procesó la suscripción, tu tenant quedará activo en breve.';
  } else if (checkoutState === 'cancel') {
    banner.classList.remove('hidden');
    banner.className = 'billing-banner billing-banner--warning';
    banner.textContent = 'El checkout fue cancelado. Puedes volver a elegir un plan y continuar cuando quieras.';
  }

  void bootstrap();

  async function bootstrap() {
    setStatus('Cargando planes comerciales...');
    try {
      const plans = await loadPlans();
      renderPlans(plans);
      setStatus('Planes cargados. Elige una modalidad para continuar.');
    } catch (error) {
      console.error('[public-billing] No se pudieron cargar los planes.', error);
      planList.innerHTML = `
        <div class="billing-message billing-message--error">
          No se pudieron cargar los planes comerciales en este momento. Intenta más tarde o solicita apoyo por WhatsApp.
        </div>
      `;
      planCount.textContent = '0';
      setStatus('Error al cargar planes');
    }
  }

  async function loadPlans() {
    const response = await fetch(`${API_BASE}/commercial-plans`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data?.items) ? data.items : [];
  }

  function renderPlans(plans) {
    const activePlans = (Array.isArray(plans) ? plans : [])
      .map((plan) => ({
        ...plan,
        prices: Array.isArray(plan?.prices) ? plan.prices.filter((price) => price && price.active) : [],
      }))
      .filter((plan) => plan.prices.length > 0);

    planCount.textContent = String(activePlans.length);

    if (!activePlans.length) {
      planList.innerHTML = `
        <div class="billing-message billing-message--info" style="border-style: dashed;">
          No hay planes activos disponibles por ahora.
        </div>
      `;
      state.loading = false;
      return;
    }

    planList.innerHTML = activePlans
      .map((plan, index) => {
        const priceCards = plan.prices
          .map((price, priceIndex) => {
            const isPrimary = index === 0 && priceIndex === 0;
            const displayPrice = formatMoney(price.amount_cents, price.currency);
            const intervalLabel = formatInterval(price.billing_interval);
            return `
              <button
                type="button"
                class="billing-price-option ${isPrimary ? 'billing-price-option--selected' : ''}"
                data-select-price
                data-plan-id="${escapeAttr(plan.id)}"
                data-plan-name="${escapeAttr(plan.name)}"
                data-price-id="${escapeAttr(price.provider_price_id)}"
                data-price-label="${escapeAttr(`${displayPrice} ${intervalLabel}`)}"
                data-price-currency="${escapeAttr(price.currency)}"
                data-price-amount="${escapeAttr(String(price.amount_cents))}"
                data-price-interval="${escapeAttr(price.billing_interval)}"
              >
                <div class="billing-price-row">
                  <div>
                    <p class="billing-price-amount">${escapeHtml(displayPrice)}</p>
                    <p class="billing-price-interval">${escapeHtml(intervalLabel)}</p>
                  </div>
                  <span class="billing-price-badge">Stripe</span>
                </div>
                <p class="billing-price-hint">Seleccionar esta modalidad</p>
              </button>
            `;
          })
          .join('');

        return `
          <article
            class="billing-plan-card ${index === 0 ? 'billing-plan-card--selected' : ''}"
            data-plan-card
            data-plan-id="${escapeAttr(plan.id)}"
          >
            <div class="billing-price-row">
              <div>
                <p class="billing-plan-code">${escapeHtml(plan.code)}</p>
                <h4 class="billing-plan-title">${escapeHtml(plan.name)}</h4>
                <p class="billing-plan-desc">${escapeHtml(plan.description || 'Plan comercial activo')}</p>
              </div>
              <div class="billing-plan-badge">
                ${plan.prices.length} precio${plan.prices.length === 1 ? '' : 's'}
              </div>
            </div>
            <div class="billing-price-list">${priceCards}</div>
          </article>
        `;
      })
      .join('');

    planList.querySelectorAll('[data-select-price]').forEach((button) => {
      button.addEventListener('click', () => {
        const planId = button.getAttribute('data-plan-id') || '';
        const planName = button.getAttribute('data-plan-name') || '';
        const priceId = button.getAttribute('data-price-id') || '';
        const priceLabel = button.getAttribute('data-price-label') || '';
        selectPrice({
          planId,
          planName,
          priceId,
          priceLabel,
          triggerScroll: true,
        });
      });
    });

    const defaultPrice = planList.querySelector('[data-select-price]');
    if (defaultPrice) {
      selectPrice({
        planId: defaultPrice.getAttribute('data-plan-id') || '',
        planName: defaultPrice.getAttribute('data-plan-name') || '',
        priceId: defaultPrice.getAttribute('data-price-id') || '',
        priceLabel: defaultPrice.getAttribute('data-price-label') || '',
      });
    }

    const preselectedPriceId = url.searchParams.get('price_id');
    if (preselectedPriceId) {
      const preselectedButton = planList.querySelector(`[data-price-id="${cssEscape(preselectedPriceId)}"]`);
      if (preselectedButton instanceof HTMLElement) {
        selectPrice({
          planId: preselectedButton.getAttribute('data-plan-id') || '',
          planName: preselectedButton.getAttribute('data-plan-name') || '',
          priceId: preselectedButton.getAttribute('data-price-id') || '',
          priceLabel: preselectedButton.getAttribute('data-price-label') || '',
        });
      }
    }
  }

  function selectPrice({ planId, planName, priceId, priceLabel, triggerScroll = false }) {
    state.selectedPlanId = planId;
    state.selectedPlanName = planName;
    state.selectedPriceId = priceId;
    state.selectedPriceLabel = priceLabel;

    selectedPlanEl.textContent = planName || 'Selecciona un plan';
    selectedPriceEl.textContent = priceLabel ? `${priceLabel} · Stripe checkout` : 'Elige una modalidad para continuar.';

    planList.querySelectorAll('[data-plan-card]').forEach((card) => {
      const isSelected = card.getAttribute('data-plan-id') === planId;
      card.classList.toggle('billing-plan-card--selected', isSelected);
    });

    planList.querySelectorAll('[data-select-price]').forEach((button) => {
      const isSelected = button.getAttribute('data-price-id') === priceId;
      button.classList.toggle('billing-price-option--selected', isSelected);
    });

    if (triggerScroll) {
      root.querySelector('form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!state.selectedPriceId) {
      showMessage('Selecciona un plan y una modalidad antes de continuar.', 'error');
      return;
    }

    const payload = collectPayload(form);
    payload.provider_price_id = state.selectedPriceId;
    payload.nombre = payload.nombre || '';
    payload.correo_contacto_principal = payload.correo_contacto_principal || '';

    if (!payload.nombre.trim()) {
      showMessage('El nombre del tenant es obligatorio.', 'error');
      return;
    }

    if (!payload.correo_contacto_principal.trim()) {
      showMessage('El correo de contacto es obligatorio.', 'error');
      return;
    }

    setSubmitting(true);
    showMessage('Creando tenant y preparando checkout de Stripe...', 'info');

    try {
      const response = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(extractErrorMessage(data) || `HTTP ${response.status}`);
      }

      if (!data?.checkout_url) {
        throw new Error('La respuesta no devolvió checkout_url.');
      }

      window.location.assign(data.checkout_url);
    } catch (error) {
      console.error('[public-billing] Checkout falló.', error);
      showMessage(error instanceof Error ? error.message : 'No se pudo crear el checkout.', 'error');
    } finally {
      setSubmitting(false);
    }
  });

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function setSubmitting(isSubmitting) {
    state.submitting = isSubmitting;
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Creando checkout...' : 'Crear tenant y continuar a Stripe';
    submitButton.classList.toggle('billing-submit-button--loading', isSubmitting);
  }

  function showMessage(message, kind = 'info') {
    formMessage.textContent = message;
    formMessage.classList.remove('hidden');
    formMessage.className =
      kind === 'error'
        ? 'billing-message billing-message--error'
        : kind === 'success'
          ? 'billing-message billing-message--success'
          : 'billing-message billing-message--info';
  }
});

function collectPayload(form) {
  const formData = new FormData(form);
  const payload = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      payload[key] = normalized;
    }
  }

  return payload;
}

function formatMoney(amountCents, currency) {
  const normalizedCurrency = String(currency || 'MXN').trim().toUpperCase();
  const cacheKey = normalizedCurrency;
  if (!currencyFormatters.has(cacheKey)) {
    currencyFormatters.set(
      cacheKey,
      new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: normalizedCurrency,
        maximumFractionDigits: 2,
      }),
    );
  }
  return currencyFormatters.get(cacheKey).format(Number(amountCents || 0) / 100);
}

function formatInterval(interval) {
  const normalized = String(interval || '').trim().toLowerCase();
  if (normalized === 'month') return 'Mensual';
  if (normalized === 'year') return 'Anual';
  if (normalized === 'week') return 'Semanal';
  if (normalized === 'day') return 'Diario';
  return normalized ? normalized : 'Sin intervalo';
}

function extractErrorMessage(data) {
  if (!data) {
    return '';
  }
  if (typeof data.detail === 'string') {
    return data.detail;
  }
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item) => (typeof item?.msg === 'string' ? item.msg : ''))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof data.message === 'string') {
    return data.message;
  }
  return '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replaceAll(/["\\]/g, '\\$&');
}
