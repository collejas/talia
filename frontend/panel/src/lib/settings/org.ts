import { cookies } from "next/headers"
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"
import { decodeJwtOrganizacionId } from "@/lib/auth/jwt"

const ORGANIZATION_ENV_KEYS = [
  "PANEL_ORGANIZACION_ID",
  "TALIA_ORGANIZACION_ID",
  "NEXT_PUBLIC_ORGANIZACION_ID",
] as const

export function getDefaultOrganizacionId(): string | null {
  for (const key of ORGANIZATION_ENV_KEYS) {
    const value = process.env[key]
    if (value && value.trim().length) {
      return value.trim()
    }
  }
  return null
}

export async function resolveOrganizacionId(): Promise<string | null> {
  try {
    const store = await cookies()
    const token =
      store.get(ACCESS_TOKEN_COOKIE)?.value ||
      store.get("sb-access-token")?.value ||
      store.get("access_token")?.value ||
      null
    if (token) {
      const decoded = decodeJwtOrganizacionId(token)
      if (decoded) {
        return decoded
      }
    }
  } catch {
    // ignore; fallback to env var
  }
  return getDefaultOrganizacionId()
}
