"use server"

import { cookies } from "next/headers"

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies"
import { getSupabaseConfig } from "@/lib/auth/supabase"
import { getDefaultOrganizacionId } from "@/lib/settings/org"

type SupabaseRestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type PrimitiveParam = string | number | boolean | null | undefined

export type SupabaseRestOptions = {
  method?: SupabaseRestMethod
  searchParams?: Record<string, PrimitiveParam>
  headers?: Record<string, string | undefined>
  body?: unknown
  prefer?: string
  enforceOrganization?: boolean
}

type SupabaseRestSuccess<T> = {
  ok: true
  status: number
  data: T
  headers: Headers
}

type SupabaseRestFailure = {
  ok: false
  status?: number
  error: string
}

export type SupabaseRestResult<T> = SupabaseRestSuccess<T> | SupabaseRestFailure

export async function callSupabaseRest<T = unknown>(
  path: string,
  options: SupabaseRestOptions = {},
): Promise<SupabaseRestResult<T>> {
  const config = getSupabaseConfig()
  if (!config) {
    return {
      ok: false,
      error: "Supabase no está configurado. Define URL y anon key en el entorno.",
    }
  }

  const baseUrl = config.url.replace(/\/+$/, "")
  const sanitized = path.startsWith("/") ? path : `/${path}`
  const url = new URL(`${baseUrl}${sanitized}`)

  if (options.searchParams) {
    for (const [key, rawValue] of Object.entries(options.searchParams)) {
      if (rawValue === null || rawValue === undefined) continue
      url.searchParams.set(key, String(rawValue))
    }
  }

  if (options.enforceOrganization && !url.searchParams.has("organizacion_id")) {
    const organizacionId = getDefaultOrganizacionId()
    if (organizacionId) {
      url.searchParams.set("organizacion_id", `eq.${organizacionId}`)
    }
  }

  const method: SupabaseRestMethod = options.method ?? (options.body ? "POST" : "GET")
  const headers: Record<string, string> = {
    apikey: config.anonKey,
    ...(options.headers ?? {}),
  }
  if (options.prefer) {
    headers["Prefer"] = options.prefer
  }

  const authToken =
    (await resolveSupabaseAuthToken()) ?? resolveServiceKeyToken() ?? config.anonKey
  headers["Authorization"] = `Bearer ${authToken}`

  let body: BodyInit | undefined
  if (options.body != null && method !== "GET") {
    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData
    const isBlob = typeof Blob !== "undefined" && options.body instanceof Blob
    const isArrayBuffer = options.body instanceof ArrayBuffer
    const isUrlEncoded = options.body instanceof URLSearchParams

    if (typeof options.body === "string") {
      if (!hasHeader(headers, "Content-Type")) {
        headers["Content-Type"] = "text/plain;charset=UTF-8"
      }
      body = options.body
    } else if (isFormData || isBlob || isArrayBuffer || isUrlEncoded) {
      if (isFormData) {
        removeHeader(headers, "Content-Type")
      }
      body = options.body as BodyInit
    } else {
      if (!hasHeader(headers, "Content-Type")) {
        headers["Content-Type"] = "application/json"
      }
      body = JSON.stringify(options.body) as BodyInit
    }
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      cache: "no-store",
      ...(body ? { body } : {}),
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message || "No se pudo conectar con Supabase."
        : "No se pudo conectar con Supabase."
    return {
      ok: false,
      error: message,
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: await mapSupabaseError(response),
    }
  }

  if (response.status === 204 || method === "DELETE") {
    return {
      ok: true,
      status: response.status,
      data: ([] as unknown) as T,
      headers: response.headers,
    }
  }

  const text = await response.text()
  if (!text.length) {
    return {
      ok: true,
      status: response.status,
      data: ([] as unknown) as T,
      headers: response.headers,
    }
  }

  try {
    return {
      ok: true,
      status: response.status,
      data: JSON.parse(text) as T,
      headers: response.headers,
    }
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      error: `Respuesta inválida de Supabase: ${(error as Error).message}`,
    }
  }
}

async function resolveSupabaseAuthToken(): Promise<string | null> {
  try {
    const store = await cookies()
    return (
      store.get(ACCESS_TOKEN_COOKIE)?.value ||
      store.get("talia.access_token")?.value ||
      store.get("sb-access-token")?.value ||
      store.get("access_token")?.value ||
      null
    )
  } catch {
    return null
  }
}

function resolveServiceKeyToken(): string | null {
  const keys = [
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_SERVICE_API_KEY,
  ]
  for (const key of keys) {
    if (key && key.trim().length) {
      return key.trim()
    }
  }
  return null
}

async function mapSupabaseError(response: Response): Promise<string> {
  const text = await response.text()
  if (!text.length) {
    return `Supabase respondió ${response.status}`
  }
  try {
    const payload = JSON.parse(text) as Record<string, unknown>
    const candidates = [
      payload["message"],
      payload["error_description"],
      payload["error"],
      payload["hint"],
    ]
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length) {
        return candidate.trim()
      }
    }
  } catch {
    // Ignorar parse errors y devolver texto plano.
  }
  return text.slice(0, 400)
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase()
  return Object.keys(headers).some((key) => key.toLowerCase() === target)
}

function removeHeader(headers: Record<string, string>, name: string): void {
  const target = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      delete headers[key]
      return
    }
  }
}
