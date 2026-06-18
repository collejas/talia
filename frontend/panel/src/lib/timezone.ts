export const DEFAULT_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "America/Mexico_City"

export type TimezoneSource = "user" | "organization" | "default"

let activeTimeZone = DEFAULT_TIME_ZONE

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function normalizeTimeZone(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return isValidTimeZone(trimmed) ? trimmed : null
}

export function resolveEffectiveTimeZone(
  userTimeZone?: string | null,
  tenantTimeZone?: string | null,
  fallbackTimeZone?: string | null,
): { timeZone: string; source: TimezoneSource } {
  const user = normalizeTimeZone(userTimeZone)
  if (user) return { timeZone: user, source: "user" }

  const tenant = normalizeTimeZone(tenantTimeZone)
  if (tenant) return { timeZone: tenant, source: "organization" }

  const fallback = normalizeTimeZone(fallbackTimeZone) || normalizeTimeZone(DEFAULT_TIME_ZONE)
  if (fallback) return { timeZone: fallback, source: "default" }

  return { timeZone: DEFAULT_TIME_ZONE, source: "default" }
}

export function getActiveTimeZone(): string {
  return activeTimeZone
}

export function setActiveTimeZone(value: string | null | undefined): string {
  const normalized = normalizeTimeZone(value)
  activeTimeZone = normalized || DEFAULT_TIME_ZONE
  return activeTimeZone
}
