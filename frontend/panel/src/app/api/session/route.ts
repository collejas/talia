import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import {
  ACCESS_TOKEN_COOKIE,
  COOKIE_BASE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  SESSION_REMEMBER_COOKIE,
  TENANT_CONTEXT_COOKIE,
} from "@/lib/auth/cookies"
import { getSupabaseConfig } from "@/lib/auth/supabase"
import { SupabaseErrorResponse, SupabaseTokenResponse } from "@/lib/auth/types"
import { callCrmApi } from "@/lib/api/crm"
import { callSupabaseRest } from "@/lib/supabase/rest"
import { SessionPayload, SupabaseUser, TenantInfo } from "@/lib/auth/session"
import { resolveOrganizacionId } from "@/lib/settings/org"

type TenantSettingsResponse = {
  organizacion_id: string
  nombre: string
  razon_social?: string | null
}

type SupabaseEmployeeRow = {
  usuario_id: string
  puesto?: { nombre?: string | null } | null
}

type ScoringFeatureStatus = {
  profiling_enabled?: boolean
}

async function fetchPlatformAdminStatus(): Promise<boolean> {
  const response = await callCrmApi<{ is_platform_admin: boolean }>("/admin/me/platform-admin", {
    organizacionId: null,
    withUserToken: true,
  })
  return Boolean(response.ok && response.data?.is_platform_admin)
}

async function fetchScoringFeatureStatus(): Promise<boolean> {
  const response = await callCrmApi<ScoringFeatureStatus>("/crm/pipeline/scoring/feature-status", {
    withUserToken: true,
  })
  if (!response.ok || !response.data) {
    return true
  }
  return Boolean(response.data.profiling_enabled)
}

async function fetchSupabaseUser(
  config: { url: string; anonKey: string },
  accessToken: string,
): Promise<Response> {
  return fetch(`${config.url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Cache-Control": "no-cache",
    },
  })
}

async function refreshSupabaseTokens(
  config: { url: string; anonKey: string },
  refreshToken: string,
): Promise<Response> {
  return fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  })
}

async function fetchTenantMetadata(): Promise<TenantInfo | null> {
  const response = await callCrmApi<TenantSettingsResponse>("/tenant/me/settings", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok || !response.data) {
    return null
  }
  const { nombre, razon_social } = response.data
  if (!nombre && !razon_social) {
    return null
  }
  return {
    nombre: nombre ?? "",
    razon_social: razon_social ?? null,
  }
}

async function fetchEmployeePosition(usuarioId: string | null): Promise<string | null> {
  if (!usuarioId) return null
  const response = await callSupabaseRest<SupabaseEmployeeRow[]>("/rest/v1/empleados", {
    searchParams: {
      select: "usuario_id,puesto:puestos(nombre)",
      usuario_id: `eq.${usuarioId}`,
      limit: "1",
      order: "creado_en.desc",
    },
    enforceOrganization: true,
    forceServiceToken: true,
  })
  if (!response.ok) {
    return null
  }
  if (!Array.isArray(response.data) || response.data.length === 0) {
    return null
  }
  return response.data[0]?.puesto?.nombre?.trim() || null
}

async function buildSessionPayload(user: SupabaseUser): Promise<SessionPayload> {
  const [tenant, organizacionId, employeePosition, isPlatformAdmin, profilingEnabled] = await Promise.all([
    fetchTenantMetadata(),
    resolveOrganizacionId(),
    fetchEmployeePosition(user.id),
    fetchPlatformAdminStatus(),
    fetchScoringFeatureStatus(),
  ])
  return {
    user,
    tenant,
    organizacion_id: organizacionId,
    employeePosition,
    isPlatformAdmin,
    profilingEnabled,
  }
}

function applySessionCookies(
  response: NextResponse,
  tokens: SupabaseTokenResponse,
  remember: boolean,
) {
  const accessMaxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24
  const refreshMaxAge = remember ? 60 * 60 * 24 * 90 : 60 * 60 * 24 * 7

  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: ACCESS_TOKEN_COOKIE,
    value: tokens.access_token,
    maxAge: accessMaxAge,
  })

  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: REFRESH_TOKEN_COOKIE,
    value: tokens.refresh_token,
    maxAge: refreshMaxAge,
  })

  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: SESSION_REMEMBER_COOKIE,
    value: remember ? "1" : "0",
    maxAge: refreshMaxAge,
  })
}

function clearSessionCookies(response: NextResponse) {
  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: ACCESS_TOKEN_COOKIE,
    value: "",
    maxAge: 0,
  })
  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: REFRESH_TOKEN_COOKIE,
    value: "",
    maxAge: 0,
  })
  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: SESSION_REMEMBER_COOKIE,
    value: "",
    maxAge: 0,
  })
  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: TENANT_CONTEXT_COOKIE,
    value: "",
    maxAge: 0,
  })
}

export async function GET() {
  const config = getSupabaseConfig()
  if (!config) {
    return NextResponse.json(
      { error: "auth_not_configured" },
      { status: 500 },
    )
  }

  const store = await cookies()
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value || ""
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value || ""
  const remember =
    store.get(SESSION_REMEMBER_COOKIE)?.value === "1" ? true : false

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 })
  }

  if (accessToken) {
    try {
      const userResponse = await fetchSupabaseUser(config, accessToken)
      if (userResponse.ok) {
        const user = (await userResponse.json()) as SupabaseUser
        const payload = await buildSessionPayload(user)
        return NextResponse.json(payload)
      }

      if (userResponse.status !== 401) {
        const errorBody = (await userResponse.json()) as SupabaseErrorResponse
        return NextResponse.json(
          { error: errorBody.error || "auth_failed" },
          { status: userResponse.status },
        )
      }
    } catch (error) {
      console.error("[auth] Error fetching user session", error)
      return NextResponse.json(
        { error: "auth_service_unavailable" },
        { status: 502 },
      )
    }
  }

  if (!refreshToken) {
    const response = NextResponse.json({ error: "auth_required" }, { status: 401 })
    clearSessionCookies(response)
    return response
  }

  let refreshResponse: Response
  try {
    refreshResponse = await refreshSupabaseTokens(config, refreshToken)
  } catch (error) {
    console.error("[auth] Error refreshing session", error)
    const response = NextResponse.json(
      { error: "auth_service_unavailable" },
      { status: 502 },
    )
    clearSessionCookies(response)
    return response
  }

  if (!refreshResponse.ok) {
    const response = NextResponse.json({ error: "auth_required" }, { status: 401 })
    clearSessionCookies(response)
    return response
  }

  const tokens = (await refreshResponse.json()) as SupabaseTokenResponse
  const payload = await buildSessionPayload(tokens.user)
  const response = NextResponse.json(payload)
  applySessionCookies(response, tokens, remember)
  return response
}
