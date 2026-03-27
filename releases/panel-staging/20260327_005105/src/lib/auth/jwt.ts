import { Buffer } from "node:buffer"

export type SupabaseJwtPayload = {
  sub?: string
  user_id?: string
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
} & Record<string, unknown>

export function decodeJwtPayload(token: string | null | undefined): SupabaseJwtPayload | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length < 2) return null
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as SupabaseJwtPayload
  } catch {
    return null
  }
}

export function decodeJwtUserId(token: string | null | undefined): string | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  if (payload.sub && typeof payload.sub === "string") return payload.sub
  if (payload.user_id && typeof payload.user_id === "string") return payload.user_id
  return null
}

export function decodeJwtOrganizacionId(token: string | null | undefined): string | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  const metadata =
    (payload.user_metadata && typeof payload.user_metadata === "object" ? payload.user_metadata : null) ??
    (payload.app_metadata && typeof payload.app_metadata === "object" ? payload.app_metadata : null)
  if (!metadata) return null
  const value = metadata.organizacion_id
  if (typeof value === "string" && value.trim()) {
    return value.trim()
  }
  return null
}
