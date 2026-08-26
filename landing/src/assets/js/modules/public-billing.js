const API_BASE = '/public/billing';
const PUBLIC_BILLING_ENABLED = Boolean(window.TALIA_PUBLIC_CONFIG?.showPublicBilling);

const state = {
  selectedPlanId: '',
  selectedPlanName: '',
  selectedPriceId: '',
  selectedPriceLabel: '',
  maxInstallmentCount: 1,
  loading: true,
  submitting: false,
};

const currencyFormatters = new Map();

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-commercial-checkout]');
  const triggers = Array.from(document.querySelectorAll('[data-public-billing-trigger]'));
  if (!root) {
    return;
  }

  if (!PUBLIC_BILLING_ENABLED) {
    return;
  }

  root.hidden = false;
  root.removeAttribute('aria-hidden');
  triggers.forEach((trigger) => {
    trigger.hidden = false;
    trigger.removeAttribute('aria-hidden');
    trigger.addEventListener('click', (event) => {
      const interval = trigger.getAttribute('data-billing-interval') || '';
      if (interval) {
        const matchingPrice = planList?.querySelector(`[data-price-interval="${cssEscape(interval)}"]`);
        if (matchingPrice instanceof HTMLElement) {
          event.preventDefault();
          matchingPrice.click();
        }
      }
    });
  });

  const planList = root.querySelector('[data-plan-list]');
  const planCount = root.querySelector('[data-plan-count]');
  const statusEl = root.querySelector('[data-checkout-status]');
  const selectedPlanEl = root.querySelector('[data-selected-plan]');
  const selectedPriceEl = root.querySelector('[data-selected-price]');
  const form = root.querySelector('[data-commercial-checkout-form]');
  const formMessage = root.querySelector('[data-form-message]');
  const banner = root.querySelector('[data-checkout-banner]');
  const submitButton = form?.querySelector('button[type="submit"]');
  const installmentSelect = form?.querySelector('[data-installment-count]');
  const paymentStep = root.querySelector('[data-payment-step]');
  const paymentElementMount = root.querySelector('[data-payment-element]');
  const paymentMessage = root.querySelector('[data-payment-message]');
  const confirmPaymentButton = root.querySelector('[data-confirm-payment]');

  if (!planList || !planCount || !statusEl || !selectedPlanEl || !selectedPriceEl || !form || !formMessage || !banner || !submitButton || !installmentSelect || !paymentStep || !paymentElementMount || !paymentMessage || !confirmPaymentButton) {
    return;
  }

  let stripe = null;
  let stripeElements = null;
  let stripePaymentElement = null;

  const url = new URL(window.location.href);
  const checkoutState = url.searchParams.get('checkout');
  if (checkoutState === 'success') {
    banner.hidden = false;
    banner.classList.remove('hidden');
    banner.className = 'billing-banner billing-banner--success';
    banner.textContent = 'El pago fue confirmado. Si el webhook ya procesó la suscripción, tu tenant quedará activo en breve.';
  } else if (checkoutState === 'cancel') {
    banner.hidden = false;
    banner.classList.remove('hidden');
    banner.className = 'billing-banner billing-banner--warning';
    banner.textContent = 'El checkout fue cancelado. Puedes volver a elegir un plan y continuar cuando quieras.';
  }

  void bootstrap();

  async function bootstrap() {
    setStatus('Cargando modalidades de contratación...');
    try {
      const plans = await loadPlans();
      renderPlans(plans);
      setStatus('Modalidades cargadas. Elige una opción para continuar.');
    } catch (error) {
      console.error('[public-billing] No se pudieron cargar las modalidades.', error);
      planList.innerHTML = `
        <div class="billing-message billing-message--error">
          No se pudieron cargar las modalidades de contratación en este momento. Intenta más tarde o solicita apoyo por WhatsApp.
        </div>
      `;
      planCount.textContent = '0';
      setStatus('Error al cargar modalidades');
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
          No hay modalidades activas disponibles por ahora.
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
            data-max-installments="${escapeAttr(String(plan.max_installment_count || 1))}"
          >
            <div class="billing-price-row">
              <div>
                <p class="billing-plan-code">${escapeHtml(plan.code)}</p>
                <h4 class="billing-plan-title">${escapeHtml(plan.name)}</h4>
                <p class="billing-plan-desc">${escapeHtml(plan.description || 'Modalidad de contratación activa')}</p>
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
    const selectedCard = planList.querySelector(`[data-plan-id="${cssEscape(planId)}"]`);
    state.maxInstallmentCount = Number(selectedCard?.getAttribute('data-max-installments') || 1);
    renderInstallmentOptions(state.maxInstallmentCount);

    selectedPlanEl.textContent = planName || 'Selecciona un plan';
    selectedPriceEl.textContent = priceLabel ? `${priceLabel} · Pago seguro con Stripe` : 'Elige una modalidad para continuar.';

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
    showMessage('Creando tenant y preparando el pago seguro...', 'info');

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

      if (!data?.payment_intent_client_secret || !data?.stripe_publishable_key) {
        throw new Error('La respuesta no devolvió la configuración del pago.');
      }
      await mountPaymentElement(data);
      showMessage('Revisa los datos de tu tarjeta y confirma el pago.', 'info');
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
    submitButton.textContent = isSubmitting ? 'Preparando pago...' : 'Continuar al pago';
    submitButton.classList.toggle('billing-submit-button--loading', isSubmitting);
  }

  function showMessage(message, kind = 'info') {
    formMessage.textContent = message;
    formMessage.hidden = false;
    formMessage.classList.remove('hidden');
    formMessage.className =
      kind === 'error'
        ? 'billing-message billing-message--error'
        : kind === 'success'
          ? 'billing-message billing-message--success'
          : 'billing-message billing-message--info';
  }

  function renderInstallmentOptions(maxCount) {
    const counts = [1, 3, 6, 9, 12].filter((count) => count <= maxCount);
    installmentSelect.innerHTML = counts
      .map((count) => `<option value="${count}">${count === 1 ? 'Pago único' : `${count} MSI`}</option>`)
      .join('');
  }

  async function mountPaymentElement(data) {
    const StripeConstructor = await loadStripeJs();
    stripe = StripeConstructor(data.stripe_publishable_key);
    stripeElements = stripe.elements({ clientSecret: data.payment_intent_client_secret });
    stripePaymentElement?.unmount();
    stripePaymentElement = stripeElements.create('payment');
    stripePaymentElement.mount(paymentElementMount);
    paymentStep.hidden = false;
    paymentStep.removeAttribute('aria-hidden');
    submitButton.hidden = true;
    confirmPaymentButton.disabled = false;
    confirmPaymentButton.onclick = async () => {
      confirmPaymentButton.disabled = true;
      paymentMessage.textContent = 'Confirmando el pago...';
      paymentMessage.className = 'billing-message billing-message--info';
      paymentMessage.hidden = false;
      const result = await stripe.confirmPayment({
        elements: stripeElements,
        confirmParams: { return_url: data.payment_return_url || window.location.href },
        redirect: 'if_required',
      });
      if (result.error) {
        paymentMessage.textContent = result.error.message || 'No se pudo confirmar el pago.';
        paymentMessage.className = 'billing-message billing-message--error';
        confirmPaymentButton.disabled = false;
        return;
      }
      paymentMessage.textContent = 'Pago confirmado. El tenant quedará activo cuando el webhook termine de procesarlo.';
      paymentMessage.className = 'billing-message billing-message--success';
    };
  }

  function loadStripeJs() {
    if (window.Stripe) return Promise.resolve(window.Stripe);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-stripe-js]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.Stripe), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Stripe.js.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      script.dataset.stripeJs = 'true';
      script.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe.js no está disponible.')));
      script.onerror = () => reject(new Error('No se pudo cargar Stripe.js.'));
      document.head.appendChild(script);
    });
  }

  confirmPaymentButton.disabled = true;
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
