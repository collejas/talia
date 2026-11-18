import { NextResponse, type NextRequest } from "next/server"

import {
  ACCESS_TOKEN_COOKIE,
  COOKIE_BASE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  SESSION_REMEMBER_COOKIE,
  TENANT_CONTEXT_COOKIE,
} from "@/lib/auth/cookies"
import { getSupabaseConfig } from "@/lib/auth/supabase"
import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { isMasterOnlyPath, MASTER_TENANT_ID } from "@/lib/auth/master-tenant"
import { parseTenantContextCookie } from "@/lib/auth/tenant-context"

const PUBLIC_PATHS = ["/auth", "/portal", "/webchat-landing", "/privacy-policy", "/unauthorized"]
const PUBLIC_FILES = new Set(["/webchat-widget.js", "/QR_Lia.png", "/window.svg", "/file.svg", "/vercel.svg", "/globe.svg", "/next.svg"])

function isPublicPath(pathname: string): boolean {
  return pathname === "/" || PUBLIC_FILES.has(pathname) || PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function loginRedirect(request: NextRequest) {
  const login = new URL("/auth/login", request.url)
  login.searchParams.set("redirectTo", `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(login)
}

async function authorizeView(request: NextRequest, accessToken: string, userId: string): Promise<NextResponse> {
  if (!isMasterOnlyPath(request.nextUrl.pathname)) return NextResponse.next()

  const tenantContext = parseTenantContextCookie(request.cookies.get(TENANT_CONTEXT_COOKIE)?.value)
  const requestedTenant = tenantContext?.user_id === userId ? tenantContext.tenant_id : null
  const response = await fetch(`${getPanelApiBaseUrl()}/tenant/me/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(requestedTenant ? { "X-Organizacion-Id": requestedTenant } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  })
  if (response.status === 401) return loginRedirect(request)
  if (response.status === 403) return NextResponse.redirect(new URL("/unauthorized", request.url))
  if (!response.ok) return new NextResponse("Autenticación no disponible.", { status: 503 })
  const profile = await response.json() as { organizacion_id?: unknown }
  if (profile.organizacion_id !== MASTER_TENANT_ID) {
    return NextResponse.redirect(new URL("/unauthorized", request.url))
  }
  return NextResponse.next()
}

export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next()

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  if (!accessToken && !refreshToken) return loginRedirect(request)

  const config = getSupabaseConfig()
  if (!config) return new NextResponse("Autenticación no disponible.", { status: 503 })

  try {
    if (accessToken) {
      const userResponse = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/user`, {
        headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      })
      if (userResponse.ok) {
        const user = await userResponse.json() as { id?: unknown }
        if (typeof user.id === "string" && user.id) return await authorizeView(request, accessToken, user.id)
        return new NextResponse("Autenticación no disponible.", { status: 503 })
      }
      if (userResponse.status !== 401 && userResponse.status !== 403) {
        return new NextResponse("Autenticación no disponible.", { status: 503 })
      }
    }

    if (!refreshToken) return loginRedirect(request)
    const refreshResponse = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    })
    if (!refreshResponse.ok) {
      if ([400, 401, 403].includes(refreshResponse.status)) return loginRedirect(request)
      return new NextResponse("Autenticación no disponible.", { status: 503 })
    }
    const tokens = await refreshResponse.json() as { access_token?: unknown; refresh_token?: unknown; user?: { id?: unknown } }
    if (typeof tokens.access_token !== "string" || !tokens.access_token ||
        typeof tokens.refresh_token !== "string" || !tokens.refresh_token ||
        typeof tokens.user?.id !== "string" || !tokens.user.id) {
      return new NextResponse("Autenticación no disponible.", { status: 503 })
    }
    let authorization: NextResponse
    try {
      authorization = await authorizeView(request, tokens.access_token, tokens.user.id)
    } catch {
      authorization = new NextResponse("Autenticación no disponible.", { status: 503 })
    }
    request.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token)
    request.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token)
    const headers = new Headers(request.headers)
    headers.set("cookie", request.cookies.toString())
    const response = authorization.status === 200
      ? NextResponse.next({ request: { headers } })
      : authorization
    const remember = request.cookies.get(SESSION_REMEMBER_COOKIE)?.value === "1"
    response.cookies.set({ ...COOKIE_BASE_OPTIONS, name: ACCESS_TOKEN_COOKIE, value: tokens.access_token, maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24 })
    response.cookies.set({ ...COOKIE_BASE_OPTIONS, name: REFRESH_TOKEN_COOKIE, value: tokens.refresh_token, maxAge: remember ? 60 * 60 * 24 * 90 : 60 * 60 * 24 * 7 })
    return response
  } catch {
    return new NextResponse("Autenticación no disponible.", { status: 503 })
  }
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|assets(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)"],
}
