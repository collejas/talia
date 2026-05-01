const SOURCE_CLASS_LABELS: Record<string, string> = {
  ai_referral: "Asistente de IA",
  campaign: "Enlace de campaña",
  direct: "Entrada directa",
  organic_search: "Búsqueda en Google",
  organic_social: "Redes sociales",
  referral: "Otro sitio web",
  unknown: "Sin identificar",
}

export const SOURCE_CLASS_OPTIONS = [
  { value: "all", label: "Todos los orígenes" },
  { value: "ai_referral", label: SOURCE_CLASS_LABELS.ai_referral },
  { value: "direct", label: SOURCE_CLASS_LABELS.direct },
  { value: "campaign", label: SOURCE_CLASS_LABELS.campaign },
  { value: "organic_search", label: SOURCE_CLASS_LABELS.organic_search },
  { value: "organic_social", label: SOURCE_CLASS_LABELS.organic_social },
  { value: "referral", label: SOURCE_CLASS_LABELS.referral },
]

const AI_REFERRAL_MARKERS = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "perplexity.ai",
  "copilot.microsoft.com",
  "gemini.google.com",
  "bard.google.com",
  "claude.ai",
  "poe.com",
  "you.com",
]

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase()
}

function extractHostFromUrl(value: string | null | undefined): string {
  const text = normalizeText(value)
  if (!text) return ""
  try {
    const url = new URL(text)
    return (url.hostname || "").trim().toLowerCase()
  } catch {
    return text
  }
}

function looksLikeAiReferral(value: string | null | undefined): boolean {
  const text = normalizeText(value)
  if (!text) return false
  return AI_REFERRAL_MARKERS.some((marker) => text.includes(marker))
}

export function normalizeAcquisitionSourceClass(params: {
  sourceClass?: string | null
  referrerHost?: string | null
  referrer?: string | null
  landingUrl?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
}): string {
  const explicit = normalizeText(params.sourceClass)
  if (explicit === "ai_referral") return explicit

  const referrerHost = normalizeText(params.referrerHost)
  if (
    looksLikeAiReferral(params.utmSource) ||
    looksLikeAiReferral(referrerHost) ||
    looksLikeAiReferral(extractHostFromUrl(params.referrer)) ||
    looksLikeAiReferral(extractHostFromUrl(params.landingUrl))
  ) {
    return "ai_referral"
  }

  const utmSource = normalizeText(params.utmSource)
  const utmMedium = normalizeText(params.utmMedium)
  const utmCampaign = normalizeText(params.utmCampaign)
  if (utmSource || utmMedium || utmCampaign) return "campaign"

  if (explicit) return explicit

  const referrer = normalizeText(params.referrer)
  if (!referrer) return "direct"
  if (referrer.includes("google.")) return "organic_search"
  if (["facebook.", "instagram.", "twitter.", "t.co", "linkedin."].some((token) => referrer.includes(token))) {
    return "organic_social"
  }
  return "referral"
}

export function formatSourceClassLabel(value: string | null | undefined): string {
  if (!value) return SOURCE_CLASS_LABELS.unknown
  const normalized = value.trim().toLowerCase()
  if (!normalized) return SOURCE_CLASS_LABELS.unknown
  return SOURCE_CLASS_LABELS[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1)
}
