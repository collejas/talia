"use server"

import { cookies } from "next/headers"

import {
  ACCESS_TOKEN_COOKIE,
  COOKIE_BASE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  SESSION_REMEMBER_COOKIE,
} from "@/lib/auth/cookies"
import { decodeJwtPayload } from "@/lib/auth/jwt"
import { getSupabaseConfig } from "@/lib/auth/supabase"
import { SupabaseTokenResponse } from "@/lib/auth/types"

type SessionTokenResolution = {
  accessToken: string | null
  refreshToken: string | null
  refreshed: boolean
}

type ResolveOptions = {
  forceRefresh?: boolean
  minTtlSeconds?: number
}

function isAccessTokenFreshEnough(token: string, minTtlSeconds: number): boolean {
  const remaining = getAccessTokenRemainingSeconds(token)
  if (remaining === null) return true
  return remaining > minTtlSeconds
}

function canStillUseAccessToken(token: string): boolean {
  const remaining = getAccessTokenRemainingSeconds(token)
  if (remaining === null) return true
  return remaining > 0
}

function getAccessTokenRemainingSeconds(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const expCandidate = payload ? (payload as Record<string, unknown>)["exp"] : null
  const exp = typeof expCandidate === "number" ? expCandidate : null
  if (!exp) return null
  const now = Math.floor(Date.now() / 1000)
  return exp - now
}

async function refreshSupabaseTokens(refreshToken: string): Promise<SupabaseTokenResponse | null> {
  const config = getSupabaseConfig()
  if (!config) return null
  try {
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as SupabaseTokenResponse
  } catch {
    return null
  }
}

async function applySessionCookies(
  tokenPayload: SupabaseTokenResponse,
  remember: boolean,
): Promise<void> {
  const store = await cookies()
  const accessMaxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24
  const refreshMaxAge = remember ? 60 * 60 * 24 * 90 : 60 * 60 * 24 * 7

  try {
    store.set({
      ...COOKIE_BASE_OPTIONS,
      name: ACCESS_TOKEN_COOKIE,
      value: tokenPayload.access_token,
      maxAge: accessMaxAge,
    })
    store.set({
      ...COOKIE_BASE_OPTIONS,
      name: REFRESH_TOKEN_COOKIE,
      value: tokenPayload.refresh_token,
      maxAge: refreshMaxAge,
    })
    store.set({
      ...COOKIE_BASE_OPTIONS,
      name: SESSION_REMEMBER_COOKIE,
      value: remember ? "1" : "0",
      maxAge: refreshMaxAge,
    })
  } catch {
    // Cookies inmutables (por ejemplo, Server Components): usar solo token en memoria para este request.
  }
}

export async function resolveServerSessionTokens(
  options: ResolveOptions = {},
): Promise<SessionTokenResolution> {
  const minTtlSeconds = Math.max(0, options.minTtlSeconds ?? 600)
  const store = await cookies()
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value || null
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value || null
  const remember = store.get(SESSION_REMEMBER_COOKIE)?.value === "1"
  const accessTokenUsable = accessToken ? canStillUseAccessToken(accessToken) : false

  const accessTokenIsFresh =
    accessToken && !options.forceRefresh
      ? isAccessTokenFreshEnough(accessToken, minTtlSeconds)
      : false

  if (accessToken && accessTokenIsFresh) {
    return {
      accessToken,
      refreshToken,
      refreshed: false,
    }
  }

  if (!refreshToken) {
    return {
      accessToken: accessTokenUsable ? accessToken : null,
      refreshToken: null,
      refreshed: false,
    }
  }

  const tokenPayload = await refreshSupabaseTokens(refreshToken)
  if (!tokenPayload?.access_token) {
    return {
      accessToken: accessTokenUsable ? accessToken : null,
      refreshToken,
      refreshed: false,
    }
  }

  await applySessionCookies(tokenPayload, remember)
  return {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    refreshed: true,
  }
}

export async function resolveServerAccessToken(
  options: ResolveOptions = {},
): Promise<string | null> {
  const result = await resolveServerSessionTokens(options)
  return result.accessToken
}
