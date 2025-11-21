type HighlightList = string[]

export type QuoteTemplateConfig = {
  logoUrl: string
  primaryColor: string
  accentColor: string
  headerTitle: string
  headerSubtitle: string
  introText: string
  highlights: HighlightList
  notesTitle: string
  notesBody: string
  termsTitle: string
  termsBody: string
  signatureName: string
  signatureRole: string
  footerNote: string
}

export type QuoteTemplateSettings = {
  slug: string
  name: string
  description: string
  config: QuoteTemplateConfig
  html: string
  css: string
  variables: string[]
  version: number
  isActive: boolean
  updatedAt?: string | null
}

export type QuoteTemplateSettingsInput = {
  name: string
  description: string
  config: QuoteTemplateConfig
}

const DEFAULT_VARIABLES = [
  "cliente.nombre",
  "cliente.empresa",
  "cliente.correo",
  "cliente.telefono",
  "lead.nombre",
  "cotizacion.referencia",
  "cotizacion.fecha",
  "cotizacion.descripcion",
  "cotizacion.vigencia",
  "tabla_conceptos",
  "resumen_totales",
  "ejecutivo.nombre",
  "ejecutivo.correo",
]

export const DEFAULT_TEMPLATE_CONFIG: QuoteTemplateConfig = {
  logoUrl: "/assets/logos/Logo8.png",
  primaryColor: "#0f172a",
  accentColor: "#14b8a6",
  headerTitle: "Geoactiv · Propuesta Comercial",
  headerSubtitle: "Solución integral Tal-IA",
  introText:
    "Hola {{cliente.nombre}}, te compartimos la propuesta que resume la solución acordada para {{cliente.empresa}}.",
  highlights: [
    "Automatiza la atención 24/7 en webchat, WhatsApp y voz.",
    "Califica prospectos y agenda demos sin saturar a tu equipo.",
    "Centraliza conversaciones y métricas en un solo panel.",
  ],
  notesTitle: "Notas detectadas",
  notesBody:
    "Documentamos las necesidades conversadas y personalizamos la activación para {{cliente.empresa}}.",
  termsTitle: "Términos y vigencia",
  termsBody: "Esta propuesta es referencial y puede ajustarse a la medida. Vigencia 15 días naturales.",
  signatureName: "Equipo Tal-IA",
  signatureRole: "Consultoría Geoactiv",
  footerNote: "Tal-IA automatiza ventas y soporte omnicanal.",
}

function buildHighlightList(highlights: HighlightList): string {
  const sanitized = highlights
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (!sanitized.length) {
    return "<li>Agrega puntos clave desde Settings.</li>"
  }
  return sanitized.map((item) => `<li>${item}</li>`).join("")
}

export function buildQuoteTemplateAssets(config: QuoteTemplateConfig): { html: string; css: string } {
  const highlightsHtml = buildHighlightList(config.highlights)
  const safeLogo = config.logoUrl.trim() || DEFAULT_TEMPLATE_CONFIG.logoUrl
  const intro = config.introText || DEFAULT_TEMPLATE_CONFIG.introText
  const notesBody = config.notesBody || DEFAULT_TEMPLATE_CONFIG.notesBody
  const termsBody = config.termsBody || DEFAULT_TEMPLATE_CONFIG.termsBody
  const signatureName = config.signatureName || DEFAULT_TEMPLATE_CONFIG.signatureName
  const signatureRole = config.signatureRole || DEFAULT_TEMPLATE_CONFIG.signatureRole
  const footerNote = config.footerNote || DEFAULT_TEMPLATE_CONFIG.footerNote

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Cotización {{cotizacion.referencia}}</title>
  </head>
  <body>
    <header>
      <div class="brand">
        <img src="${safeLogo}" alt="Logo" class="logo" />
        <div>
          <p class="eyebrow">${config.headerTitle}</p>
          <h1>${config.headerSubtitle}</h1>
          <p class="muted">Proyecto {{lead.nombre}} · Emitida el {{cotizacion.fecha}}</p>
        </div>
      </div>
    </header>

    <section class="intro">
      <p>${intro}</p>
    </section>

    <section>
      <h2>Resumen ejecutivo</h2>
      <ul class="highlights">
        ${highlightsHtml}
      </ul>
    </section>

    <section>
      <h2>Detalle de conceptos</h2>
      {{tabla_conceptos}}
    </section>

    <section>
      <h2>Resumen económico</h2>
      {{resumen_totales}}
      <p class="muted">Vigencia estimada: {{cotizacion.vigencia}}</p>
    </section>

    <section>
      <h2>${config.notesTitle}</h2>
      <p>${notesBody}</p>
    </section>

    <section>
      <h2>${config.termsTitle}</h2>
      <p>${termsBody}</p>
    </section>

    <footer>
      <p>Emitido por {{ejecutivo.nombre}} · {{ejecutivo.correo}}</p>
      <p>${signatureName} · ${signatureRole}</p>
      <p class="muted">${footerNote}</p>
    </footer>
  </body>
</html>`

  const css = `
:root {
  --quote-primary: ${config.primaryColor || DEFAULT_TEMPLATE_CONFIG.primaryColor};
  --quote-accent: ${config.accentColor || DEFAULT_TEMPLATE_CONFIG.accentColor};
}
body {
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #0f172a;
  margin: 0;
  padding: 40px 48px;
  line-height: 1.5;
}
header {
  border-bottom: 2px solid var(--quote-accent);
  padding-bottom: 16px;
  margin-bottom: 32px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}
.logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 8px;
  background: #fff;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.75rem;
  color: var(--quote-accent);
  margin-bottom: 4px;
}
h1 {
  margin: 0 0 4px;
  font-size: 1.75rem;
  color: var(--quote-primary);
}
h2 {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 6px;
  margin-top: 32px;
  color: var(--quote-primary);
  font-size: 1.1rem;
}
section {
  margin-bottom: 24px;
}
.intro {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 20px;
}
.highlights {
  display: grid;
  gap: 8px;
  padding-left: 20px;
}
.highlights li {
  background: #f0fdf4;
  border-left: 3px solid var(--quote-accent);
  padding: 8px 12px;
  border-radius: 6px;
  list-style: none;
}
.concept-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}
.concept-table th,
.concept-table td {
  border: 1px solid #e2e8f0;
  padding: 10px 12px;
  vertical-align: top;
}
.concept-table th {
  background: #f8fafc;
  color: var(--quote-primary);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.concept-title {
  font-weight: 600;
  width: 25%;
}
.concept-desc {
  width: 55%;
}
.concept-amount {
  text-align: right;
  font-weight: 600;
  color: var(--quote-primary);
  white-space: nowrap;
}
.totals-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-top: 12px;
}
.totals-item {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 16px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.totals-item span {
  font-size: 0.8rem;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.08em;
}
.totals-item strong {
  font-size: 1.15rem;
  color: var(--quote-primary);
}
.muted {
  color: #475569;
  font-size: 0.9rem;
}
footer {
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
  font-size: 0.95rem;
}
`

  return { html, css }
}

export const QUOTE_TEMPLATE_DEFAULTS: QuoteTemplateSettings = (() => {
  const assets = buildQuoteTemplateAssets(DEFAULT_TEMPLATE_CONFIG)
  return {
    slug: "default",
    name: "Formato estándar Tal-IA",
    description: "Plantilla base utilizada para las cotizaciones PDF generadas en el panel.",
    config: DEFAULT_TEMPLATE_CONFIG,
    html: assets.html,
    css: assets.css,
    variables: [...DEFAULT_VARIABLES],
    version: 1,
    isActive: true,
    updatedAt: undefined,
  }
})()

export function cloneQuoteTemplateDefaults(): QuoteTemplateSettings {
  const config: QuoteTemplateConfig = { ...QUOTE_TEMPLATE_DEFAULTS.config, highlights: [...QUOTE_TEMPLATE_DEFAULTS.config.highlights] }
  const assets = buildQuoteTemplateAssets(config)
  return {
    slug: QUOTE_TEMPLATE_DEFAULTS.slug,
    name: QUOTE_TEMPLATE_DEFAULTS.name,
    description: QUOTE_TEMPLATE_DEFAULTS.description,
    config,
    html: assets.html,
    css: assets.css,
    variables: [...QUOTE_TEMPLATE_DEFAULTS.variables],
    version: QUOTE_TEMPLATE_DEFAULTS.version,
    isActive: QUOTE_TEMPLATE_DEFAULTS.isActive,
    updatedAt: undefined,
  }
}
