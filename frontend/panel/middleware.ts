import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { ACCESS_TOKEN_COOKIE, TENANT_CONTEXT_COOKIE } from "@/lib/auth/cookies"
import { decodeJwtOrganizacionId, decodeJwtUserId } from "@/lib/auth/jwt"
import { isMasterOnlyPath, MASTER_TENANT_ID } from "@/lib/auth/master-tenant"
import { parseTenantContextCookie } from "@/lib/auth/tenant-context"

const DASHBOARD_PREFIX = "/dashboard"
const LOGIN_PATH = "/auth/login"
const UNAUTHORIZED_PATH = "/unauthorized"

function buildRedirectUrl(request: NextRequest, pathname: string) {
  const url = new URL(LOGIN_PATH, request.url)
  const originalPath = pathname + request.nextUrl.search
  if (originalPath && originalPath !== LOGIN_PATH) {
    url.searchParams.set("redirectTo", originalPath)
  }
  return url
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value)
  const isRestrictedMasterRoute = isMasterOnlyPath(pathname)

  const isDashboard = pathname.startsWith(DASHBOARD_PREFIX)
  const isLogin = pathname === LOGIN_PATH
  const isUnauthorized = pathname === UNAUTHORIZED_PATH

  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next()
  }

  if (isDashboard && !hasSession) {
    const redirectUrl = buildRedirectUrl(request, pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (isLogin && hasSession) {
    const redirectUrl = new URL(DASHBOARD_PREFIX, request.url)
    return NextResponse.redirect(redirectUrl)
  }

  if (isRestrictedMasterRoute) {
    if (!hasSession) {
      return NextResponse.redirect(buildRedirectUrl(request, pathname))
    }

    const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null
    const tokenUserId = decodeJwtUserId(token)
    const decodedOrganizacionId = decodeJwtOrganizacionId(token)
    const tenantOverrideRaw = request.cookies.get(TENANT_CONTEXT_COOKIE)?.value?.trim() || null
    const tenantOverride = parseTenantContextCookie(tenantOverrideRaw)
    const effectiveOrganizacionId =
      tenantOverride && tokenUserId && tenantOverride.user_id === tokenUserId
        ? tenantOverride.tenant_id
        : decodedOrganizacionId

    if (effectiveOrganizacionId !== MASTER_TENANT_ID) {
      return NextResponse.redirect(new URL(UNAUTHORIZED_PATH, request.url))
    }
  }

  if (!hasSession || isLogin || isUnauthorized) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next|api|auth|portal|webchat-landing|privacy-policy|favicon.ico).*)",
  ],
}
