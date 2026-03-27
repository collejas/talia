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

export async function POST() {
  const response = NextResponse.json({ success: true })
  const store = await cookies()
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value

  const config = getSupabaseConfig()
  if (config && accessToken) {
    try {
      await fetch(`${config.url}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      })
    } catch (error) {
      console.warn("[auth] No se pudo cerrar sesión en Supabase", error)
    }
  }

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

  return response
}
