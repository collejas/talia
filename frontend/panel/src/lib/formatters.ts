import { DEFAULT_TIME_ZONE, getActiveTimeZone, normalizeTimeZone } from "@/lib/timezone"

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function resolveDisplayTimeZone(explicitTimeZone?: string | null): string {
  return (
    normalizeTimeZone(explicitTimeZone) ||
    normalizeTimeZone(getActiveTimeZone()) ||
    DEFAULT_TIME_ZONE
  )
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  })
  formatterCache.set(timeZone, formatter)
  return formatter
}

export function formatDateTime(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return getFormatter(resolveDisplayTimeZone(timeZone)).format(parsed)
}

export function formatDate(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: resolveDisplayTimeZone(timeZone),
  }).format(parsed)
}
