const DEFAULT_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "America/Mexico_City"

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: DEFAULT_TIME_ZONE,
})

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return DATE_TIME_FORMATTER.format(parsed)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(parsed)
}
