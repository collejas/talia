import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import {
  ACCESS_TOKEN_COOKIE,
  COOKIE_BASE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  SESSION_REMEMBER_COOKIE,
} from "@/lib/auth/cookies"
import { getSupabaseConfig } from "@/lib/auth/supabase"
import { SupabaseErrorResponse, SupabaseTokenResponse } from "@/lib/auth/types"

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

function applySessionCookies(
  response: NextResponse,
  tokens: SupabaseTokenResponse,
  remember: boolean,
) {
  const accessMaxAge = remember ? 60 * 60 * 24 * 7 : undefined
  const refreshMaxAge = remember ? 60 * 60 * 24 * 30 : undefined

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
        const user = await userResponse.json()
        return NextResponse.json({ user })
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
  const response = NextResponse.json({ user: tokens.user })
  applySessionCookies(response, tokens, remember)
  return response
}
