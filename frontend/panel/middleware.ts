import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"

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
