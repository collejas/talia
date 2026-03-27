const SOURCE_CLASS_LABELS: Record<string, string> = {
  campaign: "Enlace de campaña",
  direct: "Entrada directa",
  organic_search: "Búsqueda en Google",
  organic_social: "Redes sociales",
  referral: "Otro sitio web",
  unknown: "Sin identificar",
}

export const SOURCE_CLASS_OPTIONS = [
  { value: "all", label: "Todos los orígenes" },
  { value: "direct", label: SOURCE_CLASS_LABELS.direct },
  { value: "campaign", label: SOURCE_CLASS_LABELS.campaign },
  { value: "organic_search", label: SOURCE_CLASS_LABELS.organic_search },
  { value: "organic_social", label: SOURCE_CLASS_LABELS.organic_social },
  { value: "referral", label: SOURCE_CLASS_LABELS.referral },
]

export function formatSourceClassLabel(value: string | null | undefined): string {
  if (!value) return SOURCE_CLASS_LABELS.unknown
  const normalized = value.trim().toLowerCase()
  if (!normalized) return SOURCE_CLASS_LABELS.unknown
  return SOURCE_CLASS_LABELS[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1)
}
