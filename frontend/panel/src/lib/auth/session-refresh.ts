let refreshPromise: Promise<boolean> | null = null

const SESSION_ERROR_PATTERN = /jwt|token|auth/i

function extractMessage(payload: unknown): string | null {
  if (!payload) return null

  if (typeof payload === "string") {
    return payload
  }

  if (typeof payload !== "object") {
    return null
  }

  const container = payload as Record<string, unknown>
  const fields = ["message", "detail", "error", "hint"]

  for (const key of fields) {
    const value = container[key]
    if (typeof value === "string" && value.trim().length) {
      return value
    }
  }

  return null
}

export function shouldAttemptSessionRefresh(status: number, payload: unknown): boolean {
  if (status !== 401) return false
  if (!payload) return true
  const message = extractMessage(payload)
  if (!message) return true
  return SESSION_ERROR_PATTERN.test(message)
}

export async function refreshSession(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false
  }
  if (!refreshPromise) {
    refreshPromise = fetch("/api/session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}
