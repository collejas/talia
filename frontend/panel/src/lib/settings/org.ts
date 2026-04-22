import { cookies } from "next/headers"
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"
import { decodeJwtOrganizacionId, decodeJwtUserId } from "@/lib/auth/jwt"
import { callCrmApi } from "@/lib/api/crm"
import { TENANT_CONTEXT_COOKIE } from "@/lib/auth/cookies"
import { getSupabaseConfig } from "@/lib/auth/supabase"

const ORGANIZATION_ENV_KEYS = [
  "PANEL_ORGANIZACION_ID",
  "TALIA_ORGANIZACION_ID",
  "NEXT_PUBLIC_ORGANIZACION_ID",
] as const

const SUPABASE_SERVICE_ROLE_KEYS = [
  "SUPABASE_SERVICE_ROLE",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SERVICE_API_KEY",
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

function getSupabaseServiceRole(): string | null {
  for (const key of SUPABASE_SERVICE_ROLE_KEYS) {
    const value = process.env[key]
    if (value && value.trim().length) {
      return value.trim()
    }
  }
  return null
}

async function resolveUsuarioOrganizacionIdFromDb(userId: string): Promise<string | null> {
  const config = getSupabaseConfig()
  const serviceRole = getSupabaseServiceRole()
  if (!config || !serviceRole) {
    return null
  }

  const url = new URL("/rest/v1/usuarios", config.url.replace(/\/+$/, ""))
  url.searchParams.set("select", "organizacion_id")
  url.searchParams.set("id", `eq.${userId}`)
  url.searchParams.set("limit", "1")

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
    })
    if (!response.ok) {
      return null
    }
    const data = (await response.json()) as Array<{ organizacion_id?: string | null }>
    const first = Array.isArray(data) ? data[0] : null
    const value = first?.organizacion_id
    return typeof value === "string" && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

export async function resolveOrganizacionId(): Promise<string | null> {
  try {
    const store = await cookies()
    const token =
      store.get(ACCESS_TOKEN_COOKIE)?.value ||
      store.get("sb-access-token")?.value ||
      store.get("access_token")?.value ||
      null
    const tenantOverride = store.get(TENANT_CONTEXT_COOKIE)?.value?.trim() || null
    if (token) {
      const tokenUserId = decodeJwtUserId(token)
      const decoded = decodeJwtOrganizacionId(token)
      if (tenantOverride) {
        const platformStatus = await callCrmApi<{ is_platform_admin: boolean }>("/admin/me/platform-admin", {
          method: "GET",
          organizacionId: null,
          withUserToken: true,
        })
        if (platformStatus.ok && platformStatus.data?.is_platform_admin) {
          return tenantOverride
        }
      }
      if (tokenUserId) {
        const canonicalOrganizacionId = await resolveUsuarioOrganizacionIdFromDb(tokenUserId)
        if (canonicalOrganizacionId) {
          return canonicalOrganizacionId
        }
      }
      if (decoded) {
        return decoded
      }
    }
  } catch {
    // ignore; fallback to env var
  }
  return getDefaultOrganizacionId()
}
