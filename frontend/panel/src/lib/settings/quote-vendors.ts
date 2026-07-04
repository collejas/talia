export type QuoteVendorConditionItem = {
  subtitle: string
  description: string
}

export type QuoteVendorSettings = {
  conditionsTitle: string
  conditions: QuoteVendorConditionItem[]
  notesTitle: string
  notesBody: string
  validityDays: number
}

export const DEFAULT_QUOTE_VENDOR_SETTINGS: QuoteVendorSettings = {
  conditionsTitle: "Condiciones comerciales",
  conditions: [
    {
      subtitle: "Vigencia",
      description: "15 días naturales a partir de la fecha de emisión.",
    },
  ],
  notesTitle: "Notas",
  notesBody: "",
  validityDays: 15,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length ? value.trim() : fallback
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value))
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed))
    }
  }
  return fallback
}

function readConditions(value: unknown): QuoteVendorConditionItem[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_QUOTE_VENDOR_SETTINGS.conditions]
  }
  const items = value
    .map((entry) => {
      if (!isRecord(entry)) return null
      const subtitle = readString(entry.subtitle, "")
      const description = readString(entry.description, "")
      if (!subtitle && !description) return null
      return {
        subtitle,
        description,
      }
    })
    .filter((item): item is QuoteVendorConditionItem => item !== null)

  return items.length ? items : [...DEFAULT_QUOTE_VENDOR_SETTINGS.conditions]
}

export function normalizeQuoteVendorSettings(value: unknown): QuoteVendorSettings {
  if (!isRecord(value)) {
    return {
      ...DEFAULT_QUOTE_VENDOR_SETTINGS,
      conditions: [...DEFAULT_QUOTE_VENDOR_SETTINGS.conditions],
    }
  }

  return {
    conditionsTitle: readString(value.conditionsTitle, DEFAULT_QUOTE_VENDOR_SETTINGS.conditionsTitle),
    conditions: readConditions(value.conditions),
    notesTitle: readString(value.notesTitle, DEFAULT_QUOTE_VENDOR_SETTINGS.notesTitle),
    notesBody: readString(value.notesBody, DEFAULT_QUOTE_VENDOR_SETTINGS.notesBody),
    validityDays: readNumber(value.validityDays ?? value.validity_days, DEFAULT_QUOTE_VENDOR_SETTINGS.validityDays),
  }
}

export function extractQuoteVendorSettings(config: Record<string, unknown> | null | undefined): QuoteVendorSettings {
  if (!config) {
    return {
      ...DEFAULT_QUOTE_VENDOR_SETTINGS,
      conditions: [...DEFAULT_QUOTE_VENDOR_SETTINGS.conditions],
    }
  }
  const source = config.quote_vendedores ?? config.quoteVendors ?? config.cotizaciones_vendedores
  return normalizeQuoteVendorSettings(source)
}

export function buildQuoteVendorSettingsPayload(settings: QuoteVendorSettings): QuoteVendorSettings {
  return {
    conditionsTitle: settings.conditionsTitle.trim() || DEFAULT_QUOTE_VENDOR_SETTINGS.conditionsTitle,
    conditions: settings.conditions
      .map((item) => ({
        subtitle: item.subtitle.trim(),
        description: item.description.trim(),
      }))
      .filter((item) => item.subtitle.length > 0 || item.description.length > 0),
    notesTitle: settings.notesTitle.trim() || DEFAULT_QUOTE_VENDOR_SETTINGS.notesTitle,
    notesBody: settings.notesBody.trim(),
    validityDays: Math.max(1, Math.floor(settings.validityDays || DEFAULT_QUOTE_VENDOR_SETTINGS.validityDays)),
  }
}
