import { NextResponse } from "next/server"

import {
  ACCESS_TOKEN_COOKIE,
  COOKIE_BASE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  SESSION_REMEMBER_COOKIE,
  TENANT_CONTEXT_COOKIE,
} from "@/lib/auth/cookies"
import { getSupabaseConfig } from "@/lib/auth/supabase"
import { SupabaseErrorResponse, SupabaseTokenResponse } from "@/lib/auth/types"

type LoginPayload = {
  email?: string
  password?: string
  rememberMe?: boolean
  redirectTo?: string | null
}

const DEFAULT_REDIRECT = "/dashboard"

function sanitizeRedirectPath(path: string | null | undefined): string | null {
  if (!path) return null
  if (!path.startsWith("/")) return null
  if (path.startsWith("//")) return null
  // Evitar redirigir nuevamente a páginas de autenticación
  if (path.startsWith("/auth")) return DEFAULT_REDIRECT
  return path
}

export async function POST(request: Request) {
  const payload = (await request.json()) as LoginPayload
  const email = payload.email?.trim().toLowerCase()
  const password = payload.password || ""
  const rememberMe = Boolean(payload.rememberMe)
  const redirectTo = sanitizeRedirectPath(payload.redirectTo) || DEFAULT_REDIRECT

  if (!email || !password) {
    return NextResponse.json(
      { error: "Correo y contraseña son requeridos." },
      { status: 400 },
    )
  }

  const config = getSupabaseConfig()
  if (!config) {
    return NextResponse.json(
      { error: "Autenticación no disponible: configura Supabase en el entorno." },
      { status: 500 },
    )
  }

  let supabaseResponse: Response
  try {
    supabaseResponse = await fetch(
      `${config.url}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      },
    )
  } catch (error) {
    console.error("[auth] Error contacting Supabase", error)
    return NextResponse.json(
      { error: "No se pudo contactar al servicio de autenticación." },
      { status: 502 },
    )
  }

  if (!supabaseResponse.ok) {
    const errorBody = (await supabaseResponse.json()) as SupabaseErrorResponse
    const message =
      errorBody.error_description ||
      errorBody.message ||
      errorBody.error ||
      "Credenciales inválidas."
    return NextResponse.json({ error: message }, { status: 401 })
  }

  const tokenPayload = (await supabaseResponse.json()) as SupabaseTokenResponse
  const response = NextResponse.json({
    success: true,
    redirectTo,
  })

  // Sesión extendida por defecto para reducir expiraciones percibidas por el usuario.
  const cookieMaxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 // 30d / 1d
  const refreshMaxAge = rememberMe ? 60 * 60 * 24 * 90 : 60 * 60 * 24 * 7 // 90d / 7d

  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: ACCESS_TOKEN_COOKIE,
    value: tokenPayload.access_token,
    maxAge: cookieMaxAge,
  })

  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: REFRESH_TOKEN_COOKIE,
    value: tokenPayload.refresh_token,
    maxAge: refreshMaxAge,
  })

  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: SESSION_REMEMBER_COOKIE,
    value: rememberMe ? "1" : "0",
    maxAge: refreshMaxAge,
  })

  // Evita arrastrar contexto de tenant de una sesión previa.
  response.cookies.set({
    ...COOKIE_BASE_OPTIONS,
    name: TENANT_CONTEXT_COOKIE,
    value: "",
    maxAge: 0,
  })

  return response
}
