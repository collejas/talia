export function formatApiError(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString()
  }
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value)
    } catch {
      return value.join(", ")
    }
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
  return String(value)
}
